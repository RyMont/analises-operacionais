# Leitura e tratamento do CSV da folha (pandas), sem gravar no banco.
# Colunas esperadas seguem o padrão do export TOTVS usado no script legado.

import io
import re
from io import StringIO

import pandas as pd

from .folha_constants import SUBSTITUICOES_CENTRO_CUSTO, normalizar_centro_custo

MAPA_ALIAS_COLUNAS = {
    "MATRICULA": "MATRICULA",
    "MATRÍCULA": "MATRICULA",
    "RE": "MATRICULA",
    "REGISTRO": "MATRICULA",
    "CODIGO VERBA": "CODIGO VERBA",
    "CODIGO_VERBA": "CODIGO VERBA",
    "COD.VERBA": "CODIGO VERBA",
    "COD. VERBA": "CODIGO VERBA",
    "VERBA": "CODIGO VERBA",
    "COD VERBA": "CODIGO VERBA",
    "VALOR": "VALOR",
    "VALOR VERBA": "VALOR",
    "VR.VERBA": "VALOR",
    "DT.ARQ.": "DT.ARQ.",
    "DT.ARQ": "DT.ARQ.",
    "DT_ARQ": "DT.ARQ.",
    "DT ARQ": "DT.ARQ.",
    "COMPETENCIA": "DT.ARQ.",
    "COMPETÊNCIA": "DT.ARQ.",
    "DT.PAGAMENTO": "DT.PAGAMENTO",
    "DT. PAGAMENTO": "DT.PAGAMENTO",
    "DT_PAGAMENTO": "DT.PAGAMENTO",
    "DT PAGAMENTO": "DT.PAGAMENTO",
    "DATA PAGAMENTO": "DT.PAGAMENTO",
    "DATA DE PAGAMENTO": "DT.PAGAMENTO",
    "CENTRO CUSTO": "CENTRO CUSTO",
    "CENTRO_CUSTO": "CENTRO CUSTO",
    "C.CUSTO": "CENTRO CUSTO",
    "C. CUSTO": "CENTRO CUSTO",
    "CENTRO DE CUSTO": "CENTRO CUSTO",
    "CC": "CENTRO CUSTO",
}


def _normalizar_nome_coluna(nome: str) -> str:
    """Normaliza o nome da coluna para casar com os aliases conhecidos."""
    limpo = str(nome).strip().upper().replace('"', '').replace("'", "")
    if limpo in MAPA_ALIAS_COLUNAS:
        return MAPA_ALIAS_COLUNAS[limpo]
    simplificado = re.sub(r'[\s_.]+', ' ', limpo).strip()
    if simplificado in MAPA_ALIAS_COLUNAS:
        return MAPA_ALIAS_COLUNAS[simplificado]
    return limpo


def normalizar_codigo_verba(valor):
    """
    Alinha código de verba entre folha e cadastro (mesma ideia do verbas_import).
    Preserva zeros à esquerda quando vier como texto '001'.
    """
    if pd.isna(valor):
        return ""
    texto = str(valor).strip().upper()
    if texto.endswith(".0") and texto[:-2].replace("-", "").isdigit():
        texto = texto[:-2]
    return texto


def ler_csv_folha_de_texto(conteudo_texto):
    """
    Lê o CSV da folha SRD de forma robusta:
    - Suporta delimitadores vírgula (,) e ponto-e-vírgula (;)
    - Suporta UTF-8 com ou sem BOM
    - Localiza automaticamente a linha do cabeçalho
    - Trata corretamente campos entre aspas sem quebrar tokens
    - Remove colunas sem nome provenientes de terminadores extras (ex: ';;')
    """
    if not conteudo_texto or not str(conteudo_texto).strip():
        raise ValueError("O arquivo CSV está vazio.")

    conteudo_limpo = str(conteudo_texto).lstrip("\ufeff")
    linhas = conteudo_limpo.splitlines()

    termos_esperados = ["MATRICULA", "VERBA", "VALOR", "CENTRO", "PAGAMENTO"]

    header_idx = None
    delimitador_detectado = ","

    for idx, linha in enumerate(linhas[:25]):
        linha_upper = linha.upper()
        matches = sum(1 for termo in termos_esperados if termo in linha_upper)
        if matches >= 3:
            header_idx = idx
            cnt_semi = linha.count(";")
            cnt_comma = linha.count(",")
            delimitador_detectado = ";" if cnt_semi >= cnt_comma else ","
            break

    if header_idx is None:
        if len(linhas) > 2 and ("MATRICULA" in linhas[2].upper() or "VERBA" in linhas[2].upper()):
            header_idx = 2
        else:
            header_idx = 0

        first_line = linhas[header_idx] if len(linhas) > header_idx else ""
        cnt_semi = first_line.count(";")
        cnt_comma = first_line.count(",")
        delimitador_detectado = ";" if cnt_semi >= cnt_comma else ","

    linhas_dados = [l for l in linhas[header_idx:] if l.strip()]
    if not linhas_dados:
        raise ValueError("Nenhum dado encontrado no arquivo CSV após o cabeçalho.")

    texto_para_leitura = "\n".join(linhas_dados)

    try:
        df = pd.read_csv(
            StringIO(texto_para_leitura),
            sep=delimitador_detectado,
            dtype=str,
            index_col=False,
            engine="python",
            on_bad_lines="warn",
        )
    except Exception:
        df = pd.read_csv(
            StringIO(texto_para_leitura),
            sep=delimitador_detectado,
            dtype=str,
            index_col=False,
        )

    # Remove colunas vazias geradas por trailing ';' ou ';;'
    df = df.loc[:, ~df.columns.str.contains(r"^Unnamed", case=False, na=False)]
    df.columns = [_normalizar_nome_coluna(col) for col in df.columns]
    df = df.loc[:, df.columns != ""]

    return df


def tratar_folha(folha):
    """
    Converte valor numérico, normaliza código de verba e centro de custo (12 dígitos),
    aplica substituições de CC legadas.
    """
    folha = folha.copy()
    folha["VALOR"] = folha["VALOR"].str.replace(",", ".", regex=False)
    folha["VALOR"] = pd.to_numeric(folha["VALOR"], errors="coerce")
    folha["CODIGO VERBA"] = folha["CODIGO VERBA"].map(normalizar_codigo_verba)
    # Centro sempre 12 dígitos; depois troca centros migrados.
    folha["CENTRO CUSTO"] = (
        folha["CENTRO CUSTO"]
        .fillna("")
        .map(lambda x: normalizar_centro_custo(x) if str(x).strip() != "" else "")
    )
    folha["CENTRO CUSTO"] = folha["CENTRO CUSTO"].replace(SUBSTITUICOES_CENTRO_CUSTO)
    return folha


def _parse_dt_arq(series):
    """
    Converte datas de competência DT.ARQ aceitando %Y/%m, %Y-%m, %m/%Y e formatos de data completos.
    """
    d = pd.to_datetime(series, format="%Y/%m", errors="coerce")
    mask_na = d.isna() & series.notna()
    if mask_na.any():
        d[mask_na] = pd.to_datetime(series[mask_na], format="%Y-%m", errors="coerce")
    mask_na = d.isna() & series.notna()
    if mask_na.any():
        d[mask_na] = pd.to_datetime(series[mask_na], format="%m/%Y", errors="coerce")
    mask_na = d.isna() & series.notna()
    if mask_na.any():
        d[mask_na] = pd.to_datetime(series[mask_na], dayfirst=True, errors="coerce")
    return d


def preparar_folha_processada(folha):
    """
    Converte datas e mantém só as colunas necessárias para import e comparativo.
    """
    folha_processada = folha.copy()
    folha_processada["DT.PAGAMENTO"] = pd.to_datetime(
        folha_processada["DT.PAGAMENTO"],
        dayfirst=True,
        errors="coerce",
    )
    folha_processada["DT.ARQ."] = _parse_dt_arq(folha_processada["DT.ARQ."])

    folha_processada = folha_processada[
        [
            "MATRICULA",
            "CODIGO VERBA",
            "VALOR",
            "DT.ARQ.",
            "DT.PAGAMENTO",
            "CENTRO CUSTO",
        ]
    ].dropna(subset=["MATRICULA", "CODIGO VERBA", "DT.ARQ.", "DT.PAGAMENTO"])

    # Remove linhas sem valor numérico válido
    folha_processada = folha_processada.dropna(subset=["VALOR"])
    return folha_processada


def merge_com_verbas_elegiveis(folha_processada, dataframe_verbas):
    """
    Mantém só linhas cuja verba existe no cadastro de verbas enviado.
    dataframe_verbas: colunas _codigo (normalizado), verba_id, categoria
    """
    df = folha_processada.copy()
    df["_codigo"] = df["CODIGO VERBA"].map(normalizar_codigo_verba)
    merged = df.merge(
        dataframe_verbas,
        left_on="_codigo",
        right_on="_codigo",
        how="inner",
    )
    merged = merged.drop(columns=["_codigo"], errors="ignore")
    return merged
