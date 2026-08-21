from datetime import date
from decimal import Decimal
import json

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from unidecode import unidecode
from usuarios.permissions import IsAdministrador

from ..models import (
    MESES_CHOICES,
    TURNO_CHOICES,
    Cargo,
    EscopoMensal,
    ItemEscopoMensal,
    Loja,
    escala_insalubridade_fixa_para_escopo,
    montar_caches_salario_para_itens,
)
from ..serializers import EscopoMensalSerializer, ItemEscopoMensalSerializer, CargoSerializer
from .common import parse_int_param, escopo_duplicar_proximo_mes_para_todas_as_lojas

ESCOPOS_POR_PAGINA = 10

from rest_framework.pagination import PageNumberPagination

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def escopo_list(request):
    """
    Lista e filtra os escopos mensais em formato JSON com paginação nativa do DRF.
    """
    loja_id_raw = (request.GET.get("loja") or "").strip()
    lojas_list = []
    if loja_id_raw:
        lojas_list = [int(x) for x in loja_id_raw.split(",") if x.strip().isdigit()]

    busca_loja = (request.GET.get("busca_loja") or "").strip()
    ano_filtro = parse_int_param(request.GET.get("ano"), 2000, 2100)
    mes_filtro = parse_int_param(request.GET.get("mes"), 1, 12)

    escopos = (
        EscopoMensal.objects.select_related("loja")
        .prefetch_related("itens__cargo")
        .order_by("loja__nome_referencia", "-ano", "-mes")
    )

    if busca_loja:
        normalized_search = unidecode(busca_loja).upper()
        matching_store_ids = []
        lojas = Loja.objects.all()
        for loja in lojas:
            normalized_store_name = unidecode(loja.nome_referencia).upper()
            if normalized_search in normalized_store_name:
                matching_store_ids.append(loja.id)
        escopos = escopos.filter(loja_id__in=matching_store_ids)

    if lojas_list:
        escopos = escopos.filter(loja_id__in=lojas_list)

    if ano_filtro is not None:
        escopos = escopos.filter(ano=ano_filtro)

    if mes_filtro is not None:
        escopos = escopos.filter(mes=mes_filtro)

    paginator = PageNumberPagination()
    paginator.page_size = ESCOPOS_POR_PAGINA
    page = paginator.paginate_queryset(escopos, request)
    if page is not None:
        itens_flat = [item for esc in page for item in esc.itens.all()]
        cache_regional, cache_minimo = montar_caches_salario_para_itens(itens_flat)
        serializer = EscopoMensalSerializer(
            page,
            many=True,
            context={
                "cache_salarios_regional": cache_regional,
                "cache_salario_minimo_br_por_ano": cache_minimo,
            },
        )
        return paginator.get_paginated_response(serializer.data)

    itens_flat = [item for esc in escopos for item in esc.itens.all()]
    cache_regional, cache_minimo = montar_caches_salario_para_itens(itens_flat)
    serializer = EscopoMensalSerializer(
        escopos,
        many=True,
        context={
            "cache_salarios_regional": cache_regional,
            "cache_salario_minimo_br_por_ano": cache_minimo,
        },
    )
    return Response(serializer.data)

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def api_item_escopo_save(request):
    """
    Cria ou atualiza um item de escopo mensal via payload JSON.
    Garante o recálculo imediato do detalhamento da estimativa para retornar ao frontend.
    """
    data = request.data
    item_id = data.get("id")
    escopo_id = data.get("escopo_id")
    cargo_id = data.get("cargo_id")
    turno = data.get("turno")
    quantidade = data.get("quantidade")

    if item_id:
        item = get_object_or_404(ItemEscopoMensal, pk=item_id)
    else:
        if not escopo_id or not cargo_id or not turno:
            return Response({"success": False, "error": "Dados incompletos"}, status=status.HTTP_400_BAD_REQUEST)
        item = ItemEscopoMensal(escopo_mensal_id=escopo_id)

    if cargo_id:
        item.cargo_id = int(cargo_id)
    if turno:
        item.turno = turno
    if quantidade is not None:
        item.quantidade = int(quantidade)

    item.save()

    # Recalcula as estimativas unitárias e de escopo
    escala = escala_insalubridade_fixa_para_escopo(item.escopo_mensal)
    cache_reg, cache_min = montar_caches_salario_para_itens([item])
    det = item.get_estimativa_detalhada(cache_reg, cache_min, escala)

    total_escopo = Decimal("0")
    itens_escopo = list(item.escopo_mensal.itens.all())
    c_reg, c_min = montar_caches_salario_para_itens(itens_escopo)
    for i in itens_escopo:
        d = i.get_estimativa_detalhada(c_reg, c_min, escala)
        if d:
            total_escopo += d["total"]

    return Response({
        "success": True,
        "id": str(item.id),
        "cargo_nome": item.cargo.nome,
        "turno_display": item.get_turno_display(),
        "detalhes": {
            "base_total": str(det["base_total"]) if det else "0.00",
            "insal_fixa": str(det["insalubridade_fixa_total"]) if det else "0.00",
            "insal_ban": str(det["insalubridade_banheirista_total"]) if det else "0.00",
            "adic_not": str(det["adicional_noturno_total"]) if det else "0.00",
            "total": str(det["total"]) if det else "0.00",
        },
        "total_escopo": str(total_escopo),
    })

@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated, IsAdministrador])
def api_item_escopo_delete(request, pk):
    """
    Exclui um item de escopo do escopo mensal e recalcula o total financeiro resultante.
    """
    item = get_object_or_404(ItemEscopoMensal, pk=pk)
    escopo = item.escopo_mensal
    item.delete()

    escala = escala_insalubridade_fixa_para_escopo(escopo)
    itens_escopo = list(escopo.itens.all())
    cache_reg, cache_min = montar_caches_salario_para_itens(itens_escopo)
    total_escopo = Decimal("0")
    for i in itens_escopo:
        d = i.get_estimativa_detalhada(cache_reg, cache_min, escala)
        if d:
            total_escopo += d["total"]

    return Response({
        "success": True,
        "total_escopo": str(total_escopo)
    })

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def escopo_create(request):
    """
    Cria um escopo mensal completo com itens associados usando controle transacional.
    Previene integridade de dados e duplicação da mesma competência na loja.
    """
    data = request.data
    loja_id = data.get("loja")
    ano = data.get("ano")
    mes = data.get("mes")
    itens_data = data.get("itens", [])

    if not loja_id or not ano or not mes:
        return Response({
            "success": False,
            "error": "Lojas, ano e mês são campos obrigatórios."
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        with transaction.atomic():
            escopo = EscopoMensal.objects.create(
                loja_id=loja_id,
                ano=int(ano),
                mes=int(mes)
            )
            for item_data in itens_data:
                ItemEscopoMensal.objects.create(
                    escopo_mensal=escopo,
                    cargo_id=item_data.get("cargo"),
                    turno=item_data.get("turno"),
                    quantidade=int(item_data.get("quantidade", 1))
                )
            
            serializer = EscopoMensalSerializer(escopo)
            return Response({
                "success": True,
                "message": "Escopo mensal criado com sucesso.",
                "escopo": serializer.data
            }, status=status.HTTP_201_CREATED)
    except IntegrityError:
        return Response({
            "success": False,
            "error": "Já existe escopo para esta loja no ano/mês informado."
        }, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        return Response({
            "success": False,
            "error": str(exc)
        }, status=status.HTTP_400_BAD_REQUEST)

@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated, IsAdministrador])
def escopo_delete(request, pk):
    """
    Remove um escopo mensal e todos os seus itens em cascata.
    """
    escopo = get_object_or_404(EscopoMensal, pk=pk)
    loja_id = escopo.loja_id
    label = f"{escopo.loja.nome_referencia} — {escopo.mes:02d}/{escopo.ano}"
    escopo.delete()
    return Response({
        "success": True,
        "message": f"Escopo mensal excluído: {label}.",
        "loja_id": str(loja_id) if loja_id else None
    })

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def escopo_duplicar_proximo_mes(request):
    """
    Duplica em lote todos os escopos ativos do último mês registrado para a competência subsequente.
    """
    resumo = escopo_duplicar_proximo_mes_para_todas_as_lojas()
    return Response({
        "success": resumo["ok"],
        "message": resumo["mensagem"]
    })

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def cargo_list(request):
    """
    Esta view existe para expor a listagem de todos os cargos do banco de dados em formato JSON (GET)
    ou cadastrar novos cargos parametrizados no sistema (POST).
    """
    if request.method == "GET":
        cargos = Cargo.objects.all().order_by("nome")
        serializer = CargoSerializer(cargos, many=True)
        return Response(serializer.data)

    elif request.method == "POST":
        nome = (request.data.get("nome") or request.data.get("name") or "").strip()
        if not nome:
            return Response(
                {"error": "O nome do cargo é obrigatório."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existente = Cargo.objects.filter(nome__iexact=nome).first()
        if existente:
            return Response(CargoSerializer(existente).data, status=status.HTTP_200_OK)

        cargo = Cargo.objects.create(nome=nome.upper())
        return Response(CargoSerializer(cargo).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAdministrador])
def cargo_detail_api(request, pk):
    """
    Por que existe: Permite consultar, renomear ou remover cargos cadastrados por ID.
    """
    cargo = get_object_or_404(Cargo, pk=pk)
    if request.method == "GET":
        return Response(CargoSerializer(cargo).data)

    elif request.method in ["PUT", "PATCH"]:
        nome = (request.data.get("nome") or request.data.get("name") or "").strip()
        if not nome:
            return Response(
                {"error": "O nome do cargo é obrigatório."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cargo.nome = nome.upper()
        cargo.save()
        return Response(CargoSerializer(cargo).data)

    elif request.method == "DELETE":
        if cargo.salarios.exists():
            return Response(
                {"error": "Não é possível excluir este cargo pois existem salários vinculados a ele."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if cargo.itens_escopo_mensal.exists():
            return Response(
                {"error": "Não é possível excluir este cargo pois existem itens de escopo vinculados a ele."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cargo.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def lojas_sem_escopo(request):
    """
    Por que existe: Esta view retorna a listagem de todas as lojas que estão com o status ATIVA,
    mas que ainda não possuem nenhum planejamento de escopo mensal cadastrado no sistema.
    Isso serve para ajudar o usuário a identificar lojas recém-criadas que precisam de atenção.
    """
    lojas = Loja.objects.filter(status="ATIVA").exclude(
        escopos_mensais__isnull=False
    ).order_by("nome_referencia")
    data = [{"id": str(l.id), "nome_referencia": l.nome_referencia} for l in lojas]
    return Response(data)

