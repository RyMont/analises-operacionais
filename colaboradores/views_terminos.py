from datetime import date
from io import BytesIO

import pandas as pd
from django.core.paginator import Paginator
from django.db import models
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from unidecode import unidecode
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from usuarios.permissions import IsGestaoOrAdministrador

from lojas.models import Loja

from .models import Colaborador, ControleTermino
from .serializers import TerminoColaboradorSerializer, ControleTerminoSerializer
from .services import geovictoria
from .view_utils import derive_termino_state


from rest_framework.pagination import PageNumberPagination

@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def terminos_list(request):
    """
    Lista colaboradores próximos das datas de término de experiência (GET)
    ou registra uma ação no controle de término (POST).
    """
    if request.method == "DELETE":
        # Por que existe: Permite que o usuário reverta uma decisão de término tomada anteriormente,
        # fazendo com que o colaborador retorne para o status pendente no acompanhamento de termos de experiência.
        colaborador_id = request.data.get("colaborador_id") or request.query_params.get("colaborador_id")
        etapa = request.data.get("etapa") or request.query_params.get("etapa")

        if not colaborador_id or not etapa:
            return Response({
                "error": "colaborador_id e etapa são obrigatórios para limpar a decisão."
            }, status=status.HTTP_400_BAD_REQUEST)

        colaborador = get_object_or_404(Colaborador, id=colaborador_id)
        etapa_num = int(etapa)

        # Se for limpar a etapa 1, limpamos as decisões da etapa 1 e também da etapa 2. 
        # Se for a etapa 2, limpamos apenas a etapa 2.
        if etapa_num == 1:
            controles = ControleTermino.objects.filter(colaborador=colaborador, etapa__in=[1, 2])
        else:
            controles = ControleTermino.objects.filter(colaborador=colaborador, etapa=etapa_num)

        count = controles.count()
        if count > 0:
            controles.delete()

            # Registrar a ação de exclusão no log de auditoria do Django Admin
            if request.user.is_authenticated:
                from django.contrib.admin.models import LogEntry, DELETION
                from django.contrib.contenttypes.models import ContentType
                LogEntry.objects.log_action(
                    user_id=request.user.id,
                    content_type_id=ContentType.objects.get_for_model(ControleTermino).pk,
                    object_id=colaborador.pk,
                    object_repr=f"Limpeza de decisões da etapa {etapa_num} para {colaborador.nome}",
                    action_flag=DELETION,
                    change_message=f"Limpou decisões da etapa {etapa_num} para o colaborador {colaborador.nome} ({count} registros removidos)."
                )

            return Response({
                "message": f"Decisão da etapa {etapa_num} limpa com sucesso. {count} registros removidos."
            }, status=status.HTTP_200_OK)

        return Response({
            "message": "Nenhuma decisão encontrada para limpar nesta etapa."
        }, status=status.HTTP_200_OK)

    if request.method == "POST":
        colaborador_id = request.data.get("colaborador_id")
        acao = request.data.get("acao")
        observacao = request.data.get("observacao", "")
        etapa = request.data.get("etapa")

        colaborador = get_object_or_404(Colaborador, id=colaborador_id)

        if acao and etapa:
            controle = ControleTermino.objects.create(
                colaborador=colaborador,
                etapa=int(etapa),
                acao=acao,
                observacao=observacao,
                respondido_por=request.user.username if request.user.is_authenticated else "Usuário",
            )
            
            # Registrar a ação no log de auditoria do Django Admin
            if request.user.is_authenticated:
                from django.contrib.admin.models import LogEntry, ADDITION
                from django.contrib.contenttypes.models import ContentType
                LogEntry.objects.log_action(
                    user_id=request.user.id,
                    content_type_id=ContentType.objects.get_for_model(controle).pk,
                    object_id=controle.pk,
                    object_repr=str(controle),
                    action_flag=ADDITION,
                    change_message=f"Registrou decisão '{acao}' na etapa {etapa} para o colaborador {colaborador.nome}."
                )

            return Response(ControleTerminoSerializer(controle).data, status=status.HTTP_201_CREATED)
        return Response({
            "error": "Ação e etapa são obrigatórias para registro."
        }, status=status.HTTP_400_BAD_REQUEST)

    colaboradores_qs = _buscar_colaboradores_com_termino()

    search_query = request.GET.get("search", "").strip().lower()
    data_filtro = request.GET.get("data_filtro", "")
    data_fim = request.GET.get("data_fim", "")
    coordenador_query = request.GET.get("coordenador", "")
    status_gestao_query = request.GET.get("status_gestao", "")
    re_query = request.GET.get("re", "")
    nome_query = request.GET.get("nome", "")
    etapa_filtro = request.GET.get("etapa", "")
    acao_filtro = request.GET.get("acao", "")

    # Esta chamada aplica filtros de busca, coordenador, status de gestão, matrícula (RE) e nome do colaborador.
    colaboradores_qs = _filtrar_terminos_queryset(
        colaboradores_qs,
        search_query,
        coordenador_query,
        status_gestao_query,
        re_query=re_query,
        nome_query=nome_query,
    )

    today = date.today()
    processed_colaboradores = _processar_colaboradores_termino(
        colaboradores_qs,
        today,
        data_filtro,
        data_fim,
        etapa_filtro=etapa_filtro,
        acao_filtro=acao_filtro,
    )

    cache_info = _montar_cache_info_geovictoria(colaboradores_qs)
    ordenar_por = request.GET.get("ordenar", "data")
    _ordenar_colaboradores_termino(processed_colaboradores, ordenar_por)

    paginator = PageNumberPagination()
    paginator.page_size = 10
    page = paginator.paginate_queryset(processed_colaboradores, request)
    if page is not None:
        serializer = TerminoColaboradorSerializer(page, many=True)
        response = paginator.get_paginated_response(serializer.data)
        response.data["sincronizado_em"] = cache_info["sincronizado_em"] if cache_info else None
        return response

    serializer = TerminoColaboradorSerializer(processed_colaboradores, many=True)
    return Response({
        "results": serializer.data,
        "sincronizado_em": cache_info["sincronizado_em"] if cache_info else None,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def exportar_terminos_excel(request):
    """
    Exporta os términos filtrados para Excel.
    Garante o retorno do arquivo binário gerado a partir do DataFrame pandas.
    """
    colaboradores_qs = _buscar_colaboradores_com_termino()

    search_query = request.GET.get("search", "").strip().lower()
    data_filtro = request.GET.get("data_filtro", "")
    data_fim = request.GET.get("data_fim", "")
    coordenador_query = request.GET.get("coordenador", "")
    status_gestao_query = request.GET.get("status_gestao", "")
    re_query = request.GET.get("re", "")
    nome_query = request.GET.get("nome", "")
    etapa_filtro = request.GET.get("etapa", "")
    acao_filtro = request.GET.get("acao", "")

    # Filtra os colaboradores antes de gerar a planilha Excel com base nos filtros da tela.
    colaboradores_qs = _filtrar_terminos_queryset(
        colaboradores_qs,
        search_query,
        coordenador_query,
        status_gestao_query,
        re_query=re_query,
        nome_query=nome_query,
    )

    today = date.today()
    processed_colaboradores = _processar_colaboradores_termino(
        colaboradores_qs,
        today,
        data_filtro,
        data_fim,
        etapa_filtro=etapa_filtro,
        acao_filtro=acao_filtro,
    )

    if not processed_colaboradores:
        return Response({
            "success": False,
            "error": "Não há dados para exportar com os filtros selecionados."
        }, status=status.HTTP_400_BAD_REQUEST)

    data_rows = []
    for item in processed_colaboradores:
        colaborador = item["colaborador"]
        state = item["state"]
        historico = item["history"]
        ultima_obs = historico[0].observacao if historico else ""

        data_rows.append({
            "RE": colaborador.re,
            "Nome": colaborador.nome,
            "Loja": colaborador.loja.nome_referencia if colaborador.loja else colaborador.centro_custo,
            "Coordenador": colaborador.loja.coordenador.nome if colaborador.loja and colaborador.loja.coordenador else "-",
            "Admissão": colaborador.data_admissao.strftime("%d/%m/%Y") if colaborador.data_admissao else "",
            "Término 1": colaborador.termino_1.strftime("%d/%m/%Y") if colaborador.termino_1 else "",
            "Término 2": colaborador.termino_2.strftime("%d/%m/%Y") if colaborador.termino_2 else "",
            "Fase Atual": state["tipoTermino"],
            "Status": state["statusControle"],
            "Status Gestão": colaborador.status_gestao or "-",
            "Faltas": item.get("faltas", 0),
            "Atestados": item.get("atestados", 0),
            "Última Obs": ultima_obs,
        })

    df = pd.DataFrame(data_rows)
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Terminos")

    output.seek(0)

    response = HttpResponse(
        output.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    filename = f"terminos_experiencia_{today.strftime('%d_%m_%Y')}.xlsx"
    response["Content-Disposition"] = f'attachment; filename="{filename}"'

    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def colaborador_geovictoria_summary(request, colaborador_id):
    """
    Retorna faltas e atestados da GeoVictoria via chamada de API.
    """
    colaborador = get_object_or_404(Colaborador, id=colaborador_id)

    if not colaborador.cpf:
        return Response(
            {"error": "CPF do colaborador não cadastrado. Reimporte os dados da TOTVS."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        today = date.today()
        summary = geovictoria.get_timeoff_summary(
            colaborador.cpf,
            colaborador.data_admissao,
            today,
        )

        if not summary:
            return Response(
                {"error": "Não foi possível obter o resumo da GeoVictoria"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(summary)
    except Exception as exc:
        return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def colaborador_geovictoria_details(request, colaborador_id):
    """
    Retorna a lista detalhada de faltas e atestados da GeoVictoria para um colaborador específico.

    Por que existe: Esta view fornece ao modal de decisão de término no frontend um 
    detalhamento cronológico e individual das ausências do colaborador (data, tipo, dias e 
    observação) sob demanda do banco de dados local.
    """
    colaborador = get_object_or_404(Colaborador, id=colaborador_id)

    if not colaborador.cpf:
        return Response(
            {"error": "CPF do colaborador não cadastrado. Reimporte os dados da TOTVS."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        from .models import Ausencia

        # Busca o histórico de decisões do colaborador para congelar no término ou manutenção definitiva
        history = list(colaborador.controles_termino.all())
        data_limite = None
        for controle in history:
            if (controle.acao == "termino") or (controle.etapa == 2 and controle.acao == "manter"):
                dt_decisao = controle.created_at.date()
                if data_limite is None or dt_decisao < data_limite:
                    data_limite = dt_decisao

        ausencias_qs = Ausencia.objects.filter(colaborador=colaborador)
        if data_limite:
            ausencias_qs = ausencias_qs.filter(data__lte=data_limite)

        details = []
        for aus in ausencias_qs.order_by("data"):
            details.append({
                "tipo": aus.tipo.upper(),
                "descricao": aus.descricao,
                "data": aus.data.strftime("%Y-%m-%d")
            })
        return Response(details)
    except Exception as exc:
        return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _buscar_colaboradores_com_termino():
    """
    Mantém a consulta base de término em um único lugar para tela, exportação e sincronização.
    """
    from datetime import timedelta
    cutoff_date = date.today() - timedelta(days=10)

    return Colaborador.objects.exclude(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).filter(
        Q(termino_1__isnull=False) | Q(termino_2__isnull=False)
    ).filter(
        Q(termino_1__gte=cutoff_date) | Q(termino_2__gte=cutoff_date) | Q(controles_termino__isnull=False)
    ).distinct().select_related(
        "loja",
        "loja__coordenador",
        "loja__supervisor",
        "loja_gestao",
        "loja_gestao__coordenador",
        "loja_gestao__supervisor",
        "loja_geo",
    ).prefetch_related(
        "controles_termino",
    )


def _filtrar_terminos_queryset(
    colaboradores_qs,
    search_query,
    coordenador_query,
    status_gestao_query,
    re_query="",
    nome_query="",
):
    """
    Aplica filtros de banco de dados nos colaboradores de término para limitar a lista.
    Este filtro resolve buscas por termo geral, listas de matrícula (RE), nome, coordenador e status.
    Suporta a filtragem por registros sem informação (nulo/vazio) quando o valor "null" é recebido.
    """
    if search_query:
        # Modificado: Realiza a busca direto no banco de dados para evitar carregar milhares
        # de colaboradores na memória do Python e rodar loops demorados.
        colaboradores_qs = colaboradores_qs.filter(
            Q(nome__icontains=search_query) | Q(re__icontains=search_query)
        )

    if re_query:
        re_list = [r.strip() for r in re_query.split(",") if r.strip()]
        if re_list:
            has_null = "null" in re_list
            vals = [r for r in re_list if r != "null"]
            q_obj = Q()
            if vals:
                # Modificado: Busca parcial usando icontains, pois RE agora é um input de texto simples no frontend.
                q_vals = Q()
                for val in vals:
                    q_vals = q_vals | Q(re__icontains=val)
                q_obj = q_vals
            if has_null:
                q_obj = q_obj | Q(re__isnull=True) | Q(re="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if nome_query:
        nome_list = [n.strip() for n in nome_query.split(",") if n.strip()]
        if nome_list:
            has_null = "null" in nome_list
            vals = [n for n in nome_list if n != "null"]
            q_obj = Q()
            if vals:
                # Modificado: Busca parcial usando icontains, pois Nome agora é um input de texto simples no frontend.
                q_vals = Q()
                for val in vals:
                    q_vals = q_vals | Q(nome__icontains=val)
                q_obj = q_vals
            if has_null:
                q_obj = q_obj | Q(nome__isnull=True) | Q(nome="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if coordenador_query:
        coordenadores_list = [c.strip() for c in coordenador_query.split(",") if c.strip()]
        if coordenadores_list:
            has_null = "null" in coordenadores_list
            vals = [c for c in coordenadores_list if c != "null"]
            q_obj = Q()
            if vals:
                q_obj = Q(loja__coordenador__nome__in=vals)
            if has_null:
                q_obj = q_obj | Q(loja__isnull=True) | Q(loja__coordenador__isnull=True) | Q(loja__coordenador__nome="") | Q(loja__coordenador__nome__isnull=True)
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if status_gestao_query:
        status_list = [s.strip() for s in status_gestao_query.split(",") if s.strip()]
        if status_list:
            has_null = "null" in status_list
            vals = [s for s in status_list if s != "null"]
            q_obj = Q()
            if vals:
                q_obj = Q(status_gestao__in=vals)
            if has_null:
                q_obj = q_obj | Q(status_gestao__isnull=True) | Q(status_gestao="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    return colaboradores_qs


def _processar_colaboradores_termino(
    colaboradores_qs, today, data_filtro, data_fim, etapa_filtro=None, acao_filtro=None, calcular_ausencias=True
):
    """
    Calcula a fase de término e remove registros que não devem aparecer na tela.

    Por que existe: Centraliza o cálculo da etapa atual do término do contrato de experiência
    e permite filtrar os colaboradores pertencentes à primeira ou segunda etapa do período
    de experiência ou pela decisão/ação tomada antes da paginação e exportação.
    """
    from collections import defaultdict
    from .models import Ausencia

    colab_ids = [c.id for c in colaboradores_qs]
    ausencias_por_colab = defaultdict(list)
    
    if calcular_ausencias:
        todas_ausencias = Ausencia.objects.filter(colaborador_id__in=colab_ids)
        for aus in todas_ausencias:
            ausencias_por_colab[aus.colaborador_id].append(aus)

    processed_colaboradores = []

    for colaborador in colaboradores_qs:
        history = list(colaborador.controles_termino.all())
        state = derive_termino_state(colaborador, today, history)

        # Filtra pela etapa do término (1º ou 2º período) caso tenha sido selecionada no filtro
        if etapa_filtro:
            try:
                if state["etapaAtual"] != int(etapa_filtro):
                    continue
            except ValueError:
                pass

        # Filtra pela ação tomada na etapa atual do término caso tenha sido selecionada
        if acao_filtro:
            # Por que existe: Permite filtrar os colaboradores de acordo com as decisões
            # tomadas ou pendentes na etapa corrente (1 ou 2).
            if acao_filtro == "pendente":
                if state["encerrado"]:
                    continue
            elif acao_filtro == "prorrogado":
                if state["ultimaAcao"] != "prorrogado":
                    continue
            elif acao_filtro in ["manter", "termino"]:
                if not state["encerrado"] or state["ultimaAcao"] != acao_filtro:
                    continue

        latest_first = next((controle for controle in history if controle.etapa == 1), None)
        latest_second = next((controle for controle in history if controle.etapa == 2), None)

        # Regra de descarte por decurso de prazo (mais de 10 dias de atraso sem decisão registrada para a etapa atual)
        if state["etapaAtual"] == 1:
            if (
                colaborador.termino_1
                and (today - colaborador.termino_1).days > 10
                and not latest_first
            ):
                continue
        elif state["etapaAtual"] == 2:
            if (
                colaborador.termino_2
                and (today - colaborador.termino_2).days > 10
                and not latest_second
            ):
                continue

        relevant_date = colaborador.termino_2 if state["etapaAtual"] == 2 else colaborador.termino_1

        if _data_fora_do_periodo(relevant_date, data_filtro, data_fim):
            continue

        # Calcula o congelamento de faltas/atestados se houver decisão definitiva
        data_limite = None
        for controle in history:
            if (controle.acao == "termino") or (controle.etapa == 2 and controle.acao == "manter"):
                dt_decisao = controle.created_at.date()
                if data_limite is None or dt_decisao < data_limite:
                    data_limite = dt_decisao

        faltas_count = 0
        atestados_count = 0

        if calcular_ausencias:
            colab_ausencias = ausencias_por_colab.get(colaborador.id, [])
            for aus in colab_ausencias:
                if data_limite and aus.data > data_limite:
                    continue
                if aus.tipo == "falta":
                    faltas_count += 1
                elif aus.tipo == "atestado":
                    atestados_count += 1

            if colaborador.cpf:
                faltas_val = str(faltas_count)
                atestados_val = str(atestados_count)
            else:
                faltas_val = "-"
                atestados_val = "-"
        else:
            faltas_val = "0"
            atestados_val = "0"

        processed_colaboradores.append({
            "colaborador": colaborador,
            "state": state,
            "relevant_date": relevant_date,
            "history": history,
            "faltas": faltas_val,
            "atestados": atestados_val,
        })

    return processed_colaboradores


def _data_fora_do_periodo(relevant_date, data_filtro, data_fim):
    """
    Valida o período informado para reaproveitar a mesma regra em tela e exportação.
    """
    if data_filtro and relevant_date:
        try:
            filtro_date = date.fromisoformat(data_filtro)
            if relevant_date < filtro_date:
                return True
        except ValueError:
            pass

    if data_fim and relevant_date:
        try:
            fim_date = date.fromisoformat(data_fim)
            if relevant_date > fim_date:
                return True
        except ValueError:
            pass

    return False


def _montar_cache_info_geovictoria(colaboradores_qs):
    """
    Mostra ao usuário quando os dados de faltas e atestados vieram do cache sincronizado.
    """
    from .models import Ausencia
    max_updated = Ausencia.objects.aggregate(
        max_updated=models.Max("updated_at")
    )["max_updated"]

    if not max_updated:
        return None

    return {
        "sincronizado_em": max_updated.strftime("%d/%m/%Y"),
        "total_sucesso": colaboradores_qs.count(),
        "total_erros": 0,
    }


def _ordenar_colaboradores_termino(processed_colaboradores, ordenar_por):
    """
    Ordena a lista já processada porque alguns campos dependem da regra calculada em Python.
    """
    if ordenar_por == "ausencias":
        # Por que existe: Ordena os colaboradores pelo total acumulado de ausências (faltas + atestados) de forma decrescente.
        processed_colaboradores.sort(
            key=lambda item: (
                int(item.get("faltas", 0) if item.get("faltas") != "-" else 0) +
                int(item.get("atestados", 0) if item.get("atestados") != "-" else 0)
            ),
            reverse=True,
        )
    elif ordenar_por == "faltas":
        processed_colaboradores.sort(
            key=lambda item: int(item.get("faltas", 0) if item.get("faltas") != "-" else 0),
            reverse=True,
        )
    elif ordenar_por == "atestados":
        processed_colaboradores.sort(
            key=lambda item: int(item.get("atestados", 0) if item.get("atestados") != "-" else 0),
            reverse=True,
        )
    else:
        processed_colaboradores.sort(
            key=lambda item: (item["relevant_date"] is None, item["relevant_date"])
        )
