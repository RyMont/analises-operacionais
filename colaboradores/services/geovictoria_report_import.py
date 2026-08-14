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

# Cache em memória para normalizações e regex para evitar reprocessar strings repetidas
_cache_normalizar_nome = {}
_cache_re = {}

def normalizar_nome(valor):
    if valor is None:
        return ""
    val_str = str(valor)
    if val_str in _cache_normalizar_nome:
        return _cache_normalizar_nome[val_str]
    norm = unidecode(val_str).strip().upper()
    _cache_normalizar_nome[val_str] = norm
    return norm

def normalizar_cpf(cpf):
    if not cpf:
        return ""
    cpf_str = str(cpf).strip()
    if cpf_str.endswith(".0"):
        cpf_str = cpf_str[:-2]
    return "".join(filter(str.isdigit, cpf_str))

def extrair_re_do_last_name(last_name):
    if not last_name or pd.isna(last_name):
        return ""
    last_name_str = str(last_name)
    if last_name_str in _cache_re:
        return _cache_re[last_name_str]
    
    texto = normalizar_nome(last_name_str)
    resultado = re.search(r"\bRE\s*(\d+)\b", texto)
    re_val = resultado.group(1).zfill(6) if resultado else ""
    _cache_re[last_name_str] = re_val
    return re_val

def parse_datetime_val(val_fecha):
    """
    Converte valor de data/hora a partir de Timestamp, datetime, date ou string.
    Retorna tupla (date, time) ou (None, None).
    """
    if val_fecha is None or pd.isna(val_fecha):
        return None, None
    if isinstance(val_fecha, datetime):
        return val_fecha.date(), val_fecha.time()
    if isinstance(val_fecha, date):
        return val_fecha, None
    
    val_str = str(val_fecha).strip()
    if not val_str:
        return None, None
    
    formatos_dt = (
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
    )
    for fmt in formatos_dt:
        try:
            dt = datetime.strptime(val_str, fmt)
            return dt.date(), dt.time()
        except ValueError:
            continue
            
    return None, None

def importar_marcas_de_planilha(arquivo_excel, progress_callback=None):
    """
    Importa batidas do relatório de marcas da GeoVictoria (Excel) de forma otimizada para alta escala.
    
    - Filtra registros de 'Ingreso' de forma vetorizada.
    - Pre-carrega colaboradores e filiais em memória.
    - Pre-busca presenças existentes em lote (1 única query ao invés de N queries).
    - Deduplica registros da própria planilha (mantendo o menor horário de entrada do dia).
    - Executa exclusão e inserção em lotes atômicos.
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

    # Resolve nomes de colunas de forma flexível e resiliente
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
        progress_callback(20, "Filtrando registros de entrada...")

    # OTIMIZAÇÃO 1: Filtragem vetorizada antes do loop (descarta saídas/egresos instantaneamente em C)
    mask_ingreso = df[col_tipo].astype(str).str.lower().str.contains("ingreso", na=False)
    df_ingresos = df[mask_ingreso]
    total_ingresos = len(df_ingresos)

    if total_ingresos == 0:
        return {
            "total_linhas": total_linhas,
            "importados": 0,
            "erros": 0,
            "mensagem": "Nenhum registro de Entrada (Ingreso) encontrado na planilha."
        }

    if progress_callback:
        progress_callback(30, "Mapeando colaboradores e filiais...")

    # OTIMIZAÇÃO 2: Carga de mapas de lookup em memória
    colab_re_map = {
        c.re.strip(): c 
        for c in Colaborador.objects.exclude(re__isnull=True).exclude(re="").only("id", "re", "cpf")
    }

    loja_map = {
        normalizar_nome(l.nome_geovictoria): l 
        for l in Loja.objects.exclude(nome_geovictoria__isnull=True).exclude(nome_geovictoria="").only("id", "nome_geovictoria")
    }

    local_tz = timezone.get_current_timezone()

    # OTIMIZAÇÃO 3: Iteração com itertuples (15x a 20x mais rápida que iterrows)
    subset = df_ingresos[[col_apellidos, col_rut, col_fecha, col_marcacion]]
    
    registros_candidatos = []
    erros = 0

    for idx, row in enumerate(subset.itertuples(index=False)):
        if progress_callback and idx % max(1, total_ingresos // 10) == 0:
            progresso = 30 + int((idx / total_ingresos) * 40)
            progress_callback(progresso, f"Processando linha {idx + 1} de {total_ingresos}...")

        apellidos_val, rut_val, fecha_val, marcacion_val = row[0], row[1], row[2], row[3]

        # Identifica o colaborador estritamente pelo RE
        re_ext = extrair_re_do_last_name(apellidos_val)
        if not re_ext:
            continue

        colab = colab_re_map.get(re_ext)
        if not colab:
            continue

        # Identifica a filial pela Marcación
        marcacion_str = str(marcacion_val) if not pd.isna(marcacion_val) else ""
        marcacion_norm = normalizar_nome(marcacion_str)
        loja = loja_map.get(marcacion_norm)

        # Converte Data e Hora
        batida_data, batida_time = parse_datetime_val(fecha_val)
        if not batida_data or not batida_time:
            erros += 1
            continue

        # Constrói o datetime local aware
        dt_naive = datetime.combine(batida_data, batida_time)
        dt_aware = make_aware(dt_naive, timezone=local_tz)

        colab_cpf = normalizar_cpf(colab.cpf) if colab.cpf else ""
        cpf_original = colab_cpf if colab_cpf else re_ext
        if not cpf_original:
            cpf_original = "desconhecido"

        data_str = batida_data.strftime("%Y%m%d")
        hora_str = batida_time.strftime("%H%M%S")
        punch_id = f"report_{cpf_original}_{data_str}_{hora_str}"

        registros_candidatos.append({
            "colaborador_id": colab.id,
            "colaborador": colab,
            "cpf_original": cpf_original,
            "loja": loja,
            "grupo_geovictoria": marcacion_str,
            "data": batida_data,
            "data_hora": dt_aware,
            "punch_id": punch_id
        })

    if not registros_candidatos:
        return {
            "total_linhas": total_linhas,
            "importados": 0,
            "erros": erros,
            "mensagem": "Nenhuma batida válida vinculada a colaboradores cadastrados foi encontrada."
        }

    if progress_callback:
        progress_callback(75, "Deduplicando e preparando banco de dados...")

    # OTIMIZAÇÃO 4: Deduplicação em memória (mantém a primeira entrada do dia por colaborador)
    registros_unicos_map = {}
    colabs_afetados = set()
    datas_afetadas = set()
    pares_colab_data = set()

    for item in registros_candidatos:
        chave = (item["colaborador_id"], item["data"])
        if chave not in registros_unicos_map:
            registros_unicos_map[chave] = item
        else:
            # Se houver mais de uma batida de entrada no mesmo dia, mantém a com menor horário
            if item["data_hora"] < registros_unicos_map[chave]["data_hora"]:
                registros_unicos_map[chave] = item
        
        colabs_afetados.add(item["colaborador_id"])
        datas_afetadas.add(item["data"])
        pares_colab_data.add(chave)

    registros_para_criar = [
        PresencaRelogio(
            punch_id=item["punch_id"],
            colaborador=item["colaborador"],
            cpf_original=item["cpf_original"],
            loja=item["loja"],
            grupo_geovictoria=item["grupo_geovictoria"],
            data=item["data"],
            data_hora=item["data_hora"],
            origem_report=True
        )
        for item in registros_unicos_map.values()
    ]

    if progress_callback:
        progress_callback(85, "Localizando presenças antigas para substituição...")

    # OTIMIZAÇÃO 5: Pre-busca em lote de presenças existentes (1 ÚNICA QUERY em vez de dezenas de milhares)
    existentes_qs = PresencaRelogio.objects.filter(
        colaborador_id__in=colabs_afetados,
        data__in=datas_afetadas
    ).values_list("id", "colaborador_id", "data")

    # Filtra em memória em O(1) usando o set de pares exatos
    ids_presencas_para_deletar = [
        row[0] for row in existentes_qs 
        if (row[1], row[2]) in pares_colab_data
    ]

    if progress_callback:
        progress_callback(92, "Gravando registros no banco de dados...")

    # OTIMIZAÇÃO 6: Exclusão e inserção em lotes com transaction atômica
    with transaction.atomic():
        if ids_presencas_para_deletar:
            batch_size = 500
            for i in range(0, len(ids_presencas_para_deletar), batch_size):
                chunk = ids_presencas_para_deletar[i:i + batch_size]
                PresencaRelogio.objects.filter(id__in=chunk).delete()
        
        if registros_para_criar:
            PresencaRelogio.objects.bulk_create(
                registros_para_criar, 
                batch_size=1000, 
                ignore_conflicts=True
            )

    importados = len(registros_para_criar)

    if progress_callback:
        progress_callback(100, f"Importação concluída. {importados} batidas salvas/atualizadas.")

    return {
        "total_linhas": total_linhas,
        "importados": importados,
        "erros": erros,
        "mensagem": f"Sucesso: {importados} batidas de Entrada importadas/sobrepostas do relatório de marcas."
    }
