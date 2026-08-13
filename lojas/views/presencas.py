from datetime import datetime, date, timedelta
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from usuarios.permissions import IsGestaoOrAdministrador
from ..models import Loja


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def loja_presencas_calendario_api(request, loja_id):
    """
    Por que existe: Retorna o consolidado de presenças registradas por dia para uma loja física
    específica em um determinado mês/ano.
    Evita carregar a lista de colaboradores de todos os dias de uma vez no frontend.
    """
    ano_mes = request.GET.get("ano_mes")  # Formato esperado: YYYY-MM (ex: 2026-05)
    if not ano_mes:
        return Response({"error": "Parâmetro 'ano_mes' é obrigatório (formato YYYY-MM)."}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        ano, mes = map(int, ano_mes.split("-"))
    except ValueError:
        return Response({"error": "Formato inválido de 'ano_mes'. Use YYYY-MM."}, status=status.HTTP_400_BAD_REQUEST)

    # Consulta consolidada agrupando por data
    from django.db.models import Count
    from colaboradores.models import PresencaRelogio

    dados = (
        PresencaRelogio.objects.filter(loja_id=loja_id, data__year=ano, data__month=mes)
        .values("data")
        .annotate(total=Count("id"))
        .order_by("data")
    )

    resultado = {d["data"].strftime("%Y-%m-%d"): d["total"] for d in dados}
    return Response(resultado, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def loja_presencas_dia_api(request, loja_id):
    """
    Por que existe: Retorna o detalhamento (quem marcou presença e que horas)
    em uma determinada loja física em um dia específico.
    Isso é executado somente quando o usuário clica em um dia no calendário do frontend.
    """
    data_str = request.GET.get("data")  # Formato esperado: YYYY-MM-DD
    if not data_str:
        return Response({"error": "Parâmetro 'data' é obrigatório (formato YYYY-MM-DD)."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        data_obj = datetime.strptime(data_str, "%Y-%m-%d").date()
    except ValueError:
        return Response({"error": "Formato inválido de 'data'. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

    from colaboradores.models import PresencaRelogio

    presencas = (
        PresencaRelogio.objects.filter(loja_id=loja_id, data=data_obj)
        .select_related("colaborador")
        .order_by("data_hora")
    )

    from django.utils import timezone

    lista = []
    for p in presencas:
        # Converte o datetime armazenado em UTC no banco para o fuso horário local configurado
        horario_local = timezone.localtime(p.data_hora)
        lista.append({
            "punch_id": p.punch_id,
            "cpf": p.cpf_original,
            "nome": p.colaborador.nome if p.colaborador else "Colaborador Não Identificado",
            "re": p.colaborador.re if p.colaborador else "N/A",
            "cargo": p.colaborador.cargo if p.colaborador else "N/A",
            "horario_entrada": horario_local.strftime("%H:%M:%S")
        })

    return Response(lista, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def lojas_presencas_sincronizar_geral_api(request):
    """
    Por que existe: Sincroniza em tempo real as batidas do dia anterior (ontem) de todas as lojas.
    """
    from colaboradores.services.geovictoria_punches_sync import sincronizar_punches_api
    
    ontem = date.today() - timedelta(days=1)

    try:
        res = sincronizar_punches_api(ontem, ontem, loja_id=None)
        return Response({
            "success": True,
            "message": "Sincronização geral de ontem concluída com sucesso!",
            "dados": res
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def loja_presencas_sincronizar_individual_api(request, loja_id):
    """
    Por que existe: Sincroniza em tempo real as batidas dos últimos 3 dias para uma loja específica.
    """
    from colaboradores.services.geovictoria_punches_sync import sincronizar_punches_api
    
    fim = date.today()
    inicio = fim - timedelta(days=3)

    try:
        res = sincronizar_punches_api(inicio, fim, loja_id=loja_id)
        return Response({
            "success": True,
            "message": f"Sincronização individual dos últimos 3 dias concluída com sucesso!",
            "dados": res
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def loja_presencas_sincronizar_progresso_api(request):
    """
    Por que existe: Retorna o progresso em tempo real da sincronização de batidas do relógio GeoVictoria.
    """
    from django.core.cache import cache
    status_sync = cache.get("sync_punches_status")
    return Response(status_sync or {"page": 0, "total_pages": 0, "msg": "Aguardando..."}, status=status.HTTP_200_OK)
