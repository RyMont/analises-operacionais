# Docstring explicativa em português (segundo regra do usuário):
# Por que existe: Fornece um relatório consolidado e paginado no estilo BI comparando
# os valores orçados (escopo) com os realizados (folha de pagamento) com filtros avançados.

import datetime
from decimal import Decimal
from collections import defaultdict
from io import BytesIO
from typing import List
import time
import pandas as pd
from django.db.models import Q, Sum, Subquery, OuterRef
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from usuarios.permissions import IsAdministrador

from lojas.models import (
    Loja,
    EscopoMensal,
    ItemEscopoMensal,
    LinhaFolha,
    ResumoFolhaMensal,
    ConfiguracaoInsalubridadeLoja,
    obter_ou_criar_config_insalubridade_loja,
    escala_insalubridade_fixa_para_escopo,
    montar_caches_salario_para_itens,
)
from lojas.serializers import LojaSerializer

_FILTROS_CACHE = None
_FILTROS_CACHE_TIME = 0.0
CACHE_EXPIRATION_SECONDS = 300.0  # 5 minutos

# Lista de centros de custo que pertencem ao escritório central e não possuem orçamento (escopo) planejado.
# Por que existe: Permite desconsiderar apenas estes 3 centros específicos do escritório na análise de custos (Raio-X),
# mantendo as demais equipes de apoio e volantes que também têm centro de custo iniciado em 99999999.
CENTROS_CUSTO_ESCRITORIO = [
    "999999990010",  # ADMINISTRATIVO & FINANCEIRO
    "999999990020",  # RECURSOS HUMANOS
    "999999990050",  # OPERACIONAL (Escritório)
]



def _nome_mes(mes: int) -> str:
    """Retorna o nome por extenso do mês."""
    meses = {
        1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
        5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
        9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
    }
    return meses.get(mes, str(mes))

def _parse_competencia_param(texto: str):
    """Lê '2026-3' ou '2026-03' -> (2026, 3)."""
    if not texto or not isinstance(texto, str):
        return None
    partes = texto.strip().split("-", 1)
    if len(partes) != 2:
        return None
    try:
        ano = int(partes[0])
        mes = int(partes[1])
        if 2000 <= ano <= 2100 and 1 <= mes <= 12:
            return ano, mes
    except ValueError:
        pass
    return None

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def comparativo_filtro_opcoes_api(request):
    """
    Retorna as opções disponíveis para preencher os seletores de filtros no frontend.
    """
    global _FILTROS_CACHE, _FILTROS_CACHE_TIME
    now = time.time()
    if _FILTROS_CACHE is not None and (now - _FILTROS_CACHE_TIME) < CACHE_EXPIRATION_SECONDS:
        return Response(_FILTROS_CACHE)

    # Coleta supervisores e coordenadores ativos nas lojas
    # Por que existe: Centros de custo específicos do escritório não possuem orçamento planejado no escopo. 
    # Portanto, são desconsiderados do Comparativo (Raio-X) para evitar falsos desvios acumulados e inconsistências nos filtros.
    # Lojas inativas também são excluídas para evitar que lançamentos residuais entrem no cálculo.
    supervisores = list(Loja.objects.exclude(centro_de_custo__in=CENTROS_CUSTO_ESCRITORIO).exclude(status="INATIVA").exclude(supervisor__isnull=True).values_list("supervisor__nome", flat=True).distinct().order_by("supervisor__nome"))
    coordenadores = list(Loja.objects.exclude(centro_de_custo__in=CENTROS_CUSTO_ESCRITORIO).exclude(status="INATIVA").exclude(coordenador__isnull=True).values_list("coordenador__nome", flat=True).distinct().order_by("coordenador__nome"))
    ufs = list(Loja.objects.exclude(centro_de_custo__in=CENTROS_CUSTO_ESCRITORIO).exclude(status="INATIVA").exclude(uf="").exclude(uf__isnull=True).values_list("uf", flat=True).distinct().order_by("uf"))
    
    # Coleta competências distintas (de escopo ou folha)
    competencias_set = set()
    for ano, mes in EscopoMensal.objects.values_list("ano", "mes"):
        competencias_set.add((int(ano), int(mes)))
        
    for dt in ResumoFolhaMensal.objects.values_list("dt_arq", flat=True):
        if dt:
            competencias_set.add((dt.year, dt.month))
            
    competencias_opcoes = []
    for ano, mes in sorted(competencias_set, reverse=True):
        competencias_opcoes.append({
            "value": f"{ano}-{mes:02d}",
            "label": f"{_nome_mes(mes)} / {ano}"
        })
        
    response_data = {
        "supervisores": supervisores,
        "coordenadores": coordenadores,
        "ufs": ufs,
        "competencias": competencias_opcoes
    }
    
    _FILTROS_CACHE = response_data
    _FILTROS_CACHE_TIME = now
    
    return Response(response_data)

def obter_parametro_lista(request, nome_base: str) -> List[str]:
    """
    Por que existe: Obtém de forma resiliente e robusta os valores de um parâmetro que pode 
    vir do frontend formatado como string com vírgula ou como array (Ex: com sufixo [] do Axios).
    """
    chaves = [nome_base, f"{nome_base}[]"]
    valores = []
    
    for chave in chaves:
        lista = request.query_params.getlist(chave)
        if lista:
            for item in lista:
                if item:
                    valores.extend([part.strip() for part in item.split(",") if part.strip()])
                    
    if not valores:
        for chave in chaves:
            single = request.query_params.get(chave)
            if single:
                valores.extend([part.strip() for part in single.split(",") if part.strip()])
                
    return list(set(valores))


def _calcular_dados_comparativo_relatorio(request):
    """
    Função auxiliar que processa e calcula o comparativo financeiro orçado vs realizado (Raio-X)
    com base nos filtros passados via query_params na requisição HTTP.
    
    Retorna uma tupla contendo:
    - combinacoes: Lista com todos os registros por filial física consolidada
    - escopo_total: Total geral orçado
    - folha_total: Total geral realizado na folha
    - mensal_map: Dicionário agrupado para evolução mensal
    - coord_map: Dicionário agrupado de desvio por coordenador
    - uf_map: Dicionário agrupado de desvio por UF
    - competencias_list: Lista de tuplas (ano, mes) filtradas
    """
    # 1. Filtros das Lojas
    # Por que existe: Centros de custo específicos do escritório não possuem orçamento planejado no escopo.
    # Portanto, são desconsiderados do Comparativo (Raio-X) para evitar falsos desvios acumulados na análise consolidada de custos.
    # Lojas inativas também são excluídas das análises do Raio-X por apresentarem desvios indevidos devido a pagamentos residuais.
    lojas_qs = Loja.objects.exclude(centro_de_custo__in=CENTROS_CUSTO_ESCRITORIO).exclude(status="INATIVA").select_related("supervisor", "coordenador")
    
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
        
    search_val = request.query_params.get("search")
    if search_val:
        lojas_qs = lojas_qs.filter(nome_referencia__icontains=search_val)
        
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
        # Pega todas as competências que possuem dados no banco se nenhuma for selecionada
        competencias_set = set()
        for ano, mes in EscopoMensal.objects.values_list("ano", "mes"):
            competencias_set.add((int(ano), int(mes)))
        for dt in ResumoFolhaMensal.objects.values_list("dt_arq", flat=True):
            if dt:
                competencias_set.add((dt.year, dt.month))
        competencias_list = sorted(list(competencias_set), reverse=True)
        if not competencias_list:
            competencias_list = [(datetime.date.today().year, datetime.date.today().month)]

    # Converte competências em datas exatas
    datas_exatas = [datetime.date(ano, mes, 1) for ano, mes in competencias_list]
    
    # 3. Cálculo Eficiente de Orçado (Escopo) e Realizado (Folha) Consolidado
    # --- Folha
    folha_total = Decimal("0.00")
    folha_por_loja_comp = defaultdict(Decimal)
    
    if lojas_filtradas_ids:
        folha_resumos = ResumoFolhaMensal.objects.filter(
            loja_id__in=lojas_filtradas_ids,
            dt_arq__in=datas_exatas
        ).values("loja_id", "dt_arq", "valor_total")
        for fr in folha_resumos:
            valor = fr["valor_total"] or Decimal("0.00")
            dt = fr["dt_arq"]
            folha_por_loja_comp[(fr["loja_id"], dt.year, dt.month)] = valor
            folha_total += valor

    # --- Escopo com Fallback (Vigência Implícita) Otimizado (Query Única O(1))
    escopo_total = Decimal("0.00")
    escopo_por_loja_comp = defaultdict(Decimal)
    
    meses_com_folha_geral = set()
    if datas_exatas:
        folhas_existentes = ResumoFolhaMensal.objects.filter(
            dt_arq__in=datas_exatas
        ).values_list("dt_arq", flat=True).distinct()
        for dt in folhas_existentes:
            if dt:
                meses_com_folha_geral.add((dt.year, dt.month))

    if lojas_filtradas_ids:
        configs = {cfg.loja_id: cfg for cfg in ConfiguracaoInsalubridadeLoja.objects.filter(loja_id__in=lojas_filtradas_ids)}
        lojas_dict = {l.id: l for l in lojas_qs}
        
        min_ano, min_mes = min(competencias_list)
        
        q_exatos = Q()
        for ano, mes in competencias_list:
            q_exatos |= Q(ano=ano, mes=mes)
            
        escopos_exatos_ids = list(
            EscopoMensal.objects.filter(loja_id__in=lojas_filtradas_ids)
            .filter(q_exatos)
            .values_list("id", flat=True)
        )

        subquery_fallback = EscopoMensal.objects.filter(
            loja_id=OuterRef("id")
        ).filter(
            Q(ano__lt=min_ano) | Q(ano=min_ano, mes__lt=min_mes)
        ).order_by("-ano", "-mes").values("id")[:1]

        escopos_fallback_ids = list(
            lojas_qs.annotate(
                fallback_id=Subquery(subquery_fallback)
            ).values_list("fallback_id", flat=True)
        )
        escopos_fallback_ids = [fid for fid in escopos_fallback_ids if fid is not None]

        escopos_ids_para_carregar = list(set(escopos_exatos_ids + escopos_fallback_ids))
                
        todos_escopos = (
            EscopoMensal.objects.filter(id__in=escopos_ids_para_carregar)
            .prefetch_related("itens", "itens__cargo")
            .select_related("loja")
            .order_by("-ano", "-mes")
        )
        
        escopos_por_loja = defaultdict(list)
        for esc in todos_escopos:
            escopos_por_loja[esc.loja_id].append(esc)
            
        itens_todos = []
        escala_por_escopo_id = {}
        
        for loja_id in lojas_filtradas_ids:
            loja = lojas_dict.get(loja_id)
            if not loja:
                continue
                
            loja._cached_config_insalubridade = configs.get(loja_id) or obter_ou_criar_config_insalubridade_loja(loja)
            escopos_loja = escopos_por_loja.get(loja_id, [])
            
            for ano, mes in competencias_list:
                if (ano, mes) in meses_com_folha_geral:
                    if folha_por_loja_comp.get((loja_id, ano, mes), Decimal("0.00")) <= Decimal("0.00"):
                        continue

                esc = None
                for e in escopos_loja:
                    if e.ano == ano and e.mes == mes:
                        esc = e
                        break
                        
                if esc is not None:
                    escala = escala_insalubridade_fixa_para_escopo(esc)
                    escala_por_escopo_id[esc.pk] = escala
                    itens_todos.extend(list(esc.itens.all()))
                else:
                    esc_fallback = None
                    for e in escopos_loja:
                        if e.ano < ano or (e.ano == ano and e.mes < mes):
                            esc_fallback = e
                            break
                            
                    if esc_fallback is not None:
                        esc_virtual = EscopoMensal(
                            id=esc_fallback.id,
                            loja=loja,
                            ano=ano,
                            mes=mes,
                        )
                        esc_virtual.loja = loja
                        
                        escala = escala_insalubridade_fixa_para_escopo(esc_fallback)
                        escala_por_escopo_id[esc_fallback.id] = escala
                        
                        for item_orig in esc_fallback.itens.all():
                            item_fake = ItemEscopoMensal(
                                id=item_orig.id,
                                escopo_mensal=esc_virtual,
                                cargo=item_orig.cargo,
                                turno=item_orig.turno,
                                quantidade=item_orig.quantidade,
                            )
                            itens_todos.append(item_fake)
                            
        if itens_todos:
            cache_regional, cache_minimo = montar_caches_salario_para_itens(itens_todos)
            
            for item in itens_todos:
                escopo_id_val = item.escopo_mensal.id if item.escopo_mensal else None
                escala = escala_por_escopo_id.get(escopo_id_val, Decimal("1.0"))
                
                det = item.get_estimativa_detalhada(
                    cache_regional,
                    cache_minimo,
                    escala_insalubridade_fixa=escala
                )
                if det:
                    valor = det["total"]
                    escopo_por_loja_comp[(item.escopo_mensal.loja_id, item.escopo_mensal.ano, item.escopo_mensal.mes)] += valor
                    escopo_total += valor

    # 4. Cruzamento dos Dados e Agrupamento por Loja
    combinacoes = []
    lojas_map = {l.id: l for l in lojas_qs}
    competencias_str = ",".join(f"{ano}-{mes:02d}" for ano, mes in competencias_list)
    
    for loja_id in lojas_filtradas_ids:
        loja_obj = lojas_map.get(loja_id)
        if not loja_obj:
            continue
            
        soma_escopo = Decimal("0.00")
        soma_folha = Decimal("0.00")
        possui_dados = False
        
        for ano, mes in competencias_list:
            v_escopo = escopo_por_loja_comp[(loja_id, ano, mes)]
            v_folha = folha_por_loja_comp[(loja_id, ano, mes)]
            
            if v_escopo > 0 or v_folha > 0:
                possui_dados = True
                
            soma_escopo += v_escopo
            soma_folha += v_folha
            
        if not possui_dados:
            continue
            
        combinacoes.append({
            "loja_id": loja_id,
            "loja_nome": loja_obj.nome_referencia,
            "supervisor": loja_obj.supervisor.nome if loja_obj.supervisor else "-",
            "coordenador": loja_obj.coordenador.nome if loja_obj.coordenador else "-",
            "uf": loja_obj.uf or "-",
            "competencia": competencias_str,
            "competencia_label": "Período Filtrado",
            "orcado": float(soma_escopo),
            "realizado": float(soma_folha),
            "desvio": float(soma_folha - soma_escopo)
        })
        
    combinacoes.sort(key=lambda x: x["loja_nome"])
    
    # 5. Dados dos Gráficos (Agregações de BI)
    mensal_map = defaultdict(lambda: {"orcado": Decimal("0"), "realizado": Decimal("0")})
    coord_map = defaultdict(Decimal)
    uf_map = defaultdict(Decimal)
    
    for loja_id in lojas_filtradas_ids:
        loja_obj = lojas_map.get(loja_id)
        if not loja_obj:
            continue
            
        coordenador_nome = loja_obj.coordenador.nome if loja_obj.coordenador else "-"
        uf_sigla = loja_obj.uf or "-"
        
        for ano, mes in competencias_list:
            v_escopo = escopo_por_loja_comp[(loja_id, ano, mes)]
            v_folha = folha_por_loja_comp[(loja_id, ano, mes)]
            
            if v_escopo == 0 and v_folha == 0:
                continue
                
            key = (ano, mes)
            mensal_map[key]["orcado"] += v_escopo
            mensal_map[key]["realizado"] += v_folha
            
            desvio_loja_comp = v_folha - v_escopo
            coord_map[coordenador_nome] += desvio_loja_comp
            uf_map[uf_sigla] += desvio_loja_comp

    return (
        combinacoes,
        escopo_total,
        folha_total,
        mensal_map,
        coord_map,
        uf_map,
        competencias_list,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def comparativo_relatorio_api(request):
    """
    API do relatório de Raio-X que calcula os KPIs consolidados, dados para gráficos
    e retorna a tabela paginada com o comparativo orçado vs real por filial física.
    """
    (
        combinacoes,
        escopo_total,
        folha_total,
        mensal_map,
        coord_map,
        uf_map,
        competencias_list,
    ) = _calcular_dados_comparativo_relatorio(request)

    # Pagina os resultados
    page = request.query_params.get("page", 1)
    page_size = request.query_params.get("page_size", 20)
    try:
        page = int(page)
        page_size = int(page_size)
    except ValueError:
        page = 1
        page_size = 20
        
    total_items = len(combinacoes)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    itens_paginados = combinacoes[start_idx:end_idx]
    
    # Dados dos Gráficos (Agregações de BI)
    dados_grafico_mensal = []
    for (ano_c, mes_c) in sorted(mensal_map.keys()):
        label = f"{_nome_mes(mes_c)} / {ano_c}"
        dados_grafico_mensal.append({
            "mes": label,
            "orcado": float(mensal_map[(ano_c, mes_c)]["orcado"]),
            "realizado": float(mensal_map[(ano_c, mes_c)]["realizado"]),
            "desvio": float(mensal_map[(ano_c, mes_c)]["realizado"] - mensal_map[(ano_c, mes_c)]["orcado"])
        })
        
    dados_grafico_coordenador = [
        {"coordenador": k, "desvio": float(v)}
        for k, v in sorted(coord_map.items(), key=lambda x: abs(x[1]), reverse=True)[:10]
    ]

    dados_grafico_uf = [
        {"uf": k, "desvio": float(v)}
        for k, v in sorted(uf_map.items(), key=lambda x: abs(x[1]), reverse=True)
    ]
    
    return Response({
        "count": total_items,
        "results": {
            "resultados": itens_paginados,
            "kpis": {
                "orcado_total": float(escopo_total),
                "realizado_total": float(folha_total),
                "desvio_total": float(folha_total - escopo_total)
            },
            "graficos": {
                "mensal": dados_grafico_mensal,
                "coordenador": dados_grafico_coordenador,
                "uf": dados_grafico_uf
            }
        }
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def comparativo_relatorio_exportar_excel(request):
    """
    Exporta a listagem completa da tabela 'Comparativo por Filial Física' (Raio-X)
    respeitando os filtros aplicados para um arquivo Excel (.xlsx).
    
    Colunas incluídas:
    Filial Física | Supervisor | Coordenador | UF | Orçado (Escopo) | Real (Folha) | Desvio
    """
    (
        combinacoes,
        escopo_total,
        folha_total,
        mensal_map,
        coord_map,
        uf_map,
        competencias_list,
    ) = _calcular_dados_comparativo_relatorio(request)

    if not combinacoes:
        return Response(
            {"error": "Não há dados para exportar com os filtros selecionados."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data_rows = []
    for item in combinacoes:
        data_rows.append({
            "Filial Física": item["loja_nome"],
            "Supervisor": item["supervisor"],
            "Coordenador": item["coordenador"],
            "UF": item["uf"],
            "Orçado (Escopo)": item["orcado"],
            "Real (Folha)": item["realizado"],
            "Desvio": item["desvio"],
        })

    df = pd.DataFrame(data_rows)
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Comparativo Filiais")

        # Ajusta a largura das colunas
        worksheet = writer.sheets["Comparativo Filiais"]
        for col in worksheet.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = col[0].column_letter
            worksheet.column_dimensions[col_letter].width = max(max_len + 4, 12)

    output.seek(0)

    response = HttpResponse(
        output.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    data_hoje = datetime.date.today().strftime("%d_%m_%Y")
    filename = f"comparativo_filiais_{data_hoje}.xlsx"
    response["Content-Disposition"] = f'attachment; filename="{filename}"'

    return response
