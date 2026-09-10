# Docstring explicativa em português (segundo regra do usuário):
# Por que existe: Fornece a API de análise de custos por verba/rubrica individual
# para o Raio-X, permitindo filtrar por competência, loja, coordenador, supervisor,
# UF e pela própria verba (da base de verbas), com KPIs, gráficos e detalhamento.

import datetime
from decimal import Decimal
from collections import defaultdict
from io import BytesIO
from typing import List, Dict, Any

import pandas as pd
from django.db.models import Sum, Count, Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from usuarios.permissions import IsAdministrador

from lojas.models import (
    Loja,
    EscopoMensal,
    LinhaFolha,
    ResumoFolhaMensal,
    Verba,
)
from lojas.services.verbas_de_para import obter_info_verba, carregar_mapa_verbas
from lojas.views.comparativo_relatorio import (
    CENTROS_CUSTO_ESCRITORIO,
    _parse_competencia_param,
    obter_parametro_lista,
)


def _normalizar_codigo_verba(cod: str) -> str:
    """Padroniza código de verba numérica com 3 dígitos (ex: '1' -> '001')."""
    s = str(cod).strip()
    return s.zfill(3) if s.isdigit() else s


def _obter_categoria_verba(categoria_db: str, cod: str, desc: str) -> str:
    """Classifica a verba na categoria de custos do Raio-X."""
    cat_upper = (categoria_db or "").upper().strip()
    desc_upper = (desc or "").upper().strip()
    
    if "SALÁRIO" in cat_upper or "SALARIO" in cat_upper or "SALARIO" in desc_upper or "SALÁRIO" in desc_upper:
        return "Salário Base"
    if "INSALUBRIDADE" in cat_upper or "INSALUBRIDADE" in desc_upper:
        return "Insalubridade"
    if "NOTURNO" in cat_upper or "NOTURNO" in desc_upper:
        return "Adicional Noturno"
    if cat_upper:
        return categoria_db.title()
    return "Verbas Extraordinárias"


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def comparativo_verbas_opcoes_api(request):
    """
    Retorna a lista completa de verbas cadastradas na base de verbas (de-para e model)
    para preenchimento do filtro de Verba/Rubrica no frontend.
    """
    verbas_opcoes = []
    visto = set()
    
    # 1. Carrega todas as verbas da base De-Para permanente (fixtures / planilha)
    mapa_de_para = carregar_mapa_verbas()
    for cod, info in mapa_de_para.items():
        cod_pad = _normalizar_codigo_verba(cod)
        if cod_pad in visto:
            continue
        visto.add(cod_pad)
        desc = info.get("descricao") or ""
        tipo = info.get("tipo") or "Provento"
        verbas_opcoes.append({
            "value": cod_pad,
            "label": f"{cod_pad} — {desc}",
            "tipo": tipo,
            "categoria": ""
        })
        
    # 2. Complementa com quaisquer verbas cadastradas no banco de dados
    for v in Verba.objects.all().order_by("codigo_verba"):
        cod_pad = _normalizar_codigo_verba(v.codigo_verba)
        if cod_pad in visto:
            continue
        visto.add(cod_pad)
        
        info = obter_info_verba(cod_pad)
        desc = info.get("descricao") or v.descricao or ""
        tipo = info.get("tipo") or v.get_tipo_codigo_display() or "Provento"
        
        verbas_opcoes.append({
            "value": cod_pad,
            "label": f"{cod_pad} — {desc}",
            "tipo": tipo,
            "categoria": v.categoria or ""
        })
        
    # Ordena por código
    verbas_opcoes.sort(key=lambda x: x["value"])
    return Response(verbas_opcoes)


def _filtrar_linhas_folha_por_verba(request):
    """
    Função auxiliar que aplica os filtros de lojas, competências e verbas
    retornando o QuerySet de LinhaFolha filtrado e metadados.
    """
    # 1. Filtros de Lojas (respeita exclusões do escritório e lojas inativas)
    lojas_qs = Loja.objects.exclude(
        centro_de_custo__in=CENTROS_CUSTO_ESCRITORIO
    ).exclude(status="INATIVA").select_related("supervisor", "coordenador")
    
    lojas_selecionadas = obter_parametro_lista(request, "loja")
    if lojas_selecionadas:
        lojas_ids = [int(l) for l in lojas_selecionadas if l.isdigit()]
        if lojas_ids:
            lojas_qs = lojas_qs.filter(id__in=lojas_ids)
            
    supervisores = obter_parametro_lista(request, "supervisor")
    if supervisores:
        lojas_qs = lojas_qs.filter(supervisor__nome__in=supervisores)
        
    coordenadores = obter_parametro_lista(request, "coordenador")
    if coordenadores:
        lojas_qs = lojas_qs.filter(coordenador__nome__in=coordenadores)
        
    ufs = obter_parametro_lista(request, "uf")
    if ufs:
        lojas_qs = lojas_qs.filter(uf__in=[u.upper() for u in ufs])
        
    lojas_filtradas_ids = list(lojas_qs.values_list("id", flat=True))
    
    # 2. Competências (Mês/Ano)
    competencias_list = []
    periodos_selecionados = obter_parametro_lista(request, "period")
    if not periodos_selecionados:
        periodos_selecionados = obter_parametro_lista(request, "mes_ano")
        
    for val in periodos_selecionados:
        parsed = _parse_competencia_param(val)
        if parsed:
            competencias_list.append(parsed)
            
    if not competencias_list:
        # Fallback: pega a competência mais recente disponível
        competencias_set = set()
        for dt in ResumoFolhaMensal.objects.values_list("dt_arq", flat=True):
            if dt:
                competencias_set.add((dt.year, dt.month))
        if competencias_set:
            competencias_list = [sorted(list(competencias_set), reverse=True)[0]]
        else:
            competencias_list = [(datetime.date.today().year, datetime.date.today().month)]
            
    datas_exatas = [datetime.date(ano, mes, 1) for ano, mes in competencias_list]
    
    # 3. Filtro específico de Verbas selecionadas
    verbas_selecionadas = obter_parametro_lista(request, "verba")
    codigos_normalizados = []
    for cod in verbas_selecionadas:
        cod_limpo = cod.strip()
        if cod_limpo:
            codigos_normalizados.append(_normalizar_codigo_verba(cod_limpo))
            # Inclui também a versão sem zeros se for número para compatibilidade
            if cod_limpo.isdigit():
                codigos_normalizados.append(str(int(cod_limpo)))
                
    # Suporte ao parâmetro 'codigo' (usado pelo modal de detalhe da verba)
    codigo_param = request.query_params.get("codigo", "").strip()
    if codigo_param:
        cod_pad = _normalizar_codigo_verba(codigo_param)
        codigos_normalizados.append(cod_pad)
        if cod_pad.isdigit():
            codigos_normalizados.append(str(int(cod_pad)))

    # 4. QuerySet Base na LinhaFolha
    folha_qs = LinhaFolha.objects.filter(
        loja_id__in=lojas_filtradas_ids,
        dt_arq__in=datas_exatas,
        verba__tipo_codigo="PROVENTO",
    )
    
    search_termo = request.query_params.get("search", "").strip()

    # Regra de Harmonização (Opção B):
    # - Se o usuário NÃO filtrou por nenhuma verba específica nem pesquisou por texto:
    #   considera apenas verbas com considerar_na_contagem=True, batendo 100% com o Custo Real da Aba Geral.
    # - Se o usuário filtrou ou pesquisou por verbas específicas (ex: '300 - Férias'):
    #   permite auditar o valor total daquela verba independentemente da flag considerar_na_contagem.
    if codigos_normalizados:
        folha_qs = folha_qs.filter(codigo_verba__in=codigos_normalizados)
    elif search_termo:
        folha_qs = folha_qs.filter(
            Q(codigo_verba__icontains=search_termo) | Q(verba__descricao__icontains=search_termo)
        )
    else:
        folha_qs = folha_qs.filter(verba__considerar_na_contagem=True)
        
    return folha_qs, lojas_filtradas_ids, datas_exatas, competencias_list


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def comparativo_por_verba_api(request):
    """
    API analítica do Raio-X por Verba.
    Retorna os dados agrupados por rubrica com KPIs consolidados,
    distribuição para gráficos (Top 10 e Categorias) e lista analítica.
    """
    folha_qs, lojas_filtradas_ids, datas_exatas, competencias_list = _filtrar_linhas_folha_por_verba(request)
    
    if not lojas_filtradas_ids or not datas_exatas:
        return Response({
            "kpis": {
                "total_realizado": 0.0,
                "total_verbas": 0,
                "total_colaboradores": 0,
                "total_lancamentos": 0,
                "maior_verba": None
            },
            "graficos": {
                "top_verbas": [],
                "categorias": []
            },
            "resultados": []
        })
        
    # Agrupamento eficiente por código de verba
    agrupados = folha_qs.values(
        "codigo_verba",
        "verba__descricao",
        "verba__tipo_codigo",
        "verba__categoria",
    ).annotate(
        total_valor=Sum("valor"),
        qtd_linhas=Count("id"),
        qtd_lojas=Count("loja_id", distinct=True),
        qtd_colaboradores=Count("matricula", distinct=True)
    ).order_by("-total_valor")
    
    # Consolida os dados e mapeia nomes/descrições padronizadas
    total_geral = Decimal("0.00")
    linhas_processadas = []
    
    for item in agrupados:
        cod = item["codigo_verba"]
        cod_pad = _normalizar_codigo_verba(cod)
        info_de_para = obter_info_verba(cod_pad)
        
        desc = info_de_para.get("descricao") or item["verba__descricao"] or f"Verba {cod_pad}"
        tipo = info_de_para.get("tipo") or item["verba__tipo_codigo"] or "Provento"
        cat_db = item["verba__categoria"] or ""
        categoria_padrao = _obter_categoria_verba(cat_db, cod_pad, desc)
        
        valor = item["total_valor"] or Decimal("0.00")
        total_geral += valor
        
        linhas_processadas.append({
            "codigo": cod_pad,
            "descricao": desc,
            "tipo": tipo,
            "categoria": categoria_padrao,
            "total_valor": float(valor),
            "qtd_linhas": item["qtd_linhas"],
            "qtd_lojas": item["qtd_lojas"],
            "qtd_colaboradores": item["qtd_colaboradores"]
        })
        
    # Se houver duplicidade por código (ex: '1' e '001'), unifica
    linhas_unificadas_dict = {}
    for l in linhas_processadas:
        cod = l["codigo"]
        if cod not in linhas_unificadas_dict:
            linhas_unificadas_dict[cod] = l
        else:
            existente = linhas_unificadas_dict[cod]
            existente["total_valor"] += l["total_valor"]
            existente["qtd_linhas"] += l["qtd_linhas"]
            existente["qtd_lojas"] = max(existente["qtd_lojas"], l["qtd_lojas"])
            existente["qtd_colaboradores"] = max(existente["qtd_colaboradores"], l["qtd_colaboradores"])
            
    resultados = sorted(list(linhas_unificadas_dict.values()), key=lambda x: x["total_valor"], reverse=True)
    
    # Calcula percentual de cada verba no total
    total_float = float(total_geral)
    for r in resultados:
        r["percentual"] = (r["total_valor"] / total_float * 100.0) if total_float > 0 else 0.0
        
    # Métricas agregadas de categorias para o gráfico
    cat_totais = defaultdict(float)
    for r in resultados:
        cat_totais[r["categoria"]] += r["total_valor"]
        
    grafico_categorias = [
        {
            "categoria": cat,
            "valor": round(val, 2),
            "percentual": round((val / total_float * 100.0) if total_float > 0 else 0.0, 1)
        }
        for cat, val in sorted(cat_totais.items(), key=lambda x: x[1], reverse=True)
    ]
    
    # Top 10 Verbas para o Gráfico de Barras
    top_10_verbas = [
        {
            "codigo": r["codigo"],
            "nome": f"{r['codigo']} — {r['descricao']}",
            "descricao": r["descricao"],
            "valor": round(r["total_valor"], 2),
            "percentual": round(r["percentual"], 1),
            "categoria": r["categoria"]
        }
        for r in resultados[:10]
    ]
    
    # Top 10 Filiais Físicas com Maior Custo da Seleção de Verbas
    lojas_agrupadas = folha_qs.values(
        "loja_id",
        "loja__nome_referencia",
        "loja__uf",
        "loja__coordenador__nome",
        "loja__supervisor__nome",
    ).annotate(
        total_valor=Sum("valor"),
        qtd_colaboradores=Count("matricula", distinct=True),
        qtd_linhas=Count("id")
    ).order_by("-total_valor")

    top_lojas = [
        {
            "loja_id": l["loja_id"],
            "nome": l["loja__nome_referencia"] or f"Loja {l['loja_id']}",
            "uf": l["loja__uf"] or "-",
            "coordenador": l["loja__coordenador__nome"] or "-",
            "supervisor": l["loja__supervisor__nome"] or "-",
            "valor": round(float(l["total_valor"] or 0), 2),
            "percentual": round((float(l["total_valor"] or 0) / total_float * 100.0), 1) if total_float > 0 else 0.0,
            "qtd_colaboradores": l["qtd_colaboradores"],
            "qtd_linhas": l["qtd_linhas"]
        }
        for l in lojas_agrupadas
    ]

    # KPIs
    total_colab_distintos = folha_qs.values("matricula").distinct().count()
    maior_verba = top_10_verbas[0] if top_10_verbas else None
    
    response_data = {
        "kpis": {
            "total_realizado": round(total_float, 2),
            "total_verbas": len(resultados),
            "total_colaboradores": total_colab_distintos,
            "total_lancamentos": sum(r["qtd_linhas"] for r in resultados),
            "maior_verba": maior_verba
        },
        "graficos": {
            "top_verbas": top_10_verbas,
            "top_lojas": top_lojas,
            "categorias": grafico_categorias
        },
        "resultados": resultados
    }
    
    return Response(response_data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def comparativo_por_verba_detalhe_api(request):
    """
    Retorna o detalhamento específico de uma verba selecionada:
    - Agrupamento por Loja Física (quais lojas receberam e valor)
    - Agrupamento por Colaborador (matrícula, nome, loja e valor)
    """
    codigo_param = request.query_params.get("codigo", "").strip()
    if not codigo_param:
        return Response(
            {"erro": "Parâmetro 'codigo' da verba é obrigatório."},
            status=status.HTTP_400_BAD_REQUEST
        )
        
    cod_pad = _normalizar_codigo_verba(codigo_param)
    codigos_busca = [cod_pad]
    if cod_pad.isdigit():
        codigos_busca.append(str(int(cod_pad)))
        
    folha_qs, lojas_filtradas_ids, datas_exatas, _ = _filtrar_linhas_folha_por_verba(request)
    folha_verba_qs = folha_qs.filter(codigo_verba__in=codigos_busca).select_related("loja", "verba")
    
    # 1. Agrupamento por Filial Física
    lojas_agregadas = folha_verba_qs.values(
        "loja_id",
        "loja__nome_referencia",
        "loja__uf",
        "loja__coordenador__nome",
        "loja__supervisor__nome"
    ).annotate(
        total_valor=Sum("valor"),
        qtd_colaboradores=Count("matricula", distinct=True),
        qtd_linhas=Count("id")
    ).order_by("-total_valor")
    
    lojas_detalhe = [
        {
            "loja_id": l["loja_id"],
            "loja_nome": l["loja__nome_referencia"] or f"Loja {l['loja_id']}",
            "uf": l["loja__uf"] or "-",
            "coordenador": l["loja__coordenador__nome"] or "-",
            "supervisor": l["loja__supervisor__nome"] or "-",
            "total_valor": float(l["total_valor"] or 0),
            "qtd_colaboradores": l["qtd_colaboradores"],
            "qtd_linhas": l["qtd_linhas"]
        }
        for l in lojas_agregadas
    ]
    
    # 2. Agrupamento por Colaborador
    colabs_agregados = folha_verba_qs.values(
        "matricula",
        "loja__nome_referencia"
    ).annotate(
        total_valor=Sum("valor"),
        qtd_linhas=Count("id")
    ).order_by("-total_valor")
    
    # Busca nomes dos colaboradores no cadastro
    matriculas = list({c["matricula"] for c in colabs_agregados})
    from colaboradores.models import Colaborador
    nomes_dict = {
        colab.re: colab.nome
        for colab in Colaborador.objects.filter(re__in=matriculas)
    }
    
    colabs_detalhe = [
        {
            "matricula": c["matricula"],
            "nome": nomes_dict.get(c["matricula"], f"Colaborador {c['matricula']}"),
            "loja_nome": c["loja__nome_referencia"] or "-",
            "total_valor": float(c["total_valor"] or 0),
            "qtd_linhas": c["qtd_linhas"]
        }
        for c in colabs_agregados
    ]
    
    info_verba = obter_info_verba(cod_pad)
    descricao = info_verba.get("descricao") or f"Verba {cod_pad}"
    
    return Response({
        "codigo": cod_pad,
        "descricao": descricao,
        "lojas": lojas_detalhe,
        "colaboradores": colabs_detalhe
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def comparativo_por_verba_exportar_excel(request):
    """
    Exporta para planilha Excel (.xlsx) a listagem completa de verbas
    com os filtros aplicados e metadados analíticos.
    """
    folha_qs, lojas_filtradas_ids, datas_exatas, _ = _filtrar_linhas_folha_por_verba(request)
    
    agrupados = folha_qs.values(
        "codigo_verba",
        "verba__descricao",
        "verba__tipo_codigo",
        "verba__categoria",
    ).annotate(
        total_valor=Sum("valor"),
        qtd_linhas=Count("id"),
        qtd_lojas=Count("loja_id", distinct=True),
        qtd_colaboradores=Count("matricula", distinct=True)
    ).order_by("-total_valor")
    
    total_geral = sum(item["total_valor"] or Decimal("0.00") for item in agrupados)
    total_float = float(total_geral)
    
    linhas_excel = []
    for item in agrupados:
        cod_pad = _normalizar_codigo_verba(item["codigo_verba"])
        info = obter_info_verba(cod_pad)
        desc = info.get("descricao") or item["verba__descricao"] or f"Verba {cod_pad}"
        tipo = info.get("tipo") or item["verba__tipo_codigo"] or "Provento"
        cat = _obter_categoria_verba(item["verba__categoria"] or "", cod_pad, desc)
        valor = float(item["total_valor"] or 0)
        pct = (valor / total_float * 100.0) if total_float > 0 else 0.0
        
        linhas_excel.append({
            "Código": cod_pad,
            "Descrição da Verba": desc,
            "Categoria": cat,
            "Tipo": tipo,
            "Lojas Impactadas": item["qtd_lojas"],
            "Colaboradores": item["qtd_colaboradores"],
            "Total Lançamentos": item["qtd_linhas"],
            "Valor Total (R$)": valor,
            "Participação (%)": round(pct, 2)
        })
        
    df = pd.DataFrame(linhas_excel)
    
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Análise Por Verba")
        # Ajusta largura das colunas
        worksheet = writer.sheets["Análise Por Verba"]
        for col in worksheet.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = col[0].column_letter
            worksheet.column_dimensions[col_letter].width = max(max_len + 3, 12)
            
    buffer.seek(0)
    data_str = datetime.date.today().strftime("%Y-%m-%d")
    filename = f"raio_x_analise_por_verba_{data_str}.xlsx"
    
    response = HttpResponse(
        buffer.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
