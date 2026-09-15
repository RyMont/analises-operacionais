"""
Serviço de importação de colaboradores da TOTVS.

Este módulo processa arquivos CSV no formato proprietário da TOTVS,
onde campos são delimitados por aspas duplas e registros terminam com ";".
O formato inclui peculiaridades como:
- Aspas duplas dobradas ("") representando uma aspa literal
- Quebras de linha dentro de campos
- Cabeçalho seguido por linhas de dados com terminador ";"
"""

import csv
import logging
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from django.db import transaction
from django.db.models import Model

from colaboradores.models import Colaborador
from lojas.models import Loja
from lojas.services.folha_constants import (
    SUBSTITUICOES_CENTRO_CUSTO,
    normalizar_centro_custo,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

# Tamanho do lote para operações em massa no banco
# Ajuste conforme a memória disponível e tamanho dos registros
BATCH_SIZE = 4000

# Mapeamento: nome_interno -> nome_coluna_csv
# Mantido como constante do módulo para facilitar manutenção
MAPA_COLUNAS = {
    "re": "Matricula",
    "nome": "Nome complet",
    "cc": "C.C. Movto",
    "admissao": "Data Admis.",
    "demissao": "Dt. Demissao",
    "status": "Sit. Folha",
    "cargo": "Desc.Funcao",
    "term1": "Ven. Exper.1",
    "term2": "Vc.Exp.2Per.",
}

# Colunas obrigatórias vs opcionais para validação
COLUNAS_OBRIGATORIAS = ["re", "nome", "cc", "admissao", "status", "cargo"]
COLUNAS_OPCIONAIS = ["demissao", "term1", "term2"]

# Campos que serão atualizados no banco em operações de bulk_update
CAMPOS_BULK_UPDATE = [
    "nome",
    "loja",
    "centro_custo",
    "data_admissao",
    "data_demissao",
    "status",
    "cargo",
    "cpf",
    "termino_1",
    "termino_2",
]


# ---------------------------------------------------------------------------
# Funções auxiliares puras (sem efeitos colaterais)
# ---------------------------------------------------------------------------


def parse_data(valor: Any) -> Optional[date]:
    """
    Converte uma string de data no formato DD/MM/YYYY para objeto date.

    Lida com valores nulos, strings vazias e formatos inválidos
    retornando None em caso de impossibilidade de parsing.

    Args:
        valor: Valor bruto do CSV (pode ser str, float, None).

    Returns:
        Objeto datetime.date ou None se o valor não for uma data válida.

    Examples:
        >>> parse_data("15/03/2024")
        datetime.date(2024, 3, 15)
        >>> parse_data(None)
        None
    """
    if pd.isna(valor):
        return None

    texto = str(valor).strip()

    # Se não contém dígitos, não é uma data
    if not re.search(r"\d", texto):
        return None

    try:
        return datetime.strptime(texto, "%d/%m/%Y").date()
    except (ValueError, TypeError):
        return None


def limpar_cpf(valor: Any) -> Optional[str]:
    """
    Extrai e formata um CPF a partir de uma string com formatação variada.

    Remove todos os caracteres não numéricos e garante 11 dígitos
    com preenchimento à esquerda com zeros.

    Args:
        valor: String contendo o CPF (possivelmente com pontuação).

    Returns:
        String com 11 dígitos ou None se não houver números no valor.

    Examples:
        >>> limpar_cpf("123.456.789-00")
        "12345678900"
        >>> limpar_cpf("123")
        "00000000123"
    """
    if pd.isna(valor):
        return None

    digitos = "".join(re.findall(r"\d", str(valor)))

    if not digitos:
        return None

    return digitos.zfill(11)[-11:]


def _encontrar_coluna_cpf(colunas_disponiveis: List[str]) -> Optional[str]:
    """
    Busca a coluna de CPF no cabeçalho do CSV, que pode ter nomes variados.

    Args:
        colunas_disponiveis: Lista de nomes de colunas do arquivo.

    Returns:
        Nome exato da coluna de CPF ou None se não encontrada.
    """
    return next(
        (coluna for coluna in colunas_disponiveis if "CPF" in coluna.upper()),
        None,
    )


def _resolver_coluna_essencial(
    nome_coluna: str, colunas_disponiveis: List[str], campo: str
) -> str:
    """
    Encontra o nome real de uma coluna no CSV, permitindo pequenas variações.

    Primeiro busca o nome exato; se não encontrar, faz uma busca case-insensitive
    por substring. Isso torna o código resiliente a mudanças sutis no cabeçalho.

    Args:
        nome_coluna: Nome esperado da coluna.
        colunas_disponiveis: Lista de colunas reais do arquivo.
        campo: Nome do campo interno (para mensagem de erro).

    Returns:
        Nome real da coluna encontrada.

    Raises:
        ValueError: Se a coluna não for encontrada.
    """
    if nome_coluna in colunas_disponiveis:
        return nome_coluna

    # Busca aproximada: case-insensitive e substring
    encontrada = next(
        (c for c in colunas_disponiveis if nome_coluna.upper() in c.upper()),
        None,
    )

    if encontrada:
        logger.info(
            "Coluna '%s' mapeada para '%s' por busca aproximada",
            nome_coluna,
            encontrada,
        )
        return encontrada

    raise ValueError(
        f"Coluna essencial '{nome_coluna}' (campo '{campo}') não encontrada no CSV. "
        f"Colunas disponíveis: {colunas_disponiveis}"
    )


def _resolver_mapeamento_colunas(
    colunas_disponiveis: List[str],
) -> Dict[str, str]:
    """
    Constrói o dicionário de mapeamento final entre campos internos e colunas reais.

    Valida que todas as colunas obrigatórias existem e resolve opcionais se presentes.

    Args:
        colunas_disponiveis: Lista de colunas encontradas no cabeçalho do CSV.

    Returns:
        Dicionário mapeando nome_interno -> nome_coluna_real.

    Raises:
        ValueError: Se alguma coluna obrigatória não for encontrada.
    """
    mapa_resolvido = {}

    for campo in COLUNAS_OBRIGATORIAS:
        nome_esperado = MAPA_COLUNAS[campo]
        mapa_resolvido[campo] = _resolver_coluna_essencial(
            nome_esperado, colunas_disponiveis, campo
        )

    # Colunas opcionais: adiciona se existirem, ignora se não
    for campo in COLUNAS_OPCIONAIS:
        nome_esperado = MAPA_COLUNAS[campo]
        if nome_esperado in colunas_disponiveis:
            mapa_resolvido[campo] = nome_esperado
        else:
            logger.debug("Coluna opcional '%s' não encontrada, será ignorada", nome_esperado)

    return mapa_resolvido


def _construir_mapa_lojas() -> Dict[str, Loja]:
    """
    Cria um dicionário que mapeia centro de custo normalizado -> objeto Loja.

    Este cache em memória evita consultas repetidas ao banco durante o loop
    de processamento, que seria o maior gargalo de performance.

    Returns:
        Dicionário {centro_custo_normalizado: instância_de_Loja}.
    """
    mapa = {}
    for loja in Loja.objects.all():
        cc_normalizado = normalizar_centro_custo(loja.centro_de_custo)
        if cc_normalizado:
            mapa[cc_normalizado] = loja

    logger.info("Mapa de lojas carregado: %d lojas indexadas", len(mapa))
    return mapa


def _carregar_colaboradores_existentes() -> Dict[str, Colaborador]:
    """
    Carrega todos os colaboradores do banco em um dicionário indexado por RE.

    Esta carga única em memória transforma o que seriam milhares de consultas
    individuais ao banco em uma única query, seguida de lookups O(1) em dict.

    Returns:
        Dicionário {RE: instância_de_Colaborador}.
    """
    colaboradores = {c.re: c for c in Colaborador.objects.all()}
    logger.info("Colaboradores carregados: %d registros", len(colaboradores))
    return colaboradores


# ---------------------------------------------------------------------------
# Processamento do formato TOTVS
# ---------------------------------------------------------------------------


def _extrair_registros_totvs(conteudo_csv: str) -> List[str]:
    """
    Converte o texto bruto do CSV TOTVS em uma lista de registros limpos.

    O formato TOTVS tem as seguintes peculiaridades:
    - Campos entre aspas duplas
    - Aspas literais representadas como aspas duplas dobradas ("")
    - Registros terminados com ";"
    - Quebras de linha podem ocorrer dentro de campos

    Esta função reconstrói registros quebrados em múltiplas linhas
    e prepara cada linha para ser processada pelo csv.reader padrão.

    Args:
        conteudo_csv: String completa com o conteúdo do arquivo.

    Returns:
        Lista de strings, cada uma representando um registro CSV limpo.
    """
    linhas = conteudo_csv.splitlines()

    # Localiza onde os dados começam (primeira linha que inicia com aspas)
    inicio = 0
    for i, linha in enumerate(linhas):
        if linha.strip().startswith('"'):
            inicio = i
            break

    linhas_dados = linhas[inicio:]
    registros = []
    buffer = ""

    for linha in linhas_dados:
        buffer += linha

        # Registro completo termina com ";
        if linha.endswith('";;'):
            # Remove aspas externas e terminador
            registro = buffer.strip()
            if registro.startswith('"'):
                registro = registro[1:]
            if registro.endswith('";;'):
                registro = registro[:-3]

            # Converte aspas duplas dobradas em aspas simples
            registro = registro.replace('""', '"')
            registros.append(registro)
            buffer = ""

    # Fallback: se o formato ;; não foi detectado, tenta uma linha por registro
    if not registros and len(linhas) > 3:
        logger.warning(
            "Formato ';;' não detectado. Usando fallback linha a linha."
        )
        for i in range(3, len(linhas)):
            linha = linhas[i].strip()
            if linha.startswith('"'):
                linha = linha[1:]
            if linha.endswith('"'):
                linha = linha[:-1]
            if linha.endswith(";;"):
                linha = linha[:-2]
            registros.append(linha.replace('""', '"'))

    return registros


def _registros_para_dataframe(registros: List[str]) -> pd.DataFrame:
    """
    Converte a lista de registros CSV limpos em um DataFrame pandas.

    O primeiro registro é tratado como cabeçalho. Linhas com menos colunas
    que o cabeçalho são preenchidas com strings vazias.

    Args:
        registros: Lista de strings CSV limpas.

    Returns:
        DataFrame com os dados processados ou DataFrame vazio se não houver dados.

    Raises:
        ValueError: Se o cabeçalho estiver vazio ou malformado.
    """
    if not registros:
        return pd.DataFrame()

    # Processa cabeçalho
    leitor_header = csv.reader([registros[0]], delimiter=",", quotechar='"')
    try:
        colunas = next(leitor_header)
    except StopIteration:
        raise ValueError("Cabeçalho do CSV está vazio ou é inválido.")

    if not colunas:
        raise ValueError("Nenhuma coluna encontrada no cabeçalho do CSV.")

    # Processa linhas de dados
    dados = []
    for i in range(1, len(registros)):
        leitor_linha = csv.reader([registros[i]], delimiter=",", quotechar='"')
        try:
            valores = next(leitor_linha)
        except StopIteration:
            continue

        # Preenche colunas faltantes com string vazia
        if len(valores) < len(colunas):
            valores += [""] * (len(colunas) - len(valores))

        dados.append(dict(zip(colunas, valores)))

    df = pd.DataFrame(dados)

    # Limpeza: substitui NaN e 'nan' por string vazia e remove espaços
    for coluna in df.columns:
        df[coluna] = (
            df[coluna].fillna("").astype(str).replace("nan", "").str.strip()
        )

    return df


# ---------------------------------------------------------------------------
# Lógica de negócio: extração e atualização
# ---------------------------------------------------------------------------


def _extrair_dados_colaborador(
    linha: pd.Series,
    mapa_colunas: Dict[str, str],
    coluna_cpf: Optional[str],
    mapa_lojas: Dict[str, Loja],
) -> Optional[Dict[str, Any]]:
    """
    Extrai e normaliza os dados de um colaborador a partir de uma linha do CSV.

    Realiza todas as transformações necessárias:
    - Parse de datas
    - Limpeza de CPF
    - Resolução de loja por centro de custo
    - Aplicação de substituições de centro de custo

    Args:
        linha: Série pandas representando uma linha do CSV.
        mapa_colunas: Mapeamento campo_interno -> nome_coluna_real.
        coluna_cpf: Nome da coluna de CPF (ou None).
        mapa_lojas: Dicionário centro_custo -> Loja.

    Returns:
        Dicionário com dados normalizados ou None se o RE estiver vazio
        ou a data de admissão for inválida.
    """
    # Validação: RE é obrigatório
    re_valor = linha[mapa_colunas["re"]]
    if not re_valor:
        return None

    # Processa centro de custo
    cc_bruto = linha[mapa_colunas["cc"]]
    cc_normalizado = normalizar_centro_custo(cc_bruto)

    # Aplica substituições de centro de custo (ex: unificação de filiais)
    if cc_normalizado in SUBSTITUICOES_CENTRO_CUSTO:
        cc_normalizado = SUBSTITUICOES_CENTRO_CUSTO[cc_normalizado]

    loja = mapa_lojas.get(cc_normalizado)

    # Parse de datas
    data_admissao = parse_data(linha[mapa_colunas["admissao"]])
    if not data_admissao:
        return None  # Data de admissão é obrigatória

    data_demissao = None
    if "demissao" in mapa_colunas:
        data_demissao = parse_data(linha[mapa_colunas["demissao"]])

    termino_1 = None
    if "term1" in mapa_colunas:
        termino_1 = parse_data(linha[mapa_colunas["term1"]])

    termino_2 = None
    if "term2" in mapa_colunas:
        termino_2 = parse_data(linha[mapa_colunas["term2"]])

    # CPF
    cpf = limpar_cpf(linha[coluna_cpf]) if coluna_cpf else None

    return {
        "nome": linha[mapa_colunas["nome"]][:255],
        "loja": loja,
        "centro_custo": cc_bruto[:50],
        "data_admissao": data_admissao,
        "data_demissao": data_demissao,
        "status": linha[mapa_colunas["status"]][:100],
        "cargo": linha[mapa_colunas["cargo"]][:150],
        "cpf": cpf,
        "termino_1": termino_1,
        "termino_2": termino_2,
    }


def _verificar_mudancas(
    colaborador: Colaborador, dados_novos: Dict[str, Any]
) -> bool:
    """
    Compara os dados atuais do colaborador com os novos dados do CSV.

    Só retorna True se houver pelo menos um campo com valor diferente,
    evitando updates desnecessários no banco de dados.

    Args:
        colaborador: Instância existente do colaborador.
        dados_novos: Dicionário com os valores extraídos do CSV.

    Returns:
        True se algum campo mudou, False caso contrário.
    """
    for campo, valor_novo in dados_novos.items():
        if getattr(colaborador, campo) != valor_novo:
            return True
    return False


def _aplicar_dados_colaborador(
    colaborador: Colaborador, dados_novos: Dict[str, Any]
) -> None:
    """
    Aplica os novos dados a uma instância existente de Colaborador.

    Modifica o objeto in-place, preparando-o para bulk_update.

    Args:
        colaborador: Instância a ser atualizada.
        dados_novos: Dicionário com os novos valores.
    """
    for campo, valor in dados_novos.items():
        setattr(colaborador, campo, valor)


# ---------------------------------------------------------------------------
# Função principal (pública)
# ---------------------------------------------------------------------------


# colaborador_importacao.py

def importar_colaboradores_de_texto(conteudo_csv: str, progress_callback=None) -> Dict[str, int]:
    """
    Importa colaboradores a partir de um arquivo CSV no formato TOTVS.
    
    Args:
        conteudo_csv: String com o conteúdo completo do arquivo CSV.
        progress_callback: Função opcional que recebe (progresso: int, mensagem: str)
                          para reportar progresso durante a importação.
    """
    if not conteudo_csv:
        logger.info("Importação abortada: conteúdo CSV vazio.")
        return {"total": 0, "criados": 0, "atualizados": 0, "erros": 0}

    # Etapa 1: Parse (5% - 20%)
    if progress_callback:
        progress_callback(5, "Analisando formato TOTVS...")
    
    logger.info("Iniciando parsing do formato TOTVS...")
    registros = _extrair_registros_totvs(conteudo_csv)

    if not registros:
        logger.warning("Nenhum registro encontrado.")
        return {"total": 0, "criados": 0, "atualizados": 0, "erros": 0}

    if progress_callback:
        progress_callback(15, "Convertendo dados para tabela...")
    
    df = _registros_para_dataframe(registros)

    if df.empty:
        logger.warning("DataFrame vazio.")
        return {"total": 0, "criados": 0, "atualizados": 0, "erros": 0}

    logger.info("DataFrame criado: %d linhas, %d colunas", len(df), len(df.columns))

    # Etapa 2: Mapeamento (20% - 25%)
    if progress_callback:
        progress_callback(20, "Validando colunas do arquivo...")
    
    colunas_disponiveis = list(df.columns)
    mapa_colunas = _resolver_mapeamento_colunas(colunas_disponiveis)
    coluna_cpf = _encontrar_coluna_cpf(colunas_disponiveis)

    # Etapa 3: Cache (25% - 30%)
    if progress_callback:
        progress_callback(25, "Carregando lojas cadastradas...")
    
    mapa_lojas = _construir_mapa_lojas()
    
    if progress_callback:
        progress_callback(28, "Carregando colaboradores existentes...")
    
    colaboradores_existentes = _carregar_colaboradores_existentes()

    # Por que existe: Lista que irá armazenar os colaboradores com cargos desconsiderados (exceções) para fins de exibição na conclusão.
    excecoes: List[Dict[str, Any]] = []

    # Etapa 4: Processamento linha a linha (30% - 90%)
    estatisticas = {
        "total": len(df),
        "criados": 0,
        "atualizados": 0,
        "erros": 0,
        "excecoes": excecoes,
    }

    para_criar: List[Colaborador] = []
    para_atualizar: List[Colaborador] = []
    
    total_linhas = len(df)
    
    for idx, (_, linha) in enumerate(df.iterrows()):
        try:
            dados = _extrair_dados_colaborador(
                linha, mapa_colunas, coluna_cpf, mapa_lojas
            )

            if dados is None:
                continue

            re_valor = linha[mapa_colunas["re"]]

            # Por que existe: Identifica se o cargo é o desconsiderado ('AUXILIAR ADMINISTRAT') e coleta seus dados para a lista de exceções.
            cargo_normalizado = (dados.get("cargo") or "").strip().upper()
            if cargo_normalizado == "AUXILIAR ADMINISTRAT":
                excecoes.append({
                    "re": re_valor,
                    "nome": dados.get("nome"),
                    "cargo": dados.get("cargo"),
                    "centro_custo": dados.get("centro_custo")
                })

            colaborador_existente = colaboradores_existentes.get(re_valor)

            if colaborador_existente is None:
                para_criar.append(Colaborador(re=re_valor, **dados))
                estatisticas["criados"] += 1
            else:
                if _verificar_mudancas(colaborador_existente, dados):
                    _aplicar_dados_colaborador(colaborador_existente, dados)
                    para_atualizar.append(colaborador_existente)
                    estatisticas["atualizados"] += 1

        except Exception:
            estatisticas["erros"] += 1
            logger.exception("Erro ao processar linha do CSV")
        
        # Atualiza progresso a cada 500 linhas (evita overhead)
        if progress_callback and idx % 500 == 0:
            progresso = 30 + int((idx / total_linhas) * 60)  # 30% a 90%
            progress_callback(
                progresso,
                f"Processando colaboradores... ({idx}/{total_linhas})"
            )

    # Etapa 5: Persistência (90% - 100%)
    if progress_callback:
        progress_callback(90, "Salvando novos colaboradores no banco...")
    
    with transaction.atomic():
        if para_criar:
            Colaborador.objects.bulk_create(para_criar, batch_size=BATCH_SIZE)
            logger.info("%d colaboradores criados em lote", len(para_criar))

        if progress_callback:
            progress_callback(95, "Atualizando colaboradores existentes...")
        
        if para_atualizar:
            Colaborador.objects.bulk_update(
                para_atualizar, CAMPOS_BULK_UPDATE, batch_size=BATCH_SIZE
            )
            logger.info("%d colaboradores atualizados em lote", len(para_atualizar))

    # Etapa 6: Snapshot de Headcount Mensal por Loja (SRA)
    try:
        from lojas.services.headcount_sra import registrar_snapshot_headcount_sra
        registrar_snapshot_headcount_sra()
    except Exception:
        logger.exception("Erro ao registrar snapshot de headcount da SRA após importação")

    if progress_callback:
        progress_callback(100, "Importação concluída!")
    
    logger.info(
        "Importação concluída: total=%d, criados=%d, atualizados=%d, erros=%d",
        estatisticas["total"],
        estatisticas["criados"],
        estatisticas["atualizados"],
        estatisticas["erros"],
    )

    return estatisticas