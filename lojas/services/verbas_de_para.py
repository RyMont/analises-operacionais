import os
import json
from decimal import Decimal
from typing import Dict, Any, Optional

# Caminho do arquivo JSON permanente de De-Para
FIXTURE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "fixtures",
    "de_para_verbas.json"
)
FIXTURE_EXAMPLE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "fixtures",
    "de_para_verbas.json.example"
)

# Caminho da planilha original de verbas (configurável exclusivamente via variável de ambiente PLANILHA_VERBAS_PATH)
EXCEL_PATH = os.getenv("PLANILHA_VERBAS_PATH", "").strip()

# Cache em memória
_MAPA_DE_PARA: Optional[Dict[str, Dict[str, str]]] = None


def carregar_mapa_verbas() -> Dict[str, Dict[str, str]]:
    """
    Carrega o mapeamento de verbas a partir do JSON de fixtures.
    Se o JSON não existir, tenta gerá-lo a partir da planilha configurada na variável PLANILHA_VERBAS_PATH.
    Retorna um dicionário indexado tanto pelo código formatado (ex.: '001')
    quanto pelo código original sem zeros à esquerda (ex.: '1').
    """
    global _MAPA_DE_PARA
    if _MAPA_DE_PARA is not None:
        return _MAPA_DE_PARA

    mapa: Dict[str, Dict[str, str]] = {}

    if os.path.exists(FIXTURE_PATH):
        try:
            with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
                lista = json.load(f)
                for item in lista:
                    cod = item.get("codigo", "").strip()
                    desc = item.get("descricao", "").strip()
                    tipo = item.get("tipo", "").strip()
                    
                    dados = {
                        "codigo": cod,
                        "descricao": desc,
                        "tipo": tipo or "Provento"
                    }
                    mapa[cod] = dados
                    raw = cod.lstrip("0")
                    if raw and raw not in mapa:
                        mapa[raw] = dados
            _MAPA_DE_PARA = mapa
            return _MAPA_DE_PARA
        except Exception as e:
            print(f"Aviso ao ler {FIXTURE_PATH}: {e}")

    # Fallback se a fixture não estiver presente
    if EXCEL_PATH and os.path.exists(EXCEL_PATH):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
            ws = wb["VERBAS"]
            rows = list(ws.iter_rows(values_only=True))
            lista_para_salvar = []

            for r in rows[1:]:
                cod = r[6]
                desc = r[7]
                tipo = r[9]
                if cod is not None:
                    cod_str = str(cod).strip()
                    cod_pad = cod_str.zfill(3) if cod_str.isdigit() else cod_str
                    desc_str = str(desc).strip() if desc is not None else ""
                    tipo_raw = str(tipo).strip() if tipo is not None else ""
                    tipo_lower = tipo_raw.lower()

                    if "provento" in tipo_lower:
                        tipo_norm = "Provento"
                    elif "desconto" in tipo_lower:
                        tipo_norm = "Desconto"
                    elif "base" in tipo_lower:
                        tipo_norm = "Base"
                    else:
                        tipo_norm = tipo_raw or "Provento"

                    item = {
                        "codigo": cod_pad,
                        "descricao": desc_str,
                        "tipo": tipo_norm
                    }
                    lista_para_salvar.append(item)
                    mapa[cod_pad] = item
                    raw = cod_pad.lstrip("0")
                    if raw and raw not in mapa:
                        mapa[raw] = item

            os.makedirs(os.path.dirname(FIXTURE_PATH), exist_ok=True)
            with open(FIXTURE_PATH, "w", encoding="utf-8") as f:
                json.dump(lista_para_salvar, f, ensure_ascii=False, indent=2)

            _MAPA_DE_PARA = mapa
            return _MAPA_DE_PARA
        except Exception as e:
            print(f"Aviso ao processar planilha {EXCEL_PATH}: {e}")

    # Fallback para o arquivo .example caso nem a fixture principal nem a planilha estejam disponíveis
    if os.path.exists(FIXTURE_EXAMPLE_PATH):
        try:
            with open(FIXTURE_EXAMPLE_PATH, "r", encoding="utf-8") as f:
                lista = json.load(f)
                for item in lista:
                    cod = item.get("codigo", "").strip()
                    desc = item.get("descricao", "").strip()
                    tipo = item.get("tipo", "").strip()
                    dados = {
                        "codigo": cod,
                        "descricao": desc,
                        "tipo": tipo or "Provento"
                    }
                    mapa[cod] = dados
                    raw = cod.lstrip("0")
                    if raw and raw not in mapa:
                        mapa[raw] = dados
            _MAPA_DE_PARA = mapa
            return _MAPA_DE_PARA
        except Exception as e:
            print(f"Aviso ao ler {FIXTURE_EXAMPLE_PATH}: {e}")

    _MAPA_DE_PARA = mapa
    return _MAPA_DE_PARA


def normalizar_tipo_verba(tipo_str: str) -> str:
    """
    Normaliza a classificação contábil:
    - 'Provento', 'Proventos', 'provento' -> 'Provento'
    - 'Desconto', 'desconto' -> 'Desconto'
    - 'Base', 'BASE' -> 'Base'
    """
    t = (tipo_str or "").strip().lower()
    if "desconto" in t:
        return "Desconto"
    if "base" in t:
        return "Base"
    return "Provento"


def obter_info_verba(codigo: str, fallback_descricao: str = "", fallback_tipo: str = "Provento") -> Dict[str, str]:
    """
    Busca as informações oficiais da verba no de-para:
    - codigo (com padding)
    - descricao (Protheus Descrição)
    - tipo (Provento, Desconto, Base)
    """
    mapa = carregar_mapa_verbas()
    cod_str = str(codigo).strip()
    cod_pad = cod_str.zfill(3) if cod_str.isdigit() else cod_str

    info = mapa.get(cod_pad) or mapa.get(cod_str)
    if info:
        return {
            "codigo": cod_pad,
            "descricao": info.get("descricao") or fallback_descricao or f"Verba {cod_pad}",
            "tipo": normalizar_tipo_verba(info.get("tipo") or fallback_tipo)
        }

    return {
        "codigo": cod_pad,
        "descricao": fallback_descricao or f"Verba {cod_pad}",
        "tipo": normalizar_tipo_verba(fallback_tipo)
    }
