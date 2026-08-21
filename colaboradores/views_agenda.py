from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from usuarios.permissions import IsAdministrador
from django.db.models import Q
from django.db import transaction
from django.shortcuts import get_object_or_404
from unidecode import unidecode
from .models import Agendamento, Colaborador
from lojas.models import Loja
from .serializers import AgendamentoSerializer, ColaboradorSerializer, ColaboradorLightSerializer

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def agendamento_list_create(request):
    """
    Lista agendamentos ou salva agendamentos em lote (upsert).

    Por que existe: Centraliza as operações de busca mensal por colaborador 
    e permite que o gestor salve roteiros de múltiplos dias de uma única vez.
    """
    if request.method == "GET":
        colaborador_id = request.GET.get("colaborador_id")
        mes_ano = request.GET.get("mes_ano")  # Formato YYYY-MM
        
        queryset = Agendamento.objects.all()
        
        if colaborador_id:
            queryset = queryset.filter(colaborador_id=colaborador_id)
            
        if mes_ano:
            try:
                ano, mes = map(int, mes_ano.split('-'))
                queryset = queryset.filter(data__year=ano, data__month=mes)
            except ValueError:
                return Response(
                    {"error": "Formato de mes_ano inválido. Use YYYY-MM."},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        serializer = AgendamentoSerializer(queryset, many=True)
        return Response(serializer.data)

    elif request.method == "POST":
        # Recebe uma lista de agendamentos no body da requisição
        agendamentos_data = request.data
        if not isinstance(agendamentos_data, list):
            agendamentos_data = [agendamentos_data]

        saved_agendamentos = []
        errors = []

        with transaction.atomic():
            for data in agendamentos_data:
                colaborador_id = data.get("colaborador")
                data_roteiro = data.get("data")

                if not colaborador_id or not data_roteiro:
                    errors.append({"error": "Campos 'colaborador' e 'data' são obrigatórios."})
                    continue

                # Busca se já existe agendamento desse colaborador nessa data
                existing = Agendamento.objects.filter(
                    colaborador_id=colaborador_id,
                    data=data_roteiro
                ).first()

                serializer = AgendamentoSerializer(
                    existing,
                    data=data,
                    partial=True if existing else False
                )

                if serializer.is_valid():
                    agendamento = serializer.save()
                    saved_agendamentos.append(serializer.data)

                    # Registrar log de auditoria no Django Admin
                    if request.user.is_authenticated:
                        from django.contrib.admin.models import LogEntry, ADDITION, CHANGE
                        from django.contrib.contenttypes.models import ContentType
                        action_flag = CHANGE if existing else ADDITION
                        msg = (
                            f"Atualizou agendamento de {agendamento.colaborador.nome} em {agendamento.data} "
                            f"(Status: {agendamento.get_status_display()}, Turno: {agendamento.turno})"
                            if existing
                            else f"Criou agendamento de {agendamento.colaborador.nome} em {agendamento.data} "
                                 f"(Status: {agendamento.get_status_display()}, Turno: {agendamento.turno})"
                        )
                        LogEntry.objects.log_action(
                            user_id=request.user.id,
                            content_type_id=ContentType.objects.get_for_model(agendamento).pk,
                            object_id=agendamento.pk,
                            object_repr=str(agendamento),
                            action_flag=action_flag,
                            change_message=msg,
                        )
                else:
                    errors.append(serializer.errors)

        if errors:
            # Caso existam erros, faz rollback da transação automática do Django
            return Response(
                {"errors": errors, "saved": saved_agendamentos},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(saved_agendamentos, status=status.HTTP_200_OK)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated, IsAdministrador])
def agendamento_delete(request, pk):
    """
    Exclui um agendamento individual.

    Por que existe: Permite ao gestor limpar ou remover um roteiro específico de um colaborador.
    """
    agendamento = get_object_or_404(Agendamento, pk=pk)
    agendamento_repr = str(agendamento)
    agendamento_id = agendamento.pk
    
    # Registrar log de auditoria no Django Admin antes de excluir
    if request.user.is_authenticated:
        from django.contrib.admin.models import LogEntry, DELETION
        from django.contrib.contenttypes.models import ContentType
        LogEntry.objects.log_action(
            user_id=request.user.id,
            content_type_id=ContentType.objects.get_for_model(agendamento).pk,
            object_id=agendamento_id,
            object_repr=agendamento_repr,
            action_flag=DELETION,
            change_message=f"Excluiu agendamento: {agendamento_repr}"
        )

    agendamento.delete()
    return Response(status=status.HTTP_244_NO_CONTENT if hasattr(status, 'HTTP_244_NO_CONTENT') else status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def colaborador_ativos_completo(request):
    """
    Retorna todos os colaboradores ativos filtrados por busca (Nome ou RE).

    Por que existe: Fornece ao frontend a listagem de colaboradores ativos sob demanda
    à medida que o usuário digita na busca para não pesar o carregamento inicial da Agenda.
    """
    busca = request.GET.get("busca", "").strip()
    colaboradores_qs = Colaborador.objects.exclude(status="D").exclude(cargo="AUXILIAR ADMINISTRAT")
    
    if not busca:
        serializer = ColaboradorLightSerializer(colaboradores_qs[:50], many=True)
        return Response(serializer.data)

    # Normaliza a busca para ignorar acentos e maiúsculas/minúsculas
    busca_norm = unidecode(busca).lower()
    
    colabs_filtrados = []
    for c in colaboradores_qs:
        nome_norm = unidecode(c.nome).lower()
        re_norm = unidecode(c.re or "").lower()
        if busca_norm in nome_norm or busca_norm in re_norm:
            colabs_filtrados.append(c)
            if len(colabs_filtrados) >= 50:
                break

    serializer = ColaboradorLightSerializer(colabs_filtrados, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def historico_limpeza_vidros(request):
    """
    Calcula e retorna a lista de todas as lojas e há quantos dias foi a sua última limpeza de vidros.
    
    Por que existe: Esta view consolida as informações da escala diária para prover um
    painel de controle operacional e de periodicidade, ordenando as lojas da que está há mais tempo sem
    atendimento para a mais recente (apenas para o cargo/função de 'Limpador de Vidros').
    """
    from datetime import date
    hoje = date.today()
    
    # Lojas ativas
    lojas = Loja.objects.filter(status='ATIVA')
    
    # Busca agendamentos de limpadores de vidro com status concluído ou agendado no passado/presente
    agendamentos = Agendamento.objects.filter(
        data__lte=hoje,
        status__in=['concluido', 'agendado'],
        funcao__icontains='vidro'
    ).select_related('colaborador')
    
    # Dicionário mapeando loja_id -> último agendamento
    ultima_limpeza = {}
    for agend in agendamentos:
        if not agend.loja_id:
            continue
        loja_id = agend.loja_id
        if loja_id not in ultima_limpeza or agend.data > ultima_limpeza[loja_id].data:
            ultima_limpeza[loja_id] = agend

    resultado = []
    for loja in lojas:
        ultimo_agend = ultima_limpeza.get(loja.id)
        if ultimo_agend:
            dias_passados = (hoje - ultimo_agend.data).days
            ultima_data_str = ultimo_agend.data.strftime("%d/%m/%Y")
            colaborador_nome = ultimo_agend.colaborador.nome
            
            resultado.append({
                "loja_id": str(loja.id),
                "loja_nome": loja.nome_referencia,
                "ultima_data": ultima_data_str,
                "dias_passados": dias_passados,
                "colaborador": colaborador_nome
            })
        
    # Ordenação: Lojas ordenadas por dias_passados de forma decrescente (mais dias sem limpeza primeiro).
    resultado.sort(key=lambda x: -x["dias_passados"])
    
    return Response(resultado)


