import csv
import io
import logging
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Dict, Any, List, Optional
from colaboradores.models import Colaborador

logger = logging.getLogger(__name__)

# Por que existe: Dicionário para traduzir o código 'Tipo Resc.' do CSV do TOTVS para um motivo legível de demissão.
DICIONARIO_MOTIVOS = {
    "01": "Demitido",
    "02": "Demitido",
    "03": "Pedido de Demissão",
    "04": "Pedido de Demissão",
    "05": "Pedido de Demissão",
    "07": "Término",
    "08": "Término",
    "09": "Término",
    "11": "Falecimento",
    "12": "Justa Causa",
    "19": "Pedido de Demissão",
    "20": "Jurídico",
}

def parse_decimal_safe(val: Any, default: Decimal = Decimal("0.00")) -> Decimal:
    """
    Converte com segurança valores monetários ou numéricos do CSV (ex: '1763,54', '1.763,54', '29.33')
    para Decimal.
    """
    if val is None:
        return default
    texto = str(val).strip()
    if not texto or texto == "-" or texto == "  /  /    ":
        return default
    try:
        if "," in texto and "." in texto:
            texto = texto.replace(".", "").replace(",", ".")
        elif "," in texto:
            texto = texto.replace(",", ".")
        return Decimal(texto)
    except (ValueError, InvalidOperation, TypeError):
        return default


def importar_turnover_de_texto(conteudo_csv: str, progress_callback=None) -> Dict[str, Any]:
    """
    Processa o upload do arquivo de rescisões (sc569530.csv / sc575190.csv / terminos.csv / TOTVS SRG) de forma assíncrona.
    Mapeia os códigos de rescisão e salva no campo motivo_demissao do Colaborador, além de extrair
    bases salariais, dias de aviso indenizado e férias para estimar o valor financeiro gasto na rescisão,
    gerando relatórios de discrepâncias em comparação com a base atual.
    """
    if not conteudo_csv:
        logger.info("Importação abortada: conteúdo CSV de Turnover vazio.")
        return {
            "total": 0,
            "atualizados": 0,
            "descrepancias_csv_para_sistema": [],
            "descrepancias_sistema_para_csv": []
        }

    if progress_callback:
        progress_callback(10, "Lendo e limpando arquivo de rescisões...")

    linhas = conteudo_csv.splitlines()
    inicio = 0
    for i, linha in enumerate(linhas):
        linha_strip = linha.strip()
        if "Filial" in linha_strip or "Matricula" in linha_strip:
            inicio = i
            break

    linhas_dados = [l for l in linhas[inicio:] if l.strip()]
    if not linhas_dados:
        logger.warning("Nenhum registro extraído do arquivo.")
        return {
            "total": 0,
            "atualizados": 0,
            "descrepancias_csv_para_sistema": [],
            "descrepancias_sistema_para_csv": []
        }

    if progress_callback:
        progress_callback(20, "Mapeando colunas e cabeçalho...")

    reader = csv.reader(io.StringIO("\n".join(linhas_dados)), delimiter=",", quotechar='"')
    try:
        colunas = [c.strip() for c in next(reader) if c.strip()]
    except StopIteration:
        raise ValueError("Cabeçalho do CSV de Turnover está vazio ou é inválido.")

    def resolver_coluna(esperada, disponiveis):
        for col in disponiveis:
            if esperada.upper() in col.upper():
                return col
        raise ValueError(f"Coluna '{esperada}' não encontrada no arquivo CSV de turnover.")

    def resolver_coluna_opcional(esperada, disponiveis):
        for col in disponiveis:
            if esperada.upper() in col.upper():
                return col
        return None

    col_re = resolver_coluna("Matricula", colunas)
    col_tipo = resolver_coluna("Tipo Resc.", colunas)
    col_desc = resolver_coluna("Desc.Tp.Resc", colunas)
    col_dt = resolver_coluna("Dt. Demissao", colunas)

    # Colunas financeiras e de parâmetros adicionais do TOTVS SRG
    col_salario = resolver_coluna_opcional("Salario Mes", colunas)
    col_aviso_inde = resolver_coluna_opcional("Aviso Inde", colunas)
    col_fer_ven = resolver_coluna_opcional("Dias Fer.Ven", colunas)
    col_fer_pro = resolver_coluna_opcional("Dias Fer.Pro", colunas)
    col_fer_avi = resolver_coluna_opcional("Dias Fer Avi", colunas)

    if progress_callback:
        progress_callback(30, "Carregando base de colaboradores ativos e demitidos...")

    colaboradores_existentes = {c.re: c for c in Colaborador.objects.all()}
    re_csv_vistos = set()

    # Discrepâncias: Colaboradores no CSV que não constam no sistema ou constam como ativos
    descrepancias_csv_para_sistema = []

    para_atualizar = []
    total_linhas = len(linhas_dados) - 1
    total_processados = 0

    if progress_callback:
        progress_callback(40, "Processando linhas do CSV e calculando valores de rescisão...")

    for idx, valores in enumerate(reader, start=1):
        if not valores or not any(valores):
            continue

        total_processados += 1
        if len(valores) > len(colunas):
            valores = valores[:len(colunas)]
        elif len(valores) < len(colunas):
            valores += [""] * (len(colunas) - len(valores))

        linha_dict = dict(zip(colunas, valores))
        re_valor = linha_dict[col_re].strip()
        tipo_resc_cod = linha_dict[col_tipo].strip()
        desc_original = linha_dict[col_desc].strip()
        dt_demissao_csv = linha_dict[col_dt].strip()

        if not re_valor:
            continue

        re_csv_vistos.add(re_valor)

        # Traduz o código de rescisão (01, 02) para descrição amigável, usando a descrição original do CSV como fallback
        motivo = DICIONARIO_MOTIVOS.get(tipo_resc_cod, desc_original or "Demitido")

        # Extrai bases financeiras se presentes
        salario_val = parse_decimal_safe(linha_dict.get(col_salario)) if col_salario else None
        aviso_inde_dias = parse_decimal_safe(linha_dict.get(col_aviso_inde)) if col_aviso_inde else Decimal("0.00")
        fer_ven_dias = parse_decimal_safe(linha_dict.get(col_fer_ven)) if col_fer_ven else Decimal("0.00")
        fer_pro_dias = parse_decimal_safe(linha_dict.get(col_fer_pro)) if col_fer_pro else Decimal("0.00")
        fer_avi_dias = parse_decimal_safe(linha_dict.get(col_fer_avi)) if col_fer_avi else Decimal("0.00")

        colaborador = colaboradores_existentes.get(re_valor)
        if colaborador:
            alterado = False
            if colaborador.motivo_demissao != motivo:
                colaborador.motivo_demissao = motivo
                alterado = True

            if salario_val is not None and (
                colaborador.salario_rescisao != salario_val
                or colaborador.aviso_indenizado_dias != aviso_inde_dias
                or colaborador.ferias_vencidas_dias != fer_ven_dias
                or colaborador.ferias_proporcionais_dias != fer_pro_dias
                or colaborador.ferias_aviso_dias != fer_avi_dias
            ):
                colaborador.salario_rescisao = salario_val
                colaborador.aviso_indenizado_dias = aviso_inde_dias
                colaborador.ferias_vencidas_dias = fer_ven_dias
                colaborador.ferias_proporcionais_dias = fer_pro_dias
                colaborador.ferias_aviso_dias = fer_avi_dias
                alterado = True

            if alterado:
                para_atualizar.append(colaborador)

            # Se consta no CSV de demissões mas no sistema está Ativo/Férias (qualquer coisa diferente de 'D')
            if colaborador.status != "D":
                descrepancias_csv_para_sistema.append({
                    "re": re_valor,
                    "nome": colaborador.nome,
                    "status_sistema": colaborador.status,
                    "dt_demissao_csv": dt_demissao_csv,
                    "motivo": motivo,
                    "tipo_erro": "Ativo no Sistema"
                })
        else:
            # RE consta no CSV de demissões mas não existe de forma alguma no cadastro de colaboradores
            descrepancias_csv_para_sistema.append({
                "re": re_valor,
                "nome": "Não Cadastrado",
                "status_sistema": "Inexistente",
                "dt_demissao_csv": dt_demissao_csv,
                "motivo": motivo,
                "tipo_erro": "Inexistente no Banco"
            })

        if progress_callback and total_processados % 1000 == 0:
            progresso = 40 + int((total_processados / max(1, total_linhas)) * 45)  # 40% a 85%
            progress_callback(progresso, f"Processando linhas... ({total_processados}/{total_linhas})")

    # Discrepâncias: Colaboradores demitidos no sistema que não constam no CSV importado
    descrepancias_sistema_para_csv = []
    
    # Exclui cargo Auxiliar Administrativo para condizer com o padrão das listagens de colaboradores
    demitidos_no_banco = Colaborador.objects.filter(status="D").exclude(cargo="AUXILIAR ADMINISTRAT")
    
    for colab in demitidos_no_banco:
        if colab.re not in re_csv_vistos:
            descrepancias_sistema_para_csv.append({
                "re": colab.re,
                "nome": colab.nome,
                "data_demissao": colab.data_demissao.strftime("%d/%m/%Y") if colab.data_demissao else "-",
                "cargo": colab.cargo
            })

    if progress_callback:
        progress_callback(90, "Salvando dados e motivos de desligamento no banco...")

    if para_atualizar:
        from django.db import transaction
        with transaction.atomic():
            Colaborador.objects.bulk_update(
                para_atualizar,
                [
                    "motivo_demissao",
                    "salario_rescisao",
                    "aviso_indenizado_dias",
                    "ferias_vencidas_dias",
                    "ferias_proporcionais_dias",
                    "ferias_aviso_dias",
                ],
                batch_size=4000
            )

    if progress_callback:
        progress_callback(100, "Importação concluída com sucesso!")

    return {
        "total": total_processados,
        "atualizados": len(para_atualizar),
        "descrepancias_csv_para_sistema": descrepancias_csv_para_sistema,
        "descrepancias_sistema_para_csv": descrepancias_sistema_para_csv
    }

