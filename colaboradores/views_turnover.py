from datetime import date
from django.db import DatabaseError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from colaboradores.models import Colaborador
from colaboradores.serializers import ColaboradorSerializer, obter_loja_por_cc
from lojas.models import Loja

def obter_quadro_valor(loja_obj):
    """
    Retorna o valor do quadro de funcionários planejado para a loja como inteiro.
    """
    if not loja_obj or not loja_obj.quadro:
        return 0
    try:
        return int(float(str(loja_obj.quadro).strip()))
    except (ValueError, TypeError):
        return 0

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def turnover_list_api(request):
    """
    Retorna a listagem detalhada de colaboradores demitidos com estatísticas consolidadas
    de turnover para gráficos e KPIs no estilo dashboard.
    
    Docstring explicativa em português:
    Esta view faz a busca e filtros dos dados de demissão em memória. Ela resolve a loja física
    associada a cada demissão priorizando 'loja_gestao'. Se esta for nula, executa o fallback associando 
    a loja correspondente ao 'centro_custo' do colaborador demitido. Todo o processamento (contagens, 
    agrupamentos mensais, motivos de demissão, coordenadores e rankings de lojas pelo Nome Referência) 
    é feito sobre a loja unificada e resolvida em memória para garantir consistência total.
    """
    # Validação manual de permissões para a role de Turnover
    user = request.user
    if not user.is_superuser:
        from usuarios.models import RolePermission
        group = user.groups.first()
        try:
            perm = RolePermission.objects.get(group=group, module="turnover")
            if not perm.can_view:
                return Response(
                    {"error": "Você não possui permissão para visualizar a tela de turnover."},
                    status=status.HTTP_403_FORBIDDEN
                )
        except (RolePermission.DoesNotExist, DatabaseError):
            return Response(
                {"error": "Erro ao validar permissões de acesso."},
                status=status.HTTP_403_FORBIDDEN
            )

    # Carrega todos os colaboradores (ativos e inativos)
    colaboradores_base = list(
        Colaborador.objects.exclude(cargo="AUXILIAR ADMINISTRAT")
        .select_related("loja_gestao", "loja_gestao__coordenador", "loja_gestao__supervisor")
    )

    # Executa a resolução do fallback de loja por centro de custo em memória
    for c in colaboradores_base:
        loja_resolvida = c.loja_gestao
        if not loja_resolvida and c.centro_custo:
            loja_resolvida = obter_loja_por_cc(c.centro_custo)
        c.loja_resolvida = loja_resolvida

    # Carrega e filtra todas as lojas em análise para obter a soma de quadros
    lojas_all = list(Loja.objects.all().select_related("coordenador", "supervisor"))
    lojas_filtradas_por_analise = lojas_all

    # Aplicação de filtros gerais (loja, coordenador, supervisor, uf)
    loja_id = request.query_params.get("loja")
    if loja_id:
        lojas_ids = [l.strip() for l in loja_id.split(",") if l.strip()]
        if lojas_ids:
            has_null = "null" in lojas_ids
            vals = [int(l) for l in lojas_ids if l != "null" and l.isdigit()]
            colaboradores_base = [
                c for c in colaboradores_base
                if (c.loja_resolvida and c.loja_resolvida.id in vals) or (has_null and c.loja_resolvida is None)
            ]
            lojas_filtradas_por_analise = [
                l for l in lojas_filtradas_por_analise if l.id in vals
            ]

    coordenador_val = request.query_params.get("coordenador")
    if coordenador_val:
        coordenadores = [c.strip() for c in coordenador_val.split(",") if c.strip()]
        if coordenadores:
            has_null = "null" in coordenadores
            vals = [cv for cv in coordenadores if cv != "null"]
            colaboradores_base = [
                c for c in colaboradores_base
                if (c.loja_resolvida and c.loja_resolvida.coordenador and c.loja_resolvida.coordenador.nome in vals)
                or (has_null and (not c.loja_resolvida or not c.loja_resolvida.coordenador))
            ]
            lojas_filtradas_por_analise = [
                l for l in lojas_filtradas_por_analise if l.coordenador and l.coordenador.nome in vals
            ]

    supervisor_val = request.query_params.get("supervisor")
    if supervisor_val:
        supervisores = [s.strip() for s in supervisor_val.split(",") if s.strip()]
        if supervisores:
            has_null = "null" in supervisores
            vals = [sv for sv in supervisores if sv != "null"]
            colaboradores_base = [
                c for c in colaboradores_base
                if (c.loja_resolvida and c.loja_resolvida.supervisor and c.loja_resolvida.supervisor.nome in vals)
                or (has_null and (not c.loja_resolvida or not c.loja_resolvida.supervisor))
            ]
            lojas_filtradas_por_analise = [
                l for l in lojas_filtradas_por_analise if l.supervisor and l.supervisor.nome in vals
            ]

    uf_val = request.query_params.get("uf")
    if uf_val:
        ufs = [u.strip() for u in uf_val.split(",") if u.strip()]
        if ufs:
            has_null = "null" in ufs
            vals = [uv for uv in ufs if uv != "null"]
            colaboradores_base = [
                c for c in colaboradores_base
                if (c.loja_resolvida and c.loja_resolvida.uf in vals)
                or (has_null and (not c.loja_resolvida or not c.loja_resolvida.uf))
            ]
            lojas_filtradas_por_analise = [
                l for l in lojas_filtradas_por_analise if l.uf in vals
            ]

    # Ativos Atuais no grupo filtrado
    total_ativos = len([c for c in colaboradores_base if c.status == "A"])

    # Filtro de período (competência)
    mes_ano = request.query_params.get("mes_ano")
    meses_anos = []
    if mes_ano:
        meses_anos = [ma.strip() for ma in mes_ano.split(",") if ma.strip()]

    # Separa demissões e admissões no período com base nos filtros gerais aplicados
    demitidos_no_periodo = [
        c for c in colaboradores_base
        if c.status == "D" and c.data_demissao and (not meses_anos or c.data_demissao.strftime("%Y-%m") in meses_anos)
    ]
    admitidos_no_periodo = [
        c for c in colaboradores_base
        if c.data_admissao and (not meses_anos or c.data_admissao.strftime("%Y-%m") in meses_anos)
    ]

    # Filtros específicos para a tabela detalhada e gráficos de demissão (motivo, busca textual)
    demitidos_filtrados = demitidos_no_periodo
    motivo_val = request.query_params.get("motivo")
    if motivo_val:
        motivos = [m.strip() for m in motivo_val.split(",") if m.strip()]
        if motivos:
            has_null = "null" in motivos
            vals = [mv for motivos_item in motivos if (mv := motivos_item) != "null"]
            demitidos_filtrados = [
                c for c in demitidos_filtrados
                if (c.motivo_demissao in vals) or (has_null and not c.motivo_demissao)
            ]

    search_query = request.query_params.get("search")
    if search_query:
        search_query_lower = search_query.lower().strip()
        demitidos_filtrados = [
            c for c in demitidos_filtrados
            if search_query_lower in c.nome.lower() or search_query_lower in c.re.lower()
        ]

    # Totais consolidados quantitativos e financeiros
    total_demissoes = len(demitidos_filtrados)
    total_admitidos = len(admitidos_no_periodo)
    saldo = total_admitidos - total_demissoes

    total_custo_rescisao = sum(float(c.valor_rescisao_estimado or 0) for c in demitidos_filtrados)
    total_massa_salarial = sum(float(c.salario_rescisao or 0) for c in demitidos_filtrados)
    media_custo_rescisao = (total_custo_rescisao / total_demissoes) if total_demissoes > 0 else 0.0
    media_salario_demissao = (total_massa_salarial / total_demissoes) if total_demissoes > 0 else 0.0

    # Cálculo da soma de quadros das lojas filtradas/em análise
    soma_quadros = sum(obter_quadro_valor(l) for l in lojas_filtradas_por_analise)

    # Cálculo da Taxa de Turnover Global sobre a soma dos quadros das lojas em análise
    taxa_turnover = (total_demissoes / soma_quadros * 100.0) if soma_quadros > 0 else 0.0

    # Agregações para gráficos de demissões (Quantidade e Valores)
    m_dict = {}
    for c in demitidos_filtrados:
        motivo = c.motivo_demissao or "Não Informado"
        if motivo not in m_dict:
            m_dict[motivo] = {"quantidade": 0, "valor_total": 0.0, "massa_salarial": 0.0}
        m_dict[motivo]["quantidade"] += 1
        m_dict[motivo]["valor_total"] += float(c.valor_rescisao_estimado or 0)
        m_dict[motivo]["massa_salarial"] += float(c.salario_rescisao or 0)

    dados_grafico_motivo = sorted(
        [
            {
                "motivo": m,
                "quantidade": d["quantidade"],
                "valor_total": round(d["valor_total"], 2),
                "massa_salarial": round(d["massa_salarial"], 2),
                "ticket_medio": round(d["valor_total"] / d["quantidade"], 2) if d["quantidade"] > 0 else 0.0,
            }
            for m, d in m_dict.items()
        ],
        key=lambda x: x["quantidade"],
        reverse=True
    )

    # Evolução Mensal (Comparativo Admitidos vs Demitidos e Custos)
    mensal_dict = {}
    for c in demitidos_filtrados:
        if c.data_demissao:
            key = c.data_demissao.strftime("%Y-%m")
            label = c.data_demissao.strftime("%m/%Y")
            if key not in mensal_dict:
                mensal_dict[key] = {
                    "label": label,
                    "admissoes": 0,
                    "demissoes": 0,
                    "valor_rescisao": 0.0,
                    "massa_salarial": 0.0,
                }
            mensal_dict[key]["demissoes"] += 1
            mensal_dict[key]["valor_rescisao"] += float(c.valor_rescisao_estimado or 0)
            mensal_dict[key]["massa_salarial"] += float(c.salario_rescisao or 0)

    for c in admitidos_no_periodo:
        if c.data_admissao:
            key = c.data_admissao.strftime("%Y-%m")
            label = c.data_admissao.strftime("%m/%Y")
            if key not in mensal_dict:
                mensal_dict[key] = {
                    "label": label,
                    "admissoes": 0,
                    "demissoes": 0,
                    "valor_rescisao": 0.0,
                    "massa_salarial": 0.0,
                }
            mensal_dict[key]["admissoes"] += 1

    if meses_anos:
        mensal_dict = {k: v for k, v in mensal_dict.items() if k in meses_anos}

    dados_grafico_linha = [
        {
            "mes": v["label"],
            "admissoes": v["admissoes"],
            "demissoes": v["demissoes"],
            "valor_rescisao": round(v.get("valor_rescisao", 0.0), 2),
            "massa_salarial": round(v.get("massa_salarial", 0.0), 2),
        }
        for k, v in sorted(mensal_dict.items())
    ]

    # Distribuição de Coordenador (Taxa de Turnover e Custos)
    coord_stats = {}
    for l in lojas_all:
        coord_nome = l.coordenador.nome if l.coordenador else "Sem Coordenador"
        if coord_nome not in coord_stats:
            coord_stats[coord_nome] = {"quadro": 0, "demissoes": 0, "valor_rescisao": 0.0, "massa_salarial": 0.0}
        coord_stats[coord_nome]["quadro"] += obter_quadro_valor(l)

    for c in demitidos_filtrados:
        coord_nome = c.loja_resolvida.coordenador.nome if (c.loja_resolvida and c.loja_resolvida.coordenador) else "Sem Coordenador"
        if coord_nome not in coord_stats:
            coord_stats[coord_nome] = {"quadro": 0, "demissoes": 0, "valor_rescisao": 0.0, "massa_salarial": 0.0}
        coord_stats[coord_nome]["demissoes"] += 1
        coord_stats[coord_nome]["valor_rescisao"] += float(c.valor_rescisao_estimado or 0)
        coord_stats[coord_nome]["massa_salarial"] += float(c.salario_rescisao or 0)

    dados_grafico_coordenador = []
    for coord, stats in coord_stats.items():
        dem = stats["demissoes"]
        quad = stats["quadro"]
        taxa = (dem / quad * 100.0) if quad > 0 else 0.0
        val_res = round(stats["valor_rescisao"], 2)
        if dem > 0:
            dados_grafico_coordenador.append({
                "coordenador": coord,
                "quantidade": round(taxa, 1),
                "taxa_turnover": round(taxa, 1),
                "quadro": quad,
                "demissoes": dem,
                "valor_total": val_res,
                "massa_salarial": round(stats["massa_salarial"], 2),
            })
    dados_grafico_coordenador = sorted(dados_grafico_coordenador, key=lambda x: x["quantidade"], reverse=True)

    # Estatísticas de Todas as Lojas por Taxa de Turnover e Custo
    lojas_stats = {}
    for l in lojas_all:
        lojas_stats[l.nome_referencia] = {
            "id": l.id,
            "loja": l.nome_referencia,
            "quadro": obter_quadro_valor(l),
            "demissoes": 0,
            "admissoes": 0,
            "valor_rescisao": 0.0,
            "massa_salarial": 0.0,
            "coordenador": l.coordenador.nome if l.coordenador else "Sem Coordenador",
            "supervisor": l.supervisor.nome if l.supervisor else "Sem Supervisor",
            "uf": l.uf or "N/A",
        }

    for c in demitidos_filtrados:
        if c.loja_resolvida:
            loja_nome = c.loja_resolvida.nome_referencia
            if loja_nome not in lojas_stats:
                lojas_stats[loja_nome] = {
                    "id": c.loja_resolvida.id,
                    "loja": loja_nome,
                    "quadro": obter_quadro_valor(c.loja_resolvida),
                    "demissoes": 0,
                    "admissoes": 0,
                    "valor_rescisao": 0.0,
                    "massa_salarial": 0.0,
                    "coordenador": c.loja_resolvida.coordenador.nome if c.loja_resolvida.coordenador else "Sem Coordenador",
                    "supervisor": c.loja_resolvida.supervisor.nome if c.loja_resolvida.supervisor else "Sem Supervisor",
                    "uf": c.loja_resolvida.uf or "N/A",
                }
            lojas_stats[loja_nome]["demissoes"] += 1
            lojas_stats[loja_nome]["valor_rescisao"] += float(c.valor_rescisao_estimado or 0)
            lojas_stats[loja_nome]["massa_salarial"] += float(c.salario_rescisao or 0)

    for c in admitidos_no_periodo:
        if c.loja_resolvida:
            loja_nome = c.loja_resolvida.nome_referencia
            if loja_nome in lojas_stats:
                lojas_stats[loja_nome]["admissoes"] += 1

    dados_grafico_lojas = []
    for loja_nome, stats in lojas_stats.items():
        dem = stats["demissoes"]
        quad = stats["quadro"]
        adm = stats.get("admissoes", 0)
        taxa = (dem / quad * 100.0) if quad > 0 else 0.0
        val_res = round(stats.get("valor_rescisao", 0.0), 2)
        val_sal = round(stats.get("massa_salarial", 0.0), 2)
        dados_grafico_lojas.append({
            "id": stats.get("id"),
            "loja": loja_nome,
            "coordenador": stats.get("coordenador", "Sem Coordenador"),
            "supervisor": stats.get("supervisor", "Sem Supervisor"),
            "uf": stats.get("uf", "N/A"),
            "quantidade": round(taxa, 1),
            "taxa_turnover": round(taxa, 1),
            "quadro": quad,
            "demissoes": dem,
            "admissoes": adm,
            "valor_rescisao": val_res,
            "massa_salarial": val_sal,
        })
    dados_grafico_lojas = sorted(
        dados_grafico_lojas,
        key=lambda x: (x["quantidade"], x["demissoes"]),
        reverse=True
    )

    # Distribuição de demitidos por Cargo (Quantidade e Valores)
    cargo_dict = {}
    for c in demitidos_filtrados:
        cargo = c.cargo or "Outros"
        if cargo not in cargo_dict:
            cargo_dict[cargo] = {"quantidade": 0, "valor_total": 0.0, "massa_salarial": 0.0}
        cargo_dict[cargo]["quantidade"] += 1
        cargo_dict[cargo]["valor_total"] += float(c.valor_rescisao_estimado or 0)
        cargo_dict[cargo]["massa_salarial"] += float(c.salario_rescisao or 0)

    dados_grafico_cargos = sorted(
        [
            {
                "cargo": cg,
                "quantidade": d["quantidade"],
                "valor_total": round(d["valor_total"], 2),
                "massa_salarial": round(d["massa_salarial"], 2),
            }
            for cg, d in cargo_dict.items()
        ],
        key=lambda x: x["quantidade"],
        reverse=True
    )[:10]

    # Paginação em memória para a lista detalhada
    page = int(request.query_params.get("page", 1))
    page_size = int(request.query_params.get("page_size", 10))
    start = (page - 1) * page_size
    end = start + page_size

    paginated_colaboradores = demitidos_filtrados[start:end]
    serializer = ColaboradorSerializer(paginated_colaboradores, many=True)

    has_next = end < total_demissoes
    has_prev = start > 0

    return Response({
        "count": total_demissoes,
        "next": f"?page={page+1}" if has_next else None,
        "previous": f"?page={page-1}" if has_prev else None,
        "results": {
            "resultados": serializer.data,
            "quantidade_total": total_demissoes,
            "quantidade_admitidos": total_admitidos,
            "total_ativos": total_ativos,
            "taxa_turnover": round(taxa_turnover, 2),
            "saldo": saldo,
            "total_custo_rescisao": round(total_custo_rescisao, 2),
            "total_massa_salarial_demitida": round(total_massa_salarial, 2),
            "media_custo_rescisao": round(media_custo_rescisao, 2),
            "media_salario_demissao": round(media_salario_demissao, 2),
            "graficos": {
                "motivo": dados_grafico_motivo,
                "mensal": dados_grafico_linha,
                "coordenador": dados_grafico_coordenador,
                "lojas": dados_grafico_lojas,
                "cargos": dados_grafico_cargos
            }
        }
    })

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def turnover_filtro_opcoes_api(request):
    """
    Retorna as opções exclusivas dos seletores de filtros resolvendo fallback de Centro de Custo.
    """
    user = request.user
    if not user.is_superuser:
        from usuarios.models import RolePermission
        group = user.groups.first()
        try:
            perm = RolePermission.objects.get(group=group, module="turnover")
            if not perm.can_view:
                return Response(
                    {"error": "Você não possui permissão para visualizar dados de turnover."},
                    status=status.HTTP_403_FORBIDDEN
                )
        except (RolePermission.DoesNotExist, DatabaseError):
            return Response(
                {"error": "Erro ao validar permissões de acesso."},
                status=status.HTTP_403_FORBIDDEN
            )

    colaboradores_base = list(
        Colaborador.objects.exclude(cargo="AUXILIAR ADMINISTRAT")
        .select_related("loja_gestao", "loja_gestao__coordenador", "loja_gestao__supervisor")
    )

    # Executa a resolução do fallback
    for c in colaboradores_base:
        loja_resolvida = c.loja_gestao
        if not loja_resolvida and c.centro_custo:
            loja_resolvida = obter_loja_por_cc(c.centro_custo)
        c.loja_resolvida = loja_resolvida

    # Opções únicas de lojas (Nome de Referência)
    lojas_set = set()
    for c in colaboradores_base:
        if c.loja_resolvida:
            lojas_set.add((c.loja_resolvida.id, c.loja_resolvida.nome_referencia))
            
    lojas_list = sorted(
        [{"id": str(lid), "nome_referencia": lref} for lid, lref in lojas_set],
        key=lambda x: x["nome_referencia"]
    )
    if any(c.loja_resolvida is None for c in colaboradores_base):
        lojas_list.append({"id": "null", "nome_referencia": "(Vazio)"})

    # Opções únicas de coordenadores
    coord_set = set()
    for c in colaboradores_base:
        if c.loja_resolvida and c.loja_resolvida.coordenador:
            coord_set.add(c.loja_resolvida.coordenador.nome)
    coordenadores_list = sorted(list(coord_set))
    if any(c.loja_resolvida is None or c.loja_resolvida.coordenador is None for c in colaboradores_base):
        coordenadores_list.append("null")

    # Opções únicas de supervisores
    super_set = set()
    for c in colaboradores_base:
        if c.loja_resolvida and c.loja_resolvida.supervisor:
            super_set.add(c.loja_resolvida.supervisor.nome)
    supervisores_list = sorted(list(super_set))
    if any(c.loja_resolvida is None or c.loja_resolvida.supervisor is None for c in colaboradores_base):
        supervisores_list.append("null")

    # Opções únicas de UFs
    uf_set = set()
    for c in colaboradores_base:
        if c.loja_resolvida and c.loja_resolvida.uf:
            uf_set.add(c.loja_resolvida.uf)
    ufs_list = sorted(list(uf_set))
    if any(c.loja_resolvida is None or not c.loja_resolvida.uf for c in colaboradores_base):
        ufs_list.append("null")

    # Opções únicas de Motivos de Demissão
    motivo_set = set()
    for c in colaboradores_base:
        if c.status == "D" and c.motivo_demissao:
            motivo_set.add(c.motivo_demissao)
    motivos_list = sorted(list(motivo_set))
    if any(c.status == "D" and not c.motivo_demissao for c in colaboradores_base):
        motivos_list.append("null")

    # Opções de competências/meses (Admissões e Demissões)
    meses_set = set()
    for c in colaboradores_base:
        if c.data_demissao:
            meses_set.add(c.data_demissao.strftime("%Y-%m"))
        if c.data_admissao:
            meses_set.add(c.data_admissao.strftime("%Y-%m"))
    meses_list = sorted(list(meses_set), reverse=True)

    return Response({
        "lojas": lojas_list,
        "coordenadores": coordenadores_list,
        "supervisores": supervisores_list,
        "ufs": ufs_list,
        "motivos": motivos_list,
        "competencias": meses_list
    })
