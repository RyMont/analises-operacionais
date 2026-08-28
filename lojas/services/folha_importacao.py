# Orquestra import da folha: verbas no ORM, histórico de CC real, mapa de lojas e gravação.

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

import pandas as pd
from django.db import transaction

from lojas.models import LinhaFolha, Loja, Verba

from .folha_constants import CC_OPERACIONAL, CODIGO_VERBA_LOCALIZACAO

# Quantas linhas de cada tipo mostrar na tela / sessão (evita resposta gigante).
LIMITE_DETALHES_DUPLICADAS = 150
LIMITE_DETALHES_SEM_LOJA = 150
from .folha_processamento import (
    ler_csv_folha_de_texto,
    merge_com_verbas_elegiveis,
    normalizar_codigo_verba,
    preparar_folha_processada,
    tratar_folha,
)


def _normalizar_matricula(valor):
    """Evita matrícula vinda como float do pandas (ex.: 12345.0)."""
    texto = str(valor).strip()
    if texto.endswith(".0") and texto[:-2].isdigit():
        texto = texto[:-2]
    return texto


def _normalizar_valor_chave(valor):
    """Decimal com 2 casas para comparar com o que está no banco."""
    d = valor if isinstance(valor, Decimal) else Decimal(str(valor))
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _dataframe_todas_as_verbas():
    """
    Monta DataFrame de todos os proventos cadastrados para validar duplicidades,
    independentemente de entrarem ou não na contagem do escopo.
    """
    rows = list(
        Verba.objects.filter(tipo_codigo="PROVENTO").values(
            "id", "codigo_verba", "categoria"
        )
    )
    if not rows:
        return pd.DataFrame(columns=["_codigo", "verba_id", "categoria"])
    df = pd.DataFrame(rows)
    df = df.rename(columns={"id": "verba_id"})
    df["_codigo"] = df["codigo_verba"].map(normalizar_codigo_verba)
    return df[["_codigo", "verba_id", "categoria"]]


def _mapa_loja_por_centro():
    """centro_de_custo normalizado (12 dígitos) -> id da Loja."""
    from .folha_constants import normalizar_centro_custo

    m = {}
    for pk, cc in Loja.objects.values_list("id", "centro_de_custo"):
        chave = normalizar_centro_custo(cc)
        if chave and chave not in m:
            m[chave] = pk
    return m


def _carregar_historico_localizacao(matriculas):
    """
    Para cada matrícula, lista ordenada de (dt_arq, dt_pagamento, centro_custo)
    das linhas já gravadas: verba 001, CC diferente do operacional.
    Usado para inferir centro real no CC operacional (somente histórico do banco).
    """
    if not matriculas:
        return {}

    qs = (
        LinhaFolha.objects.filter(
            matricula__in=matriculas,
            codigo_verba=CODIGO_VERBA_LOCALIZACAO,
        )
        .exclude(centro_custo=CC_OPERACIONAL)
        .values_list("matricula", "dt_arq", "dt_pagamento", "centro_custo")
        .order_by("matricula", "dt_arq", "dt_pagamento")
    )

    por_matricula = defaultdict(list)
    for mat, dt_arq, dt_pag, cc in qs:
        por_matricula[mat].append((dt_arq, dt_pag, cc))
    return dict(por_matricula)


def _centro_custo_real_por_historico(
    matricula, dt_arq, dt_pagamento, centro_atual, historico
):
    """
    Se não for CC operacional, o real é o próprio centro (já 12 dígitos).
    Se for operacional, busca o último 001 no histórico estritamente anterior
    a (dt_arq, dt_pagamento) — apenas dados já persistidos no banco.
    """
    if centro_atual != CC_OPERACIONAL:
        return centro_atual

    linhas = historico.get(matricula, [])
    if not linhas:
        return centro_atual

    # Lista em ordem crescente: o último par (dt_arq, dt_pag) estritamente menor que o da linha atual vence.
    candidato = None
    for h_dt_arq, h_dt_pag, h_cc in linhas:
        if (h_dt_arq, h_dt_pag) < (dt_arq, dt_pagamento):
            candidato = h_cc
    if candidato is None:
        return centro_atual
    return candidato


def _mapa_cc_001_arquivo_por_matricula(merged, normalizar_centro_custo):
    """
    Para cada matrícula, escolhe o centro de custo da verba 001 no próprio CSV
    quando esse centro não é o operacional. Se houver mais de uma 001 no arquivo,
    usa a linha com data de pagamento mais recente (empate: data ARQ mais recente).

    Por que existe: o histórico do banco só existe após o bulk_create; no mesmo
    arquivo podem vir várias competências e a 001 “boa” precisa resolver o CC
    real antes de consultar o histórico persistido.
    """
    por_matricula = defaultdict(list)

    for _, row in merged.iterrows():
        matricula = row["_matricula"]
        if not matricula:
            continue

        codigo_v = normalizar_codigo_verba(row["CODIGO VERBA"])
        if codigo_v != CODIGO_VERBA_LOCALIZACAO:
            continue

        dt_arq = row["DT.ARQ."]
        dt_pag = row["DT.PAGAMENTO"]
        if pd.isna(dt_arq) or pd.isna(dt_pag):
            continue
        if hasattr(dt_arq, "date"):
            dt_arq = dt_arq.date()
        if hasattr(dt_pag, "date"):
            dt_pag = dt_pag.date()

        centro = str(row["CENTRO CUSTO"]).strip()
        if not centro:
            continue
        cc = normalizar_centro_custo(centro)
        if not cc or cc == CC_OPERACIONAL:
            continue

        por_matricula[matricula].append((dt_pag, dt_arq, cc))

    resultado = {}
    for matricula, candidatos in por_matricula.items():
        # Maior data de pagamento; em empate, maior DT.ARQ.
        _melhor_dt_pag, _melhor_dt_arq, melhor_cc = max(
            candidatos, key=lambda t: (t[0], t[1])
        )
        resultado[matricula] = melhor_cc

    return resultado


def _centro_custo_real_resolvido(
    matricula,
    dt_arq,
    dt_pagamento,
    centro_atual,
    historico,
    cc_001_por_matricula_arquivo,
):
    """
    Ordem: (1) se não é operacional, o real é o próprio centro;
    (2) se é operacional, usa 001 no mesmo arquivo (mapa) se houver;
    (3) senão, histórico no banco (_centro_custo_real_por_historico).
    """
    if centro_atual != CC_OPERACIONAL:
        return centro_atual

    cc_arquivo = cc_001_por_matricula_arquivo.get(matricula)
    if cc_arquivo:
        return cc_arquivo

    return _centro_custo_real_por_historico(
        matricula, dt_arq, dt_pagamento, centro_atual, historico
    )


def processar_csv_para_linhas(conteudo_utf8, arquivo_origem):
    """
    Lê CSV, aplica regras e devolve lista de dicts prontos para LinhaFolha
    (sem gravar). Levanta ValueError se faltar coluna ou não houver verbas elegíveis.
    """
    from .folha_constants import normalizar_centro_custo

    folha = ler_csv_folha_de_texto(conteudo_utf8)
    colunas_obrigatorias = {
        "VALOR",
        "CODIGO VERBA",
        "CENTRO CUSTO",
        "DT.PAGAMENTO",
        "DT.ARQ.",
        "MATRICULA",
    }
    faltando = colunas_obrigatorias - set(folha.columns.str.upper())
    if faltando:
        raise ValueError("CSV sem colunas obrigatórias: " + ", ".join(sorted(faltando)))

    folha = tratar_folha(folha)
    folha = preparar_folha_processada(folha)
    df_verbas = _dataframe_todas_as_verbas()
    if df_verbas.empty:
        raise ValueError("Importe o cadastro de verbas antes da folha.")

    merged = merge_com_verbas_elegiveis(folha, df_verbas)
    if merged.empty:
        return []

    merged["_matricula"] = merged["MATRICULA"].map(_normalizar_matricula)
    merged = merged[merged["_matricula"].str.len() > 0]
    if merged.empty:
        return []

    matriculas = merged["_matricula"].unique().tolist()
    historico = _carregar_historico_localizacao(matriculas)
    mapa_loja = _mapa_loja_por_centro()
    cc_001_por_matricula_arquivo = _mapa_cc_001_arquivo_por_matricula(
        merged, normalizar_centro_custo
    )

    linhas = []
    for _, row in merged.iterrows():
        matricula = row["_matricula"]
        if not matricula:
            continue
        dt_arq = row["DT.ARQ."]
        dt_pag = row["DT.PAGAMENTO"]
        if pd.isna(dt_arq) or pd.isna(dt_pag):
            continue
        if hasattr(dt_arq, "date"):
            dt_arq = dt_arq.date()
        if hasattr(dt_pag, "date"):
            dt_pag = dt_pag.date()

        centro = str(row["CENTRO CUSTO"]).strip()
        if not centro:
            continue
        centro = normalizar_centro_custo(centro)
        if not centro:
            continue

        cc_real = _centro_custo_real_resolvido(
            matricula,
            dt_arq,
            dt_pag,
            centro,
            historico,
            cc_001_por_matricula_arquivo,
        )
        cc_real = normalizar_centro_custo(cc_real)

        codigo_v = normalizar_codigo_verba(row["CODIGO VERBA"])
        valor = row["VALOR"]
        if pd.isna(valor):
            continue
        valor_dec = Decimal(str(valor))

        loja_id = mapa_loja.get(cc_real)

        if "categoria" in row.index and pd.notna(row["categoria"]):
            categoria_txt = str(row["categoria"]).strip()[:120]
        else:
            categoria_txt = ""

        linhas.append(
            {
                "matricula": matricula[:64],
                "verba_id": int(row["verba_id"]),
                "codigo_verba": codigo_v[:20],
                "valor": valor_dec,
                "dt_arq": dt_arq,
                "dt_pagamento": dt_pag,
                "centro_custo": centro,
                "centro_custo_real": cc_real,
                "loja_id": loja_id,
                "categoria": categoria_txt,
                "arquivo_origem": (arquivo_origem or "")[:255],
            }
        )
    return linhas


def _chave_unica(d):
    return (
        d["matricula"],
        d["verba_id"],
        _normalizar_valor_chave(d["valor"]),
        d["dt_arq"],
        d["centro_custo"],
    )


def _linha_para_detalhe_duplicada(d, motivo):
    """Converte linha lógica em dict serializável (sessão HTTP / JSON)."""
    return {
        "matricula": d["matricula"],
        "codigo_verba": d["codigo_verba"],
        "valor": str(d["valor"]),
        "dt_arq": d["dt_arq"].isoformat(),
        "dt_pagamento": d["dt_pagamento"].isoformat(),
        "centro_custo": d["centro_custo"],
        "motivo": motivo,
    }



def _linha_para_detalhe_sem_loja(d):
    return {
        "matricula": d["matricula"],
        "codigo_verba": d["codigo_verba"],
        "valor": str(d["valor"]),
        "dt_arq": d["dt_arq"].isoformat(),
        "dt_pagamento": d["dt_pagamento"].isoformat(),
        "centro_custo": d["centro_custo"],
        "centro_custo_real": d["centro_custo_real"],
    }


def importar_folha_de_texto(conteudo_utf8, arquivo_origem, dry_run=False, progress_callback=None):
    """
    Processa o CSV e grava LinhaFolha (transação única).
    Otimizado para performance com Pandas e bulk_create em lote maior.
    """
    if progress_callback:
        progress_callback(5, "Lendo e tratando CSV da folha...")

    dados = processar_csv_para_linhas(conteudo_utf8, arquivo_origem)
    if not dados:
        return {
            "processadas": 0, "gravadas": 0, "ignoradas_duplicadas": 0,
            "sem_loja": 0, "dry_run": dry_run, "detalhes_duplicadas": [],
            "detalhes_sem_loja": [], "detalhes_duplicadas_truncado": False,
            "detalhes_sem_loja_truncado": False,
        }

    if progress_callback:
        progress_callback(35, "Identificando duplicadas no arquivo...")

    # 1. Filtro em Memória com Pandas (Performance interna)
    df_dados = pd.DataFrame(dados)
    # Identifica o que é único no arquivo
    df_unicos = df_dados.drop_duplicates(
        subset=["matricula", "verba_id", "valor", "dt_arq", "centro_custo"],
        keep="first"
    )
    
    # O que sobrou são as duplicadas internas do arquivo
    df_duplicadas_arquivo = df_dados[df_dados.index.isin(df_dados.index.difference(df_unicos.index))]
    
    duplicadas_no_arquivo = len(df_duplicadas_arquivo)
    detalhes_duplicadas = []

    # Prepara duplicadas internas para detalhamento
    for _, d in df_duplicadas_arquivo.iterrows():
        if len(detalhes_duplicadas) < LIMITE_DETALHES_DUPLICADAS:
            detalhes_duplicadas.append(_linha_para_detalhe_duplicada(d, "repetida_no_mesmo_arquivo"))

    if progress_callback:
        progress_callback(55, "Comparando folha com linhas ja gravadas...")

    # 2. Busca eficiente no Banco: identifica o que já existe para não alterar nem duplicar
    matriculas = df_unicos["matricula"].unique().tolist()
    dt_arqs = [d for d in df_unicos["dt_arq"].unique().tolist() if pd.notna(d)]

    existentes = set(
        LinhaFolha.objects.filter(matricula__in=matriculas, dt_arq__in=dt_arqs)
        .values_list("matricula", "verba_id", "valor", "dt_arq", "centro_custo")
    )

    para_gravar = []
    detalhes_sem_loja = []
    ignoradas_duplicadas = duplicadas_no_arquivo
    total_unicas = len(df_unicos)

    for indice, (_, d) in enumerate(df_unicos.iterrows(), start=1):
        if progress_callback and total_unicas > 0 and indice % 1000 == 0:
            progresso = 55 + int((indice / total_unicas) * 25)
            progress_callback(progresso, f"Preparando linhas da folha... {indice}/{total_unicas}")

        k = (d["matricula"], d["verba_id"], _normalizar_valor_chave(d["valor"]), d["dt_arq"], d["centro_custo"])
        if k in existentes:
            ignoradas_duplicadas += 1
            if len(detalhes_duplicadas) < LIMITE_DETALHES_DUPLICADAS:
                detalhes_duplicadas.append(_linha_para_detalhe_duplicada(d, "ja_existia_no_banco"))
            continue

        # Sanitização do loja_id para evitar floats/NaNs implícitos do Pandas
        val_loja = d["loja_id"]
        loja_id_val = None
        if pd.notna(val_loja):
            try:
                loja_id_val = int(float(str(val_loja).strip()))
            except (ValueError, TypeError):
                pass

        if loja_id_val is None and len(detalhes_sem_loja) < LIMITE_DETALHES_SEM_LOJA:
            detalhes_sem_loja.append(_linha_para_detalhe_sem_loja(d))

        para_gravar.append(
            LinhaFolha(
                matricula=d["matricula"],
                verba_id=d["verba_id"],
                codigo_verba=d["codigo_verba"],
                valor=d["valor"],
                dt_arq=d["dt_arq"],
                dt_pagamento=d["dt_pagamento"],
                centro_custo=d["centro_custo"],
                centro_custo_real=d["centro_custo_real"],
                loja_id=loja_id_val,
                categoria=d["categoria"],
                arquivo_origem=d["arquivo_origem"],
            )
        )

    sem_loja = sum(1 for obj in para_gravar if obj.loja_id is None)

    resumo = {
        "processadas": len(dados),
        "gravadas": len(para_gravar),
        "ignoradas_duplicadas": ignoradas_duplicadas,
        "sem_loja": sem_loja,
        "dry_run": dry_run,
        "detalhes_duplicadas": detalhes_duplicadas,
        "detalhes_sem_loja": detalhes_sem_loja,
        "detalhes_duplicadas_truncado": ignoradas_duplicadas > len(detalhes_duplicadas),
        "detalhes_sem_loja_truncado": sem_loja > len(detalhes_sem_loja),
    }

    if dry_run:
        return resumo

    if progress_callback:
        progress_callback(85, "Gravando novas linhas da folha no banco...")

    # 3. Gravação em Lote Otimizada dentro de transação atômica (apenas novas linhas)
    with transaction.atomic():
        if para_gravar:
            LinhaFolha.objects.bulk_create(para_gravar, batch_size=2000)

        # Coleta os pares de (loja_id, dt_arq) do arquivo para garantir que os resumos fiquem sincronizados
        lojas_e_datas_arquivo = set()
        for _, r in df_unicos.iterrows():
            val_loja = r["loja_id"]
            if pd.notna(val_loja) and pd.notna(r["dt_arq"]):
                try:
                    loja_id_val = int(float(str(val_loja).strip()))
                    lojas_e_datas_arquivo.add((loja_id_val, r["dt_arq"]))
                except (ValueError, TypeError):
                    pass

        if lojas_e_datas_arquivo:
            recalcular_resumos_folha(list(lojas_e_datas_arquivo))

    if progress_callback:
        progress_callback(95, "Finalizando resumo da importacao SRD...")

    return resumo


def recalcular_resumos_folha(lojas_e_datas):
    """
    Por que existe: Recalcula e atualiza os valores agregados de folha para os pares (loja_id, dt_arq)
    passados, salvando em ResumoFolhaMensal. Caso não existam mais linhas válidas para o par, 
    o resumo correspondente é deletado do banco de dados.
    """
    from django.db.models import Sum, Count, Case, When, Value, DecimalField, Q
    from lojas.models import LinhaFolha, ResumoFolhaMensal
    from lojas.services.comparativo_loja import (
        CAT_FOLHA_SALARIO,
        CAT_FOLHA_INSALUBRIDADE,
        CAT_FOLHA_ADICIONAL_NOTURNO,
        _q_categoria_um_dos,
    )

    q_filter = Q()
    for loja_id, dt_arq in lojas_e_datas:
        if loja_id is not None and dt_arq is not None:
            q_filter |= Q(loja_id=loja_id, dt_arq=dt_arq)

    if not q_filter:
        return

    # Filtra apenas verbas marcadas para entrar na conta (Provento e Considerar)
    folha_qs = (
        LinhaFolha.objects.filter(q_filter)
        .filter(verba__tipo_codigo="PROVENTO", verba__considerar_na_contagem=True)
    )

    q_salario = _q_categoria_um_dos(CAT_FOLHA_SALARIO)
    q_insalubridade = _q_categoria_um_dos(CAT_FOLHA_INSALUBRIDADE)
    q_adicional_noturno = _q_categoria_um_dos(CAT_FOLHA_ADICIONAL_NOTURNO)
    q_extraordinarias = ~q_salario & ~q_insalubridade & ~q_adicional_noturno

    agregados = (
        folha_qs.values("loja_id", "dt_arq")
        .annotate(
            valor_total=Sum("valor"),
            linhas_count=Count("id"),
            valor_salario=Sum(
                Case(
                    When(q_salario, then="valor"),
                    default=Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            ),
            valor_insalubridade=Sum(
                Case(
                    When(q_insalubridade, then="valor"),
                    default=Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            ),
            valor_adicional_noturno=Sum(
                Case(
                    When(q_adicional_noturno, then="valor"),
                    default=Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            ),
            valor_verbas_extraordinarias=Sum(
                Case(
                    When(q_extraordinarias, then="valor"),
                    default=Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            ),
        )
    )

    atualizados = set()
    for agg in agregados:
        loja_id = agg["loja_id"]
        dt_arq = agg["dt_arq"]

        ResumoFolhaMensal.objects.update_or_create(
            loja_id=loja_id,
            dt_arq=dt_arq,
            defaults={
                "valor_total": agg["valor_total"] or Decimal("0.00"),
                "linhas_count": agg["linhas_count"] or 0,
                "valor_salario": agg["valor_salario"] or Decimal("0.00"),
                "valor_insalubridade": agg["valor_insalubridade"] or Decimal("0.00"),
                "valor_adicional_noturno": agg["valor_adicional_noturno"] or Decimal("0.00"),
                "valor_verbas_extraordinarias": agg["valor_verbas_extraordinarias"] or Decimal("0.00"),
            },
        )
        atualizados.add((loja_id, dt_arq))

    # Deleta resumos se as linhas associadas sumiram
    for loja_id, dt_arq in lojas_e_datas:
        if (loja_id, dt_arq) not in atualizados:
            ResumoFolhaMensal.objects.filter(loja_id=loja_id, dt_arq=dt_arq).delete()


def recalcular_todo_historico():
    """
    Por que existe: Recalcula do zero os resumos de folha para todas as lojas e datas de competência 
    existentes no banco de dados. Usado principalmente durante migrações ou scripts de correção.
    """
    from django.db.models import Sum, Count, Case, When, Value, DecimalField
    from lojas.models import LinhaFolha, ResumoFolhaMensal
    from lojas.services.comparativo_loja import (
        CAT_FOLHA_SALARIO,
        CAT_FOLHA_INSALUBRIDADE,
        CAT_FOLHA_ADICIONAL_NOTURNO,
        _q_categoria_um_dos,
    )

    # Limpa tabela existente
    ResumoFolhaMensal.objects.all().delete()

    folha_qs = LinhaFolha.objects.filter(
        verba__tipo_codigo="PROVENTO",
        verba__considerar_na_contagem=True,
        loja__isnull=False,
    )

    q_salario = _q_categoria_um_dos(CAT_FOLHA_SALARIO)
    q_insalubridade = _q_categoria_um_dos(CAT_FOLHA_INSALUBRIDADE)
    q_adicional_noturno = _q_categoria_um_dos(CAT_FOLHA_ADICIONAL_NOTURNO)
    q_extraordinarias = ~q_salario & ~q_insalubridade & ~q_adicional_noturno

    agregados = (
        folha_qs.values("loja_id", "dt_arq")
        .annotate(
            valor_total=Sum("valor"),
            linhas_count=Count("id"),
            valor_salario=Sum(
                Case(
                    When(q_salario, then="valor"),
                    default=Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            ),
            valor_insalubridade=Sum(
                Case(
                    When(q_insalubridade, then="valor"),
                    default=Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            ),
            valor_adicional_noturno=Sum(
                Case(
                    When(q_adicional_noturno, then="valor"),
                    default=Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            ),
            valor_verbas_extraordinarias=Sum(
                Case(
                    When(q_extraordinarias, then="valor"),
                    default=Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            ),
        )
    )

    resumos_para_criar = []
    for agg in agregados:
        resumos_para_criar.append(
            ResumoFolhaMensal(
                loja_id=agg["loja_id"],
                dt_arq=agg["dt_arq"],
                valor_total=agg["valor_total"] or Decimal("0.00"),
                linhas_count=agg["linhas_count"] or 0,
                valor_salario=agg["valor_salario"] or Decimal("0.00"),
                valor_insalubridade=agg["valor_insalubridade"] or Decimal("0.00"),
                valor_adicional_noturno=agg["valor_adicional_noturno"] or Decimal("0.00"),
                valor_verbas_extraordinarias=agg["valor_verbas_extraordinarias"] or Decimal("0.00"),
            )
        )

    if resumos_para_criar:
        ResumoFolhaMensal.objects.bulk_create(resumos_para_criar, batch_size=2000)

