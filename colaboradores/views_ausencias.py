import logging
from datetime import date, datetime, timedelta
from collections import defaultdict
from io import BytesIO
import pandas as pd
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from usuarios.permissions import IsGestaoOrAdministrador
from colaboradores.models import Colaborador, Ausencia
from lojas.models import Loja

logger = logging.getLogger(__name__)


def _obter_dados_analise_ausencias(request):
    """
    Função auxiliar que unifica a extração de filtros, consulta e agrupamento matemático
    de faltas, atestados e suspensões para reuso entre a API JSON e a exportação Excel.
    """
    search_query = request.GET.get("search", "").strip().lower()
    loja_query = request.GET.get("loja", "")
    coordenador_query = request.GET.get("coordenador", "")
    regiao_query = request.GET.get("regiao", "")
    status_gestao_query = request.GET.get("status_gestao", "")
    
    data_inicio_str = request.GET.get("data_inicio", "")
    data_fim_str = request.GET.get("data_fim", "")
    aba = request.GET.get("aba", "faltas")  # faltas, atestados, soma, suspensoes

    if data_fim_str:
        data_fim = date.fromisoformat(data_fim_str)
    else:
        data_fim = date.today()

    if data_inicio_str:
        data_inicio = date.fromisoformat(data_inicio_str)
    else:
        data_inicio = data_fim - timedelta(days=30)

    # Query base de colaboradores ativos
    colaboradores_qs = Colaborador.objects.exclude(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).select_related(
        "loja",
        "loja__coordenador",
        "loja__supervisor",
    )

    # Filtros
    if search_query:
        colaboradores_qs = colaboradores_qs.filter(
            Q(nome__icontains=search_query) | Q(re__icontains=search_query)
        )

    if loja_query:
        loja_ids = [int(l) for l in loja_query.split(",") if l.strip().isdigit()]
        if loja_ids:
            colaboradores_qs = colaboradores_qs.filter(loja_id__in=loja_ids)

    if coordenador_query:
        coordenadores = [c.strip() for c in coordenador_query.split(",") if c.strip()]
        if coordenadores:
            colaboradores_qs = colaboradores_qs.filter(loja__coordenador__nome__in=coordenadores)

    if regiao_query:
        regioes = [r.strip() for r in regiao_query.split(",") if r.strip()]
        if regioes:
            colaboradores_qs = colaboradores_qs.filter(loja__uf__in=regioes)

    if status_gestao_query:
        statuses = [s.strip() for s in status_gestao_query.split(",") if s.strip()]
        if statuses:
            colaboradores_qs = colaboradores_qs.filter(status_gestao__in=statuses)

    colaboradores_list = list(colaboradores_qs)
    colab_ids = [c.id for c in colaboradores_list]

    # Busca ausências no período
    ausencias_qs = Ausencia.objects.filter(
        colaborador_id__in=colab_ids,
        data__range=(data_inicio, data_fim)
    )

    # Agrupa TODAS as ocorrências por colaborador
    ausencias_por_colab = defaultdict(list)
    for aus in ausencias_qs:
        ausencias_por_colab[aus.colaborador_id].append(aus)

    """
    Por que este bloco existe:
    Precisamos pré-calcular os limites de Top 30% das faltas e dos atestados para
    conseguirmos identificar e excluir os colaboradores que se enquadram nesses 
    limites na aba 'soma' (Faltas + Atestados). A lógica calcula as médias individuais 
    de cada ocorrência (faltas e atestados) e obtém o conjunto dos 30% de pior 
    performance que estão acima da média geral daquela aba correspondente.
    """
    top_30_faltas_ids = set()
    top_30_atestados_ids = set()

    # Cálculo do Top 30% de Faltas
    faltas_dados = []
    for cid in colab_ids:
        aus_list = ausencias_por_colab.get(cid, [])
        faltas_c = sum(1 for a in aus_list if a.tipo == "falta")
        if faltas_c > 0:
            faltas_dados.append((cid, faltas_c))
    
    if faltas_dados:
        total_f = sum(x[1] for x in faltas_dados)
        media_f = total_f / len(faltas_dados)
        above_avg_f = [x for x in faltas_dados if x[1] > media_f]
        above_avg_f.sort(key=lambda x: x[1], reverse=True)
        target_f = int(len(above_avg_f) * 0.3)
        if len(above_avg_f) > 0 and target_f == 0:
            target_f = 1
        top_30_faltas_ids = {x[0] for x in above_avg_f[:target_f]}

    # Cálculo do Top 30% de Atestados
    atestados_dados = []
    for cid in colab_ids:
        aus_list = ausencias_por_colab.get(cid, [])
        atestados_c = sum(1 for a in aus_list if a.tipo == "atestado")
        if atestados_c > 0:
            atestados_dados.append((cid, atestados_c))
            
    if atestados_dados:
        total_a = sum(x[1] for x in atestados_dados)
        media_a = total_a / len(atestados_dados)
        above_avg_a = [x for x in atestados_dados if x[1] > media_a]
        above_avg_a.sort(key=lambda x: x[1], reverse=True)
        target_a = int(len(above_avg_a) * 0.3)
        if len(above_avg_a) > 0 and target_a == 0:
            target_a = 1
        top_30_atestados_ids = {x[0] for x in above_avg_a[:target_a]}

    # Filtra e define o grupo qualificado dependendo da aba
    qualified_colab_aus = {}
    for cid in colab_ids:
        aus_list = ausencias_por_colab.get(cid, [])
        if not aus_list:
            continue
        
        # Filtra os contadores individuais daquele colaborador
        faltas_count = sum(1 for a in aus_list if a.tipo == "falta")
        atestados_count = sum(1 for a in aus_list if a.tipo == "atestado")
        suspensoes_count = sum(1 for a in aus_list if a.tipo == "suspensao")
        soma_count = faltas_count + atestados_count

        if aba == "faltas" and faltas_count > 0:
            qualified_colab_aus[cid] = (aus_list, faltas_count, atestados_count, soma_count, suspensoes_count, faltas_count)
        elif aba == "atestados" and atestados_count > 0:
            qualified_colab_aus[cid] = (aus_list, faltas_count, atestados_count, soma_count, suspensoes_count, atestados_count)
        elif aba == "soma" and (faltas_count > 0 or atestados_count > 0) and cid not in top_30_faltas_ids and cid not in top_30_atestados_ids:
            qualified_colab_aus[cid] = (aus_list, faltas_count, atestados_count, soma_count, suspensoes_count, soma_count)
        elif aba == "suspensoes" and suspensoes_count > 0:
            qualified_colab_aus[cid] = (aus_list, faltas_count, atestados_count, soma_count, suspensoes_count, suspensoes_count)

    total_colab_com_ausencia = len(qualified_colab_aus)
    total_ausencias = sum(item[5] for item in qualified_colab_aus.values())

    media_geral = total_ausencias / total_colab_com_ausencia if total_colab_com_ausencia > 0 else 0.0

    results = []
    for colab in colaboradores_list:
        if colab.id not in qualified_colab_aus:
            continue

        aus_list, faltas_count, atestados_count, soma_count, suspensoes_count, active_qtd = qualified_colab_aus[colab.id]
        acima_da_media = active_qtd > media_geral

        results.append({
            "id": colab.id,
            "re": colab.re,
            "nome": colab.nome,
            "data_admissao": colab.data_admissao.strftime("%Y-%m-%d") if colab.data_admissao else None,
            "loja_nome": colab.loja.nome_totvs or colab.loja.nome_referencia if colab.loja else colab.centro_custo,
            "coordenador_nome": colab.loja.coordenador.nome if colab.loja and colab.loja.coordenador and colab.loja.coordenador.nome else "-",
            "supervisor_nome": colab.loja.supervisor.nome if colab.loja and colab.loja.supervisor and colab.loja.supervisor.nome else "-",
            "sub_regiao": colab.loja.uf if colab.loja else "-",
            "status_gestao": colab.status_gestao or "-",
            "faltas": faltas_count,
            "atestados": atestados_count,
            "soma": soma_count,
            "suspensoes": suspensoes_count,
            "quantidade": active_qtd,
            "acima_da_media": acima_da_media,
            "top_30_percent": False,
            "detalhes": [
                {
                    "data": aus.data.strftime("%Y-%m-%d"),
                    "descricao": aus.descricao,
                } for aus in sorted(aus_list, key=lambda x: x.data)
            ]
        })

    results.sort(key=lambda x: x["quantidade"], reverse=True)

    colab_acima_media_count = sum(1 for r in results if r["acima_da_media"])
    colab_top_30_count = 0
    limite_top_30 = 0

    if aba != "suspensoes":
        above_avg_colabs = [r for r in results if r["acima_da_media"]]
        above_avg_colabs.sort(key=lambda x: x["quantidade"], reverse=True)
        
        target_count = int(len(above_avg_colabs) * 0.3)
        if len(above_avg_colabs) > 0 and target_count == 0:
            target_count = 1
            
        top_30_ids = {c["id"] for c in above_avg_colabs[:target_count]}
        
        for r in results:
            if r["id"] in top_30_ids:
                r["top_30_percent"] = True
                colab_top_30_count += 1
                
        if above_avg_colabs and target_count > 0:
            idx = min(target_count - 1, len(above_avg_colabs) - 1)
            limite_top_30 = above_avg_colabs[idx]["quantidade"]

    stats = {
        "total_colaboradores_ativos": len(colaboradores_list),
        "total_ausencias": total_ausencias,
        "media_geral": round(media_geral, 2),
        "colaboradores_acima_media": colab_acima_media_count,
        "colaboradores_acima_media_percent": round((colab_acima_media_count / total_colab_com_ausencia * 100), 1) if total_colab_com_ausencia > 0 else 0.0,
        "colaboradores_top_30": colab_top_30_count,
        "limite_top_30": limite_top_30,
        "colaboradores_suspensos": total_colab_com_ausencia if aba == "suspensoes" else 0
    }

    return results, stats, data_inicio, data_fim, aba


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def ausencias_analise_api(request):
    """
    Retorna dados estatísticos consolidando faltas, atestados e suspensões por colaborador
    usando a função de processamento unificada.
    """
    try:
        results, stats, _, _, aba = _obter_dados_analise_ausencias(request)
    except ValueError:
        return Response({
            "error": "Formato de data inválido. Use AAAA-MM-DD."
        }, status=status.HTTP_400_BAD_REQUEST)

    if aba == "suspensoes":
        return Response({
            "results": results,
            "stats": {
                "total_colaboradores_ativos": stats["total_colaboradores_ativos"],
                "total_ausencias": stats["total_ausencias"],
                "colaboradores_suspensos": stats["colaboradores_suspensos"]
            }
        })

    return Response({
        "results": results,
        "stats": stats
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def exportar_ausencias_excel(request):
    """
    Exporta a visualização filtrada de ausências atual para planilha Excel (.xlsx).
    """
    try:
        results, _, data_inicio, data_fim, aba = _obter_dados_analise_ausencias(request)
    except ValueError:
        return Response({
            "error": "Formato de data inválido. Use AAAA-MM-DD."
        }, status=status.HTTP_400_BAD_REQUEST)

    if not results:
        return Response({
            "error": "Não há dados para exportar com os filtros selecionados."
        }, status=status.HTTP_400_BAD_REQUEST)

    # Permite exportar também respeitando o filtro local da tabela ('todos', 'acima_media', 'top_30')
    filtro_tabela = request.GET.get("filtro_tabela", "todos")
    if aba != "suspensoes":
        if filtro_tabela == "acima_media":
            results = [r for r in results if r["acima_da_media"]]
        elif filtro_tabela == "top_30":
            results = [r for r in results if r["top_30_percent"]]

    if not results:
        return Response({
            "error": "Não há registros correspondentes ao filtro da tabela."
        }, status=status.HTTP_400_BAD_REQUEST)

    data_rows = []
    for r in results:
        dt_admissao_formatted = ""
        if r["data_admissao"]:
            dt_admissao_formatted = datetime.strptime(r["data_admissao"], "%Y-%m-%d").strftime("%d/%m/%Y")

        row_dict = {
            "RE": r["re"],
            "Nome": r["nome"],
            "Dt. Admissão": dt_admissao_formatted,
            "Loja": r["loja_nome"],
            "Coordenador": r["coordenador_nome"],
            "Supervisor": r["supervisor_nome"],
            "Status Gestão": r["status_gestao"],
            "Faltas": r["faltas"],
            "Atestados": r["atestados"],
            "Faltas + Atestados": r["soma"],
            "Suspensões": r["suspensoes"]
        }
        data_rows.append(row_dict)

    df = pd.DataFrame(data_rows)
    output = BytesIO()
    
    label_planilha = {
        "faltas": "Faltas",
        "atestados": "Atestados",
        "soma": "Faltas + Atestados",
        "suspensoes": "Suspensões"
    }.get(aba, "Ausencias")
    
    sheet_name = label_planilha[:30]
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name)

    output.seek(0)

    response = HttpResponse(
        output.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    
    aba_prefix = aba.replace("+", "_")
    filename = f"analise_ausencias_{aba_prefix}_{data_inicio.strftime('%d_%m_%Y')}_a_{data_fim.strftime('%d_%m_%Y')}.xlsx"
    response["Content-Disposition"] = f'attachment; filename="{filename}"'

    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def ausencias_analise_filtro_opcoes_api(request):
    """
    Retorna as opções de preenchimento dos dropdowns (Lojas, Coordenadores, Regiões/UFs e Status Gestão)
    para o filtro da tela de análise de ausências.
    """
    colaboradores_qs = Colaborador.objects.exclude(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).select_related("loja", "loja__coordenador")

    lojas_set = set()
    coordenadores_set = set()
    regioes_set = set()
    status_gestao_set = set()

    for c in colaboradores_qs:
        if c.status_gestao:
            status_gestao_set.add(c.status_gestao.strip())
        if c.loja:
            lojas_set.add((c.loja.id, c.loja.nome_totvs or c.loja.nome_referencia))
            if c.loja.coordenador and c.loja.coordenador.nome:
                coordenadores_set.add(c.loja.coordenador.nome.strip())
            if c.loja.uf:
                regioes_set.add(c.loja.uf.strip())

    lojas_list = sorted(
        [{"id": str(lid), "nome_referencia": lref} for lid, lref in lojas_set],
        key=lambda x: x["nome_referencia"]
    )
    coordenadores_list = sorted(list(coordenadores_set))
    regioes_list = sorted(list(regioes_set))
    status_gestao_list = sorted(list(status_gestao_set))

    return Response({
        "lojas": lojas_list,
        "coordenadores": coordenadores_list,
        "regioes": regioes_list,
        "status_gestao": status_gestao_list
    })
