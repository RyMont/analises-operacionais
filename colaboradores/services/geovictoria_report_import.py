import logging
import re
import pandas as pd
from datetime import datetime, date, time
from django.db import transaction
from django.utils.timezone import make_aware
from unidecode import unidecode
from django.utils import timezone

from lojas.models import Loja
from colaboradores.models import Colaborador, PresencaRelogio

logger = logging.getLogger(__name__)

def normalizar_nome(valor):
    if valor is None:
        return ""
    return unidecode(str(valor)).strip().upper()

def normalizar_cpf(cpf):
    if not cpf:
        return ""
    # Remove float decimal .0 if present
    cpf_str = str(cpf).strip()
    if cpf_str.endswith(".0"):
        cpf_str = cpf_str[:-2]
    return "".join(filter(str.isdigit, cpf_str))

def extrair_re_do_last_name(last_name):
    if not last_name:
        return ""
    texto = normalizar_nome(last_name)
    resultado = re.search(r"\bRE\s*(\d+)\b", texto)
    if not resultado:
        return ""
    return resultado.group(1).zfill(6)

def importar_marcas_de_planilha(arquivo_excel, progress_callback=None):
    """
    Importa batidas do relatório de marcas da GeoVictoria (Excel).
    
    Substitui qualquer batida existente para o mesmo colaborador na mesma data.
    """
    if progress_callback:
        progress_callback(10, "Lendo dados da planilha Excel...")

    df = pd.read_excel(arquivo_excel, skiprows=2)
    total_linhas = len(df)
    
    if total_linhas == 0:
        return {
            "total_linhas": 0,
            "importados": 0,
            "erros": 0,
            "mensagem": "Planilha vazia."
        }

    # Resolve nomes de colunas de forma flexível/resiliente
    col_apellidos = next((c for c in df.columns if "apell" in str(c).lower()), None)
    col_rut = next((c for c in df.columns if "rut" in str(c).lower()), None)
    col_fecha = next((c for c in df.columns if "fecha" in str(c).lower() or "data" in str(c).lower()), None)
    col_tipo = next((c for c in df.columns if "tipo" in str(c).lower()), None)
    col_marcacion = None
    for c in df.columns:
        c_norm = unidecode(str(c)).lower()
        if "marcacion" in c_norm or "marcação" in c_norm:
            col_marcacion = c
            break
    if not col_marcacion:
        for c in df.columns:
            c_norm = unidecode(str(c)).lower()
            if "marc" in c_norm and "metodo" not in c_norm and "marcaje" not in c_norm:
                col_marcacion = c
                break

    erros_colunas = []
    if not col_apellidos: erros_colunas.append("Apellidos (RE)")
    if not col_rut: erros_colunas.append("Rut (CPF)")
    if not col_fecha: erros_colunas.append("Fecha/Data")
    if not col_tipo: erros_colunas.append("Tipo")
    if not col_marcacion: erros_colunas.append("Marcación")

    if erros_colunas:
        raise ValueError(f"Colunas obrigatórias não encontradas na planilha: {', '.join(erros_colunas)}")

    if progress_callback:
        progress_callback(25, "Mapeando colaboradores e filiais...")

    # Carga de mapas locais para performance
    colab_re_map = {}
    colab_cpf_map = {}
    for c in Colaborador.objects.all():
        if c.re:
            colab_re_map[c.re.strip()] = c
        cpf_norm = normalizar_cpf(c.cpf)
        if cpf_norm:
            colab_cpf_map[cpf_norm] = c

    loja_map = {}
    for l in Loja.objects.all():
        if l.nome_geovictoria:
            loja_map[normalizar_nome(l.nome_geovictoria)] = l

    importados = 0
    erros = 0
    
    # Processamento em lotes para melhor performance e integridade
    registros_para_criar = []
    ids_presencas_para_deletar = []

    # Obtém o fuso horário correto
    local_tz = timezone.get_current_timezone()

    for idx, row in df.iterrows():
        if progress_callback and idx % max(1, total_linhas // 10) == 0:
            progresso = 25 + int((idx / total_linhas) * 70)
            progress_callback(progresso, f"Processando linha {idx + 1} de {total_linhas}...")

        # Filtra estritamente batidas de Entrada ('Ingreso')
        tipo_str = str(row[col_tipo]).strip()
        if not tipo_str or "ingreso" not in tipo_str.lower():
            continue

        # Identifica o colaborador pelo RE (extraído de Apellidos)
        apellidos_str = str(row[col_apellidos]) if not pd.isna(row[col_apellidos]) else ""
        re_ext = extrair_re_do_last_name(apellidos_str)
        if not re_ext:
            continue

        colab = colab_re_map.get(re_ext)
        if not colab:
            continue

        # Identifica a filial pela Marcación
        marcacion_str = str(row[col_marcacion]) if not pd.isna(row[col_marcacion]) else ""
        marcacion_norm = normalizar_nome(marcacion_str)
        loja = loja_map.get(marcacion_norm)

        # Trata data e hora a partir da coluna Fecha/Data
        val_fecha = row[col_fecha]

        if pd.isna(val_fecha):
            erros += 1
            continue

        batida_data = None
        batida_time = None

        if isinstance(val_fecha, datetime):
            batida_data = val_fecha.date()
            batida_time = val_fecha.time()
        elif isinstance(val_fecha, date):
            batida_data = val_fecha
        else:
            val_fecha_str = str(val_fecha).strip()
            # Tenta formatos com data e hora combinadas
            formatos_dt = [
                "%d-%m-%Y %H:%M:%S",
                "%d-%m-%Y %H:%M",
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%d/%m/%Y %H:%M:%S",
                "%d/%m/%Y %H:%M",
                "%Y/%m/%d %H:%M:%S",
                "%Y/%m/%d %H:%M",
            ]
            for fmt in formatos_dt:
                try:
                    dt_parsed = datetime.strptime(val_fecha_str, fmt)
                    batida_data = dt_parsed.date()
                    batida_time = dt_parsed.time()
                    break
                except ValueError:
                    continue

        if not batida_data or not batida_time:
            erros += 1
            continue

        # Constrói o timezone-aware datetime local
        dt_naive = datetime.combine(batida_data, batida_time)
        dt_aware = make_aware(dt_naive, timezone=local_tz)

        # Gera ID único para o Excel report
        colab_cpf = normalizar_cpf(colab.cpf) if colab.cpf else ""
        cpf_original = colab_cpf if colab_cpf else re_ext
        if not cpf_original:
            cpf_original = "desconhecido"
        
        data_str = batida_data.strftime("%Y%m%d")
        hora_str = batida_time.strftime("%H%M%S")
        punch_id = f"report_{cpf_original}_{data_str}_{hora_str}"

        # Marca batidas existentes da mesma data e colaborador para deletar (substituição total)
        q_filter = {}
        if colab:
            q_filter["colaborador"] = colab
        else:
            q_filter["cpf_original"] = cpf_original
        q_filter["data"] = batida_data

        presencas_existentes = PresencaRelogio.objects.filter(**q_filter)
        for pe in presencas_existentes:
            ids_presencas_para_deletar.append(pe.id)

        registros_para_criar.append(
            PresencaRelogio(
                punch_id=punch_id,
                colaborador=colab,
                cpf_original=cpf_original,
                loja=loja,
                grupo_geovictoria=marcacion_str,
                data=batida_data,
                data_hora=dt_aware,
                origem_report=True
            )
        )
        importados += 1

    # Executa a limpeza e inserção no banco de dados
    if progress_callback:
        progress_callback(95, "Salvando registros no banco de dados...")

    with transaction.atomic():
        if ids_presencas_para_deletar:
            # Remove batidas antigas em lotes de 500 para evitar limite de variáveis SQL (SQLite)
            batch_size = 500
            for i in range(0, len(ids_presencas_para_deletar), batch_size):
                chunk = ids_presencas_para_deletar[i:i + batch_size]
                PresencaRelogio.objects.filter(id__in=chunk).delete()
        
        if registros_para_criar:
            # Insere as batidas do relatório garantindo integridade
            PresencaRelogio.objects.bulk_create(registros_para_criar, ignore_conflicts=True)

    if progress_callback:
        progress_callback(100, f"Importação concluída. {importados} batidas salvas/atualizadas.")

    return {
        "total_linhas": total_linhas,
        "importados": importados,
        "erros": erros,
        "mensagem": f"Sucesso: {importados} batidas importadas/sobrepostas de Entrada do relatório de marcas."
    }
