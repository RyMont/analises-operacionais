import json
import re
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from decouple import config

"""
Serviço de integração com a API da GeoVictoria.
Utilizado para buscar faltas e atestados de colaboradores.
"""

GEOVICTORIA_BASE_URL = "https://customerapi.geovictoria.com/api/v1"


def _geovictoria_request(endpoint, body=None, token=None):
    url = f"{GEOVICTORIA_BASE_URL}{endpoint}"
    data = json.dumps(body or {}).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}

    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # Tentar novamente com auth raw se falhar (conforme lógica do projeto antigo)
        if token and e.code == 401:
            headers["Authorization"] = token
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30) as res:
                    return json.loads(res.read().decode("utf-8"))
            except Exception:
                pass
        raise Exception(f"Erro na GeoVictoria: {e.reason} (Status {e.code})")
    except Exception as e:
        raise Exception(f"Erro de conexão com GeoVictoria: {str(e)}")


def get_token():
    user = config("GEOVICTORIA_USER", default="")
    password = config("GEOVICTORIA_PASSWORD", default="")

    if not user or not password:
        return None

    payload = _geovictoria_request("/Login", body={"User": user, "Password": password})

    # Extração flexível do token conforme projeto antigo
    token = (
        payload.get("Token")
        or payload.get("token")
        or payload.get("access_token")
        or payload.get("AccessToken")
    )

    if not token and "result" in payload:
        token = payload["result"].get("Token") or payload["result"].get("token")
    elif not token and "data" in payload:
        token = payload["data"].get("Token") or payload["data"].get("token")

    return token


def normalizar_cpf(cpf):
    """
    Por que existe: Remove pontuações e caracteres não numéricos do CPF para garantir que
    o cruzamento com a API da GeoVictoria funcione independentemente da formatação.
    """
    if not cpf:
        return ""
    return "".join(filter(str.isdigit, str(cpf)))


def get_timeoff_summary(cpfs, start_date, end_date, admissoes_dict=None):
    """
    Busca o resumo de faltas e atestados dos colaboradores na API GeoVictoria.
    
    Por que existe: Agrupa as ausências por CPF para exibição na listagem de términos,
    permitindo filtrar opcionalmente por admissões individuais para evitar contabilizar
    faltas de contratos anteriores em colaboradores readmitidos.
    """
    token = get_token()
    if not token or not cpfs:
        return {}

    def format_date(dt):
        return dt.strftime("%Y%m%d000000")

    # Mapeia CPFs normalizados para os CPFs originais para garantir busca correta na API
    cpf_list = [c.strip() for c in str(cpfs).split(',') if c.strip()]
    cpf_map = {normalizar_cpf(c): c for c in cpf_list if normalizar_cpf(c)}

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
        entries = buscar_por_cpfs(cpf_map.keys()) if cpf_map else []
    except Exception:
        # CPF com zero inicial pode gerar HTTP 400 na GeoVictoria. Trata como
        # ausência de retorno para seguir com as tentativas sem o zero inicial.
        entries = []
    cpf_original_por_consulta = dict(cpf_map)
    cpfs_respondidos = {
        normalizar_cpf(entry.get("UserIdentifier", ""))
        for entry in entries
        if normalizar_cpf(entry.get("UserIdentifier", ""))
    }

    # Alguns cadastros na GeoVictoria omitem zeros à esquerda. Para cada CPF sem
    # retorno, tenta novamente removendo somente um zero inicial por requisição.
    for cpf_original, cpf_exibicao in cpf_map.items():
        if cpf_original in cpfs_respondidos:
            continue

        cpf_tentativa = cpf_original
        while cpf_tentativa.startswith("0"):
            cpf_tentativa = cpf_tentativa[1:]
            try:
                entradas_tentativa = buscar_por_cpfs([cpf_tentativa])
            except Exception:
                continue
            cpf_original_por_consulta[cpf_tentativa] = cpf_exibicao
            entries.extend(entradas_tentativa)

            if any(
                normalizar_cpf(entry.get("UserIdentifier", "")) == cpf_tentativa
                for entry in entradas_tentativa
            ):
                break
    # Inicializa o dicionário de resultados usando as chaves dos CPFs originais solicitados
    results = {c: {"faltas": 0, "atestados": 0, "total": 0} for c in cpf_list}

    # Normaliza as chaves do dicionário de admissões caso fornecido
    admissoes_norm = {}
    if admissoes_dict:
        for k, v in admissoes_dict.items():
            norm_k = normalizar_cpf(k)
            if norm_k:
                admissoes_norm[norm_k] = v

    for entry in entries:
        # A GeoVictoria retorna o CPF no campo 'UserIdentifier'
        entry_cpf = str(entry.get("UserIdentifier", "")).strip()
        entry_cpf_norm = normalizar_cpf(entry_cpf)
        
        if not entry_cpf_norm or entry_cpf_norm not in cpf_original_por_consulta:
            continue

        original_cpf = cpf_original_por_consulta[entry_cpf_norm]
        desc = (entry.get("TimeOffTypeDescription", "") or "").upper()

        is_falta = "FALTA" in desc
        is_atestado = "ATESTADO" in desc or "MEDICO" in desc or "MÉDICO" in desc

        if not (is_falta or is_atestado):
            continue

        # Cálculo de dias (Starts e Ends são strings YYYYMMDD000000)
        starts_str = entry.get("Starts", "")[:8]
        ends_str = entry.get("Ends", "")[:8]

        try:
            start_dt = datetime.strptime(starts_str, "%Y%m%d")
            end_dt = datetime.strptime(ends_str, "%Y%m%d")
            total_period_days = (end_dt - start_dt).days + 1

            # Desmembra o período e valida dia a dia em relação à admissão do colaborador
            valid_days = 0
            for i in range(total_period_days):
                current_day = start_dt + timedelta(days=i)
                cpf_admissao = normalizar_cpf(original_cpf)
                if cpf_admissao in admissoes_norm:
                    colab_admissao = admissoes_norm[cpf_admissao]
                    if colab_admissao and current_day.date() < colab_admissao:
                        continue
                valid_days += 1

            if is_falta:
                results[original_cpf]["faltas"] += valid_days
            elif is_atestado:
                results[original_cpf]["atestados"] += valid_days

            results[original_cpf]["total"] += valid_days
        except Exception:
            if is_falta:
                results[original_cpf]["faltas"] += 1
            elif is_atestado:
                results[original_cpf]["atestados"] += 1
            results[original_cpf]["total"] += 1

    return results


def listar_usuarios_completos():
    """
    Busca a lista completa de usuários para cruzar RE e centro de custo da GeoVictoria.
    """
    token = get_token()
    if not token:
        raise Exception("Token da GeoVictoria não encontrado. Verifique usuário e senha no .env.")

    payload = _geovictoria_request("/User/ListComplete", body={}, token=token)

    if isinstance(payload, list):
        return payload

    return (
        payload.get("Users")
        or payload.get("users")
        or payload.get("Data")
        or payload.get("data")
        or payload.get("Result")
        or payload.get("result")
        or []
    )


def get_timeoff_details(cpf, start_date, end_date, admissao=None):
    """
    Busca o detalhamento de faltas e atestados para um CPF específico na GeoVictoria, retornando cada dia individualmente.

    Por que existe: Esta função realiza a integração direta com a API /TimeOff/Get
    da GeoVictoria, mapeando e desmembrando as ausências brutas de múltiplos dias em registros 
    diários individuais para melhor visualização no frontend.
    """
    token = get_token()
    if not token or not cpf:
        return []

    def format_date(dt):
        return dt.strftime("%Y%m%d000000")

    cpf_norm = normalizar_cpf(cpf)

    body = {
        "StartDate": format_date(start_date),
        "EndDate": format_date(end_date),
        "UserIds": cpf_norm if cpf_norm else str(cpf),
    }

    payload = _geovictoria_request("/TimeOff/Get", body=body, token=token)

    if isinstance(payload, list):
        entries = payload
    else:
        entries = (
            payload.get("TimeOff")
            or payload.get("timeOff")
            or payload.get("Data")
            or payload.get("data")
            or payload.get("Result")
            or payload.get("result")
            or []
        )

    details = []
    for entry in entries:
        entry_cpf = str(entry.get("UserIdentifier", "")).strip()
        entry_cpf_norm = normalizar_cpf(entry_cpf)
        
        if not entry_cpf_norm or (cpf_norm and entry_cpf_norm != cpf_norm):
            continue

        desc = (entry.get("TimeOffTypeDescription", "") or "").upper()
        
        is_falta = "FALTA" in desc
        is_atestado = "ATESTADO" in desc or "MEDICO" in desc or "MÉDICO" in desc

        if not (is_falta or is_atestado):
            continue

        starts_str = entry.get("Starts", "")
        ends_str = entry.get("Ends", "")
        
        try:
            start_dt = datetime.strptime(starts_str[:8], "%Y%m%d")
            end_dt = datetime.strptime(ends_str[:8], "%Y%m%d")
            days = (end_dt - start_dt).days + 1
            
            # Desmembra o período em dias individuais
            for i in range(days):
                current_day = start_dt + timedelta(days=i)
                if admissao and current_day.date() < admissao:
                    continue
                current_formatted = current_day.strftime("%Y-%m-%d")
                details.append({
                    "tipo": "FALTA" if is_falta else "ATESTADO",
                    "descricao": entry.get("TimeOffTypeDescription", ""),
                    "data": current_formatted,
                    "observacao": entry.get("Comment", "") or entry.get("Observacao", "") or ""
                })
        except Exception:
            # Em caso de falha de conversão, adiciona o registro com a string original de início
            details.append({
                "tipo": "FALTA" if is_falta else "ATESTADO",
                "descricao": entry.get("TimeOffTypeDescription", ""),
                "data": starts_str[:8] if len(starts_str) >= 8 else starts_str,
                "observacao": entry.get("Comment", "") or entry.get("Observacao", "") or ""
            })

    # Ordena da ausência mais antiga para a mais recente
    details.sort(key=lambda x: x["data"])
    return details

