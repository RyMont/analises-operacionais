import logging
from datetime import date, datetime, timedelta
from django.db import transaction
from django.core.cache import cache
from colaboradores.models import Colaborador, Ausencia
from .geovictoria import get_token, _geovictoria_request, normalizar_cpf

logger = logging.getLogger(__name__)

CACHE_KEY_GEOVICTORIA_PROGRESS = "geovictoria_sync_progress"


def get_progresso_sync():
    """
    Por que existe: Retorna o status de progresso atual da sincronização de ausências em background para o frontend.
    """
    return cache.get(CACHE_KEY_GEOVICTORIA_PROGRESS)


def set_progresso_sync(progresso: int, mensagem: str, status: str = "processing"):
    """
    Por que existe: Atualiza o progresso da sincronização de ausências no cache para consulta em tempo real.
    """
    cache.set(
        CACHE_KEY_GEOVICTORIA_PROGRESS,
        {
            "status": status,
            "progress": progresso,
            "message": mensagem,
        },
        timeout=600,
    )



def sincronizar_ausencias_api(start_date: date, end_date: date, progress_callback=None):
    """
    Por que existe: Busca faltas, atestados e suspensões dos colaboradores ativos da gestão
    na API GeoVictoria no período informado e os salva de forma individualizada por dia.
    Garante a conformidade ao desmembrar períodos de afastamento e otimizar queries com bulk upsert.
    """
    token = get_token()
    if not token:
        raise Exception("Token da GeoVictoria não encontrado. Verifique usuário e senha no .env.")

    # Busca apenas colaboradores que não estão demitidos na gestão e que possuem CPF
    colaboradores = Colaborador.objects.exclude(
        status_gestao__icontains="DEMITIDO"
    ).exclude(
        cpf__isnull=True
    ).exclude(
        cpf=""
    )

    # Mapeia CPFs normalizados para as instâncias de Colaborador
    colab_map = {}
    for colab in colaboradores:
        norm_cpf = normalizar_cpf(colab.cpf)
        if norm_cpf:
            colab_map[norm_cpf] = colab

    cpf_list = list(colab_map.keys())
    total_colabs = len(cpf_list)

    if total_colabs == 0:
        if progress_callback:
            progress_callback(100, "Nenhum colaborador ativo com CPF encontrado para sincronizar.")
        return {"total_colaboradores": 0, "novas": 0, "atualizadas": 0}

    if progress_callback:
        progress_callback(0, f"Iniciando sincronização de ausências para {total_colabs} colaboradores...")

    def format_date(dt):
        return dt.strftime("%Y%m%d000000")

    chunk_size = 500
    total_chunks = (total_colabs + chunk_size - 1) // chunk_size
    
    total_novas = 0
    total_atualizadas = 0

    for chunk_idx in range(0, total_colabs, chunk_size):
        chunk_cpfs = cpf_list[chunk_idx : chunk_idx + chunk_size]
        
        cpf_colab_map_lote = {cpf: colab_map[cpf] for cpf in chunk_cpfs}

        def extrair_entradas(payload):
            if isinstance(payload, list):
                return payload
            return (
                payload.get("TimeOff")
                or payload.get("timeOff")
                or payload.get("Data")
                or payload.get("data")
                or payload.get("Result")
                or payload.get("result")
                or []
            )

        def buscar_por_cpfs(cpfs_consulta):
            body = {
                "StartDate": format_date(start_date),
                "EndDate": format_date(end_date),
                "UserIds": ",".join(cpfs_consulta),
            }
            payload = _geovictoria_request("/TimeOff/Get", body=body, token=token)
            return extrair_entradas(payload)

        try:
            try:
                entries = buscar_por_cpfs(chunk_cpfs)
            except Exception as exc:
                logger.warning(
                    "Erro no lote completo da GeoVictoria; repetindo CPFs sem zero inicial: %s",
                    exc,
                )
                cpfs_sem_zero_inicial = [cpf for cpf in chunk_cpfs if not cpf.startswith("0")]
                entries = buscar_por_cpfs(cpfs_sem_zero_inicial) if cpfs_sem_zero_inicial else []

            cpfs_respondidos = {
                normalizar_cpf(entry.get("UserIdentifier", ""))
                for entry in entries
                if normalizar_cpf(entry.get("UserIdentifier", ""))
            }

            # Aplica fallback somente aos CPFs iniciados em zero e sem retorno.
            # Agrupa as consultas para não criar uma requisição por colaborador.
            cpfs_fallback = {}
            for cpf_original in chunk_cpfs:
                if cpf_original in cpfs_respondidos or not cpf_original.startswith("0"):
                    continue

                cpf_tentativa = cpf_original.lstrip("0")
                if cpf_tentativa:
                    cpf_colab_map_lote[cpf_tentativa] = colab_map[cpf_original]
                    cpfs_fallback[cpf_tentativa] = colab_map[cpf_original]

            for fallback_idx in range(0, len(cpfs_fallback), chunk_size):
                cpfs_tentativa = list(cpfs_fallback.keys())[fallback_idx : fallback_idx + chunk_size]
                try:
                    entries.extend(buscar_por_cpfs(cpfs_tentativa))
                except Exception as exc:
                    logger.warning(
                        "Consulta de fallback GeoVictoria falhou para lote de CPFs: %s",
                        exc,
                    )
            # Lista temporária de ausências processadas no lote atual
            ausencias_lote = []

            for entry in entries:
                entry_cpf = str(entry.get("UserIdentifier", "")).strip()
                entry_cpf_norm = normalizar_cpf(entry_cpf)
                
                if not entry_cpf_norm or entry_cpf_norm not in cpf_colab_map_lote:
                    continue
                
                colab = cpf_colab_map_lote[entry_cpf_norm]
                desc = (entry.get("TimeOffTypeDescription", "") or "").upper()

                # Classificação do tipo de ausência
                tipo = None
                if "FALTA" in desc:
                    tipo = "falta"
                elif "ATESTADO" in desc or "MEDICO" in desc or "MÉDICO" in desc:
                    tipo = "atestado"
                elif "SUSPEN" in desc or "SUSPENSAO" in desc or "SUSPENSÃO" in desc:
                    tipo = "suspensao"

                if not tipo:
                    continue

                starts_str = entry.get("Starts", "")[:8]
                ends_str = entry.get("Ends", "")[:8]
                try:
                    start_dt = datetime.strptime(starts_str, "%Y%m%d").date()
                    end_dt = datetime.strptime(ends_str, "%Y%m%d").date()
                    
                    # Gera os dias individuais
                    days_count = (end_dt - start_dt).days + 1
                    for d_offset in range(days_count):
                        current_day = start_dt + timedelta(days=d_offset)
                        
                        # Ignora dias anteriores à data de admissão do colaborador
                        if colab.data_admissao and current_day < colab.data_admissao:
                            continue
                        
                        ausencias_lote.append({
                            "colaborador": colab,
                            "data": current_day,
                            "tipo": tipo,
                            "descricao": entry.get("TimeOffTypeDescription", "") or "",
                        })
                except Exception as e:
                    logger.error(f"Erro ao processar período de ausência para o CPF {entry_cpf}: {e}")

            # Dedup do lote atual (garante um registro por colaborador e data)
            dedup = {}
            for aus in ausencias_lote:
                key = (aus["colaborador"].id, aus["data"])
                # Se houver sobreposição no lote, mantém o atestado/suspensão como preferencial a falta
                if key in dedup:
                    existing_tipo = dedup[key]["tipo"]
                    if existing_tipo == "falta" and aus["tipo"] in ("atestado", "suspensao"):
                        dedup[key] = aus
                else:
                    dedup[key] = aus

            if dedup:
                # Otimização de salvamento (Bulk Upsert)
                colab_ids_lote = list(set(k[0] for k in dedup.keys()))
                datas_lote = [k[1] for k in dedup.keys()]
                min_data = min(datas_lote)
                max_data = max(datas_lote)

                existing_records = Ausencia.objects.filter(
                    colaborador_id__in=colab_ids_lote,
                    data__range=(min_data, max_data)
                )
                existing_map = {(rec.colaborador_id, rec.data): rec for rec in existing_records}

                to_create = []
                to_update = []

                for key, val in dedup.items():
                    existing = existing_map.get(key)
                    if existing:
                        has_changed = (
                            existing.tipo != val["tipo"]
                            or existing.descricao != val["descricao"]
                        )
                        if has_changed:
                            existing.tipo = val["tipo"]
                            existing.descricao = val["descricao"]
                            to_update.append(existing)
                    else:
                        to_create.append(
                            Ausencia(
                                colaborador=val["colaborador"],
                                data=val["data"],
                                tipo=val["tipo"],
                                descricao=val["descricao"],
                            )
                        )

                with transaction.atomic():
                    if to_create:
                        Ausencia.objects.bulk_create(to_create, batch_size=500)
                        total_novas += len(to_create)
                    if to_update:
                        Ausencia.objects.bulk_update(
                            to_update,
                            fields=["tipo", "descricao"],
                            batch_size=500
                        )
                        total_atualizadas += len(to_update)

        except Exception as e:
            logger.error(f"Erro ao sincronizar lote de ausências: {e}")
            if progress_callback:
                progress_callback(
                    int(((chunk_idx // chunk_size) + 1) / total_chunks * 90),
                    f"Erro no lote {(chunk_idx // chunk_size) + 1}: {str(e)}"
                )

        if progress_callback:
            chunk_num = (chunk_idx // chunk_size) + 1
            progresso = int((chunk_num / total_chunks) * 90)
            progress_callback(
                progresso,
                f"Sincronizando lote {chunk_num}/{total_chunks}... ({total_novas} novas, {total_atualizadas} atualizadas)"
            )

    if progress_callback:
        progress_callback(100, f"Sincronização concluída com sucesso! Total de {total_novas} novas ausências salvas.")

    return {
        "total_colaboradores": total_colabs,
        "novas": total_novas,
        "atualizadas": total_atualizadas,
    }
