from datetime import date, timedelta, datetime
import os
import mimetypes

from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from usuarios.permissions import IsGestaoOrAdministrador
from lojas.models import Cargo
from .models import Colaborador, TestePromocao, HistoricoAcaoTeste
from .serializers import TestePromocaoSerializer, HistoricoAcaoTesteSerializer
from .services import geovictoria


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def testes_list(request):
    """
    Lista solicitações de teste de promoção (GET) ou cria uma nova solicitação (POST).
    
    Por que existe: Centraliza as operações principais do controle de testes de promoção,
    gerenciando a listagem com filtros rápidos de busca e o cadastro com upload obrigatório do anexo.
    """
    if request.method == "POST":
        colaborador_id = request.data.get("colaborador_id")
        data_inicio_str = request.data.get("data_inicio")
        cargo_teste = request.data.get("cargo_teste")
        anexo_file = request.FILES.get("anexo")

        if not colaborador_id or not data_inicio_str or not cargo_teste:
            return Response(
                {"error": "Os campos Colaborador, Data de Início e Cargo em Teste são obrigatórios."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not anexo_file:
            return Response(
                {"error": "O anexo da folha de teste é obrigatório para cadastrar o teste."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        colaborador = get_object_or_404(Colaborador, id=colaborador_id)

        try:
            data_inicio = datetime.strptime(data_inicio_str, "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"error": "Formato de data de início inválido. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Evita duplicidade de testes ativos ou pendentes para o mesmo colaborador
        if TestePromocao.objects.filter(colaborador=colaborador, status__in=["pendente", "ativo"]).exists():
            return Response(
                {"error": "Este colaborador já possui um teste de promoção ativo ou pendente de aprovação."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        teste = TestePromocao.objects.create(
            colaborador=colaborador,
            data_inicio=data_inicio,
            cargo_teste=cargo_teste,
            status="pendente",
            anexo=anexo_file,
            criado_por=request.user.username if request.user.is_authenticated else "Sistema",
        )

        return Response(TestePromocaoSerializer(teste).data, status=status.HTTP_201_CREATED)

    # Lógica de listagem (GET)
    testes_qs = TestePromocao.objects.select_related("colaborador", "colaborador__loja", "colaborador__loja__supervisor").all()

    search_query = request.GET.get("search", "").strip()
    status_query = request.GET.get("status", "").strip()
    loja_query = request.GET.get("loja", "").strip()

    if search_query:
        testes_qs = testes_qs.filter(
            Q(colaborador__nome__icontains=search_query) | Q(colaborador__re__icontains=search_query)
        )

    if status_query:
        testes_qs = testes_qs.filter(status=status_query)

    if loja_query:
        testes_qs = testes_qs.filter(colaborador__loja_id=loja_query)

    # Ordenação decrescente por criação padrão
    testes_qs = testes_qs.order_by("-created_at")

    # Verifica se o frontend solicitou a lista completa sem paginação.
    # Por que existe: Permite que o frontend busque todos os registros de uma vez para realizar
    # filtros complexos (como o de cobrança) e paginação de forma global no cliente.
    no_page = request.GET.get("no_page", "").lower() == "true"
    if no_page:
        serializer = TestePromocaoSerializer(testes_qs, many=True)
        return Response(serializer.data)

    paginator = PageNumberPagination()
    paginator.page_size = 10
    page = paginator.paginate_queryset(testes_qs, request)
    if page is not None:
        serializer = TestePromocaoSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    serializer = TestePromocaoSerializer(testes_qs, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def colaborador_ausencias_summary(request, pk):
    """
    Retorna o resumo consolidado e detalhado de ausências do colaborador vinculado ao teste,
    considerando o período de 1 ano recente ou a partir de sua data de admissão (o que for posterior).
    
    Por que existe: Centraliza a busca e consolidação de faltas e atestados do colaborador
    sob demanda (ao abrir o modal no frontend), evitando que consultas externas lentas à
    GeoVictoria travem a listagem principal de testes.
    """
    teste = get_object_or_404(TestePromocao, id=pk)
    colaborador = teste.colaborador

    if not colaborador.cpf:
        return Response(
            {"error": "CPF do colaborador não cadastrado na base de dados. Reimporte os dados da TOTVS."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        today = date.today()
        um_ano_atras = today - timedelta(days=365)
        # Inicia a contagem na admissão ou a 1 ano atrás (o que for mais recente/posterior)
        start_date = max(colaborador.data_admissao, um_ano_atras)

        # 1. Detalhamento Cronológico
        details = geovictoria.get_timeoff_details(
            colaborador.cpf,
            start_date,
            today,
        )

        # 2. Resumo Consolidado (Faltas e Atestados)
        summary = geovictoria.get_timeoff_summary(
            colaborador.cpf,
            start_date,
            today,
        )
        colab_summary = summary.get(colaborador.cpf, {"faltas": 0, "atestados": 0, "total": 0})

        return Response({
            "faltas": colab_summary.get("faltas", 0),
            "atestados": colab_summary.get("atestados", 0),
            "detalhes": details
        })
    except Exception as exc:
        return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def colaborador_ausencias_avulso(request, colaborador_id):
    """
    Retorna as ausências consolidadas e detalhadas de um colaborador específico antes de cadastrar o teste.
    
    Por que existe: Permite que a tela de cadastro consulte as ausências de 1 ano do funcionário
    assim que ele for selecionado no autocomplete, mostrando a informação atualizada para a tomada de decisão inicial.
    """
    colaborador = get_object_or_404(Colaborador, id=colaborador_id)

    if not colaborador.cpf:
        return Response(
            {"error": "CPF do colaborador não cadastrado na base de dados. Reimporte os dados da TOTVS."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        today = date.today()
        um_ano_atras = today - timedelta(days=365)
        # Inicia a contagem na admissão ou a 1 ano atrás (o que for mais recente/posterior)
        start_date = max(colaborador.data_admissao, um_ano_atras)

        # 1. Detalhamento Cronológico
        details = geovictoria.get_timeoff_details(
            colaborador.cpf,
            start_date,
            today,
        )

        # 2. Resumo Consolidado (Faltas e Atestados)
        summary = geovictoria.get_timeoff_summary(
            colaborador.cpf,
            start_date,
            today,
        )
        colab_summary = summary.get(colaborador.cpf, {"faltas": 0, "atestados": 0, "total": 0})

        return Response({
            "faltas": colab_summary.get("faltas", 0),
            "atestados": colab_summary.get("atestados", 0),
            "detalhes": details
        })
    except Exception as exc:
        return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def teste_aprovar(request, pk):
    """
    Aprova um teste de promoção pendente, alterando seu status para ativo.
    
    Por que existe: Permite ao analista de gestão oficializar a aprovação da solicitação,
    movendo o teste para o status ativo e registrando essa mudança de fase na timeline do histórico.
    """
    teste = get_object_or_404(TestePromocao, id=pk)

    if teste.status != "pendente":
        return Response(
            {"error": "Apenas testes com status Pendente de Aprovação podem ser aprovados."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    teste.status = "ativo"
    teste.save()

    # Cria o registro no histórico de ações
    HistoricoAcaoTeste.objects.create(
        teste=teste,
        acao="ativar",
        mes_referencia=0,  # 0 indica ativação inicial
        observacao="Solicitação de teste aprovada pelo coordenador.",
        solicitado_por="Coordenador",
        realizado_por=request.user.username if request.user.is_authenticated else "Sistema",
        data_acao=date.today(),
    )

    return Response(TestePromocaoSerializer(teste).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def teste_registrar_acao(request, pk):
    """
    Registra uma tomada de decisão mensal sobre o teste ativo (Pagar Prêmio, Promover, Cancelar).
    
    Por que existe: Implementa um fluxo mensal de duas etapas:
    1. Etapa de Resposta do Supervisor ('registrar_resposta').
    2. Etapa de Confirmação de Ação (executada pela gestão com base na resposta).
    A data é coletada automaticamente e o solicitante padrão é o supervisor da loja.
    """
    teste = get_object_or_404(TestePromocao, id=pk)

    if teste.status != "ativo":
        return Response(
            {"error": "Apenas testes ativos podem receber ações mensais de controle."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    acao = request.data.get("acao")
    observacao = request.data.get("observacao", "").strip()

    if not acao:
        return Response(
            {"error": "O campo Ação é obrigatório."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if acao not in ["registrar_resposta", "pagar_premio", "promover", "cancelar", "pagar_premio_cancelar"]:
        return Response(
            {"error": "Ação mensal inválida."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Conta prêmios pagos para determinar em qual mês de controle estamos (Mês 1, 2, 3 ou 4)
    premios_pagos = teste.historico_acoes.filter(acao__in=["pagar_premio", "pagar_premio_cancelar"]).count()
    mes_atual = premios_pagos + 1

    # Obter nome do supervisor do colaborador para preencher automaticamente
    supervisor_nome = "Supervisor"
    if teste.colaborador.loja and teste.colaborador.loja.supervisor:
        supervisor_nome = teste.colaborador.loja.supervisor.nome

    if acao == "registrar_resposta":
        resposta_supervisor = request.data.get("resposta_supervisor")
        
        # No primeiro mês a resposta é automaticamente pagar, a menos que seja explicitamente pagar_premio_cancelar
        if mes_atual == 1 and resposta_supervisor != "pagar_premio_cancelar":
            resposta_supervisor = "pagar_premio"

        if not resposta_supervisor:
            return Response(
                {"error": "A resposta do supervisor é obrigatória."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if resposta_supervisor not in ["pagar_premio", "promover", "cancelar", "pagar_premio_cancelar"]:
            return Response(
                {"error": "Resposta do supervisor inválida."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validações das regras de negócios de meses para a resposta do supervisor
        if mes_atual == 1:
            if resposta_supervisor == "promover":
                return Response(
                    {"error": "Não é permitido promover o colaborador no primeiro mês de teste. O prêmio deve ser pago obrigatoriamente."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif mes_atual == 4:
            if resposta_supervisor == "pagar_premio":
                return Response(
                    {"error": "O teste de promoção atingiu o limite de 4 meses. Escolha Promover ou Cancelar."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Exigência de observação para finalização (Promover, Cancelar ou Pagar Prêmio e Cancelar)
        if resposta_supervisor in ["promover", "cancelar", "pagar_premio_cancelar"] and not observacao:
            return Response(
                {"error": f"Para a resposta de {resposta_supervisor.replace('_', ' ').capitalize()} é obrigatório registrar uma observação."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Se já existe resposta do supervisor para o mês atual, atualiza; caso contrário, cria novo
        historico = teste.historico_acoes.filter(acao="registrar_resposta", mes_referencia=mes_atual).first()
        if historico:
            historico.resposta_supervisor = resposta_supervisor
            historico.observacao = observacao
            historico.realizado_por = request.user.username if request.user.is_authenticated else "Sistema"
            historico.data_acao = date.today()
            historico.save()
        else:
            historico = HistoricoAcaoTeste.objects.create(
                teste=teste,
                acao="registrar_resposta",
                resposta_supervisor=resposta_supervisor,
                mes_referencia=mes_atual,
                observacao=observacao,
                solicitado_por=supervisor_nome,
                realizado_por=request.user.username if request.user.is_authenticated else "Sistema",
                data_acao=date.today(),
            )

        return Response(TestePromocaoSerializer(teste).data, status=status.HTTP_200_OK)

    else:
        # Ação final: pagar_premio, promover, cancelar ou pagar_premio_cancelar
        # Valida se já existe resposta do supervisor para o mês atual
        resposta_reg = teste.historico_acoes.filter(acao="registrar_resposta", mes_referencia=mes_atual).first()
        if not resposta_reg:
            return Response(
                {"error": f"É necessário registrar a resposta do supervisor para o Mês {mes_atual} antes de aplicar a ação final."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Valida se a ação final condiz com a resposta registrada do supervisor
        if acao != resposta_reg.resposta_supervisor:
            return Response(
                {"error": f"A ação final de {acao.replace('_', ' ')} difere da resposta de {resposta_reg.resposta_supervisor.replace('_', ' ')} registrada pelo supervisor."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Registra a ação final executada
        historico = HistoricoAcaoTeste.objects.create(
            teste=teste,
            acao=acao,
            mes_referencia=mes_atual,
            observacao=observacao or f"Ação de {acao.replace('_', ' ')} executada conforme resposta do supervisor.",
            solicitado_por=supervisor_nome,
            realizado_por=request.user.username if request.user.is_authenticated else "Sistema",
            data_acao=date.today(),
        )

        # Atualiza o status final se for Promover ou Cancelar (ou Pagar Prêmio e Cancelar)
        if acao == "promover":
            teste.status = "promovido"
            teste.save()
        elif acao in ["cancelar", "pagar_premio_cancelar"]:
            teste.status = "cancelado"
            teste.save()

        return Response(TestePromocaoSerializer(teste).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def teste_anexo_download(request, pk):
    """
    Permite baixar ou visualizar a folha de teste anexada ao cadastro.
    
    Por que existe: Fornece o arquivo salvo em disco de forma controlada via HTTP,
    respeitando as regras de segurança e o caminho configurado no .env.
    """
    teste = get_object_or_404(TestePromocao, id=pk)

    if not teste.anexo:
        raise Http404("Nenhum arquivo anexado a este teste de promoção.")

    # Se o arquivo não existir fisicamente no local indicado
    file_path = teste.anexo.path
    if not os.path.exists(file_path):
        raise Http404("Arquivo físico do anexo não foi encontrado no servidor.")

    content_type, _ = mimetypes.guess_type(file_path)
    content_type = content_type or "application/octet-stream"

    # Usar FileResponse para permitir que o navegador abra PDFs nativamente, em vez de forçar download sempre
    response = FileResponse(open(file_path, "rb"), content_type=content_type)
    # Define o Header para exibição inline se for PDF/imagem ou attachment para download
    filename = os.path.basename(file_path)
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def cargos_unicos_list(request):
    """
    Retorna a lista ordenada de funções/cargos distintos cadastrados na base de dados (lojas_cargo).
    
    Por que existe: Permite ao usuário escolher a função em teste a partir das funções parametrizadas.
    """
    cargos = Cargo.objects.values_list("nome", flat=True)
    cargos_limpos = sorted(
        set(
            c.strip().upper()
            for c in cargos
            if c and c.strip()
        )
    )
    return Response(cargos_limpos)


@api_view(["PATCH", "POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def teste_alterar_data_inicio(request, pk):
    """
    Altera a data de início de um teste de promoção.
    
    Por que existe: Permite corrigir erros de digitação ou reagendamentos de início
    do período de teste, recalculando o ciclo e registrando a alteração na linha do tempo.
    """
    teste = get_object_or_404(TestePromocao, id=pk)
    nova_data_str = request.data.get("data_inicio")
    motivo = request.data.get("motivo", "").strip()

    if not nova_data_str:
        return Response(
            {"error": "O campo data de início é obrigatório."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        nova_data = datetime.strptime(nova_data_str, "%Y-%m-%d").date()
    except ValueError:
        return Response(
            {"error": "Formato de data inválido. Use o formato AAAA-MM-DD."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data_anterior = teste.data_inicio
    teste.data_inicio = nova_data
    teste.save()

    # Registra no histórico a alteração da data
    data_ant_fmt = data_anterior.strftime("%d/%m/%Y")
    data_nova_fmt = nova_data.strftime("%d/%m/%Y")
    obs = f"Data de início alterada de {data_ant_fmt} para {data_nova_fmt}."
    if motivo:
        obs += f" Motivo: {motivo}"

    HistoricoAcaoTeste.objects.create(
        teste=teste,
        acao="alterar_data_inicio",
        mes_referencia=0,
        observacao=obs,
        solicitado_por="Gestão",
        realizado_por=request.user.username if request.user.is_authenticated else "Sistema",
        data_acao=date.today(),
    )

    return Response(TestePromocaoSerializer(teste).data, status=status.HTTP_200_OK)
