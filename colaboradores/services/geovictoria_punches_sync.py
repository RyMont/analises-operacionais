import logging
from datetime import datetime, date
from django.db import transaction
from django.utils.timezone import make_aware
from django.utils import timezone
from unidecode import unidecode
from colaboradores.models import Colaborador, PresencaRelogio
from lojas.models import Loja
from .geovictoria import get_token, _geovictoria_request

logger = logging.getLogger(__name__)


def normalizar_nome(valor):
    """
    Por que existe: Normaliza strings removendo acentos, convertendo para maiúsculo e removendo espaços.
    Isso é necessário para bater com o nome da loja que temos no banco.
    """
    if valor is None:
        return ""
    return unidecode(str(valor)).strip().upper()


def normalizar_cpf(cpf):
    """
    Por que existe: Limpa caracteres não numéricos do CPF para permitir cruzamento preciso.
    """
    if not cpf:
        return ""
    cpf_limpo = "".join(filter(str.isdigit, str(cpf)))
    return cpf_limpo


def sincronizar_punches_api(start_date: date, end_date: date, progress_callback=None, pagina_inicial: int = 1, loja_id=None):
    """
    Por que existe: Consome a API da GeoVictoria para buscar batidas
    de ponto eletrônico de um período usando o endpoint /Punch/ListByUsersDates. 
    Filtra os registros do tipo "Entrada", associa cada batida a um colaborador local pelo CPF e a uma loja pelo grupo,
    e persiste as novas presenças no banco de dados local.
    
    Respeita a precedência de dados: se existir um registro vindo de planilha (origem_report=True),
    ignora a gravação da batida da API correspondente.
    """
    token = get_token()
    if not token:
        raise Exception("Token da GeoVictoria não encontrado. Verifique as credenciais no arquivo .env.")

    start_str = start_date.strftime("%Y%m%d000000")
    end_str = end_date.strftime("%Y%m%d235959")

    # Mapeamento de Colaboradores por CPF limpo (como string)
    colab_map = {}
    for c in Colaborador.objects.exclude(cpf__isnull=True).exclude(cpf=""):
        cpf_norm = normalizar_cpf(c.cpf)
        if cpf_norm:
            colab_map[cpf_norm] = c

    # Mapeamento de Lojas cadastradas por nomes (geovictoria, totvs, gestao e referencia)
    loja_map = {}
    for l in Loja.objects.all():
        for campo in [l.nome_geovictoria, l.nome_totvs, l.nome_gestao, l.nome_referencia]:
            if campo:
                loja_map[normalizar_nome(campo)] = l

    # Obtém registros vindos do relatório de marcas para evitar sobrescrevê-los
    report_presencas = set(
        PresencaRelogio.objects.filter(
            data__range=(start_date, end_date),
            origem_report=True
        ).values_list("cpf_original", "data")
    )
    report_presencas_colab = set(
        PresencaRelogio.objects.filter(
            data__range=(start_date, end_date),
            origem_report=True,
            colaborador__isnull=False
        ).values_list("colaborador_id", "data")
    )

    # Coleta os CPFs dos colaboradores para consultar.
    # Se loja_id for informado, buscamos apenas colaboradores daquela loja.
    # Caso contrário (sincronização geral de ontem), buscamos de todas as lojas.
    colaboradores_queryset = Colaborador.objects.exclude(cpf__isnull=True).exclude(cpf="")
    if loja_id:
        colaboradores_queryset = colaboradores_queryset.filter(loja_gestao_id=loja_id)

    cpfs_list = []
    for c in colaboradores_queryset:
        cpf_norm = normalizar_cpf(c.cpf)
        if cpf_norm:
            cpfs_list.append(cpf_norm)

    # Se a lista de CPFs estiver vazia, não há o que sincronizar
    if not cpfs_list:
        logger.info("Nenhum colaborador com CPF encontrado para sincronização.")
        # Se loja_id, salva a última sincronização de qualquer forma
        if loja_id:
            Loja.objects.filter(id=loja_id).update(geovictoria_sincronizado_em=timezone.now())
        return {
            "paginas_lidas": 0,
            "total_analisado": 0,
            "novas_presencas_salvas": 0
        }

    # Divide os CPFs em lotes de 100 para evitar estourar o limite de tamanho do request/resposta
    batch_size = 100
    cpf_chunks = [cpfs_list[i:i + batch_size] for i in range(0, len(cpfs_list), batch_size)]

    total_batidas_processadas = 0
    total_inseridos = 0
    paginas_lidas_count = 0
    total_chunks = len(cpf_chunks)

    for idx, chunk in enumerate(cpf_chunks):
        chunk_num = idx + 1
        paginas_lidas_count += 1

        from django.core.cache import cache
        cache.set(
            "sync_punches_status",
            {
                "page": chunk_num,
                "total_pages": total_chunks,
                "msg": f"Sincronizando lote {chunk_num} de {total_chunks}..."
            },
            timeout=120
        )

        body = {
            "StartDate": start_str,
            "EndDate": end_str,
            "UserIds": ",".join(chunk)
        }

        msg = f"Consultando lote {chunk_num}/{total_chunks} com {len(chunk)} CPFs..."
        logger.info(msg)
        if progress_callback:
            progress_callback(msg)

        try:
            payload = _geovictoria_request("/AttendanceBook/PunchesByShifts", body=body, token=token)
        except Exception as e:
            logger.error(f"Erro ao buscar lote {chunk_num}: {e}")
            continue

        punches = []
        users = payload if isinstance(payload, list) else []
        for user in users:
            shifts = user.get("Shifts") or user.get("shifts") or []
            for shift in shifts:
                user_punches = shift.get("Punches") or shift.get("punches") or []
                for p in user_punches:
                    punches.append(p)

        if not punches:
            continue

        novas_presencas = []
        punch_ids_no_lote = [p.get("PunchId") for p in punches if p.get("PunchId")]

        # Filtra IDs que já existem no banco local
        existentes = set(
            PresencaRelogio.objects.filter(punch_id__in=punch_ids_no_lote)
            .values_list("punch_id", flat=True)
        )

        for p in punches:
            total_batidas_processadas += 1
            punch_id = p.get("PunchId")

            # Se a batida não tem ID ou já existe no banco local, ignora
            if not punch_id or punch_id in existentes:
                continue

            # Filtra apenas marcações do tipo Entrada no ShiftPunchType.
            shift_punch_type = str(p.get("ShiftPunchType", "")).strip()
            if shift_punch_type.lower() != "entrada":
                continue

            user_identifier = str(p.get("UserIdentifier", "")).strip()
            cpf_norm = normalizar_cpf(user_identifier)
            colab = colab_map.get(cpf_norm)

            # Determina a loja associada (atribui à loja do sistema se o colaborador for encontrado,
            # caso contrário tenta resolver pelo grupo do GeoVictoria)
            loja = None
            if colab:
                loja = colab.loja_gestao or colab.loja

            group_desc = p.get("GroupDescription") or ""
            if not loja:
                group_norm = normalizar_nome(group_desc)
                loja = loja_map.get(group_norm)

            # Se for sincronização individual de uma loja, ignora batidas de outras filiais
            if loja_id is not None:
                if not loja or loja.id != int(loja_id):
                    continue

            date_str = p.get("Date")  # Formato: YYYYMMDDHHMMSS, ex: "20260502134100"
            if not date_str or len(date_str) < 14:
                continue

            try:
                dt_naive = datetime.strptime(date_str[:14], "%Y%m%d%H%M%S")
                dt_aware = make_aware(dt_naive)
                batida_data = dt_naive.date()
            except Exception as e:
                logger.error(f"Erro ao converter data da batida {date_str}: {e}")
                continue

            # Não sobrescreve dados que vieram do relatório de marcas
            if (cpf_norm, batida_data) in report_presencas:
                continue
            if colab and (colab.id, batida_data) in report_presencas_colab:
                continue

            novas_presencas.append(
                PresencaRelogio(
                    punch_id=punch_id,
                    colaborador=colab,
                    cpf_original=user_identifier,
                    loja=loja,
                    grupo_geovictoria=group_desc,
                    data=batida_data,
                    data_hora=dt_aware,
                    origem_report=False
                )
            )

        if novas_presencas:
            with transaction.atomic():
                # ignore_conflicts=True previne erros de concorrência se a mesma batida for inserida
                PresencaRelogio.objects.bulk_create(novas_presencas, ignore_conflicts=True)
            total_inseridos += len(novas_presencas)

    from django.core.cache import cache
    cache.delete("sync_punches_status")

    # Atualiza o timestamp de última sincronização
    if loja_id:
        Loja.objects.filter(id=loja_id).update(geovictoria_sincronizado_em=timezone.now())
    else:
        Loja.objects.filter(status="ATIVA").exclude(nome_geovictoria="").update(geovictoria_sincronizado_em=timezone.now())

    return {
        "paginas_lidas": paginas_lidas_count,
        "total_analisado": total_batidas_processadas,
        "novas_presencas_salvas": total_inseridos
    }
