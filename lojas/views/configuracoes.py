import threading
import uuid
from io import BytesIO

from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from usuarios.permissions import IsAdministrador, IsGestaoOrAdministrador

from colaboradores.services.colaborador_importacao import importar_colaboradores_de_texto
from colaboradores.services.gestao_importacao import importar_gestao_pessoas
from colaboradores.services.turnover_importacao import importar_turnover_de_texto
from lojas.services.folha_importacao import importar_folha_de_texto
from lojas.services.diaria_importacao import importar_diarias_de_texto
from lojas.services.premio_importacao import importar_premios_de_excel


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def importacoes(request):
    """
    Retorna os metadados da Central de Importações, informando que o serviço está ativo.
    Substitui a renderização do antigo template importacoes.html.
    """
    return Response({
        "status": "active",
        "message": "Central de Importações pronta para uploads.",
        "endpoints": {
            "colaboradores_sra": "/colaboradores/importar/",
            "gestao_pessoas": "/colaboradores/importar-gestao/",
            "folha_srd": "/folhas/importar/",
            "diarias": "/diarias/importar/"
        }
    })

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def colaborador_import_async(request):
    """
    Inicia a importação assíncrona do arquivo SRA (TOTVS) via upload multipart/form-data.
    """
    arquivo = request.FILES.get("arquivo")
    if not arquivo:
        return Response({"success": False, "error": "Nenhum arquivo enviado."}, status=status.HTTP_400_BAD_REQUEST)
    
    if not arquivo.name.lower().endswith(".csv"):
        return Response({"success": False, "error": "Envie um arquivo CSV válido."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        conteudo = arquivo.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return Response({
            "success": False,
            "error": "Não foi possível ler o arquivo. Certifique-se de que é um CSV em UTF-8."
        }, status=status.HTTP_400_BAD_REQUEST)

    if request.user.is_authenticated:
        from django.contrib.admin.models import LogEntry, CHANGE
        from django.contrib.contenttypes.models import ContentType
        from colaboradores.models import Colaborador
        LogEntry.objects.log_action(
            user_id=request.user.id,
            content_type_id=ContentType.objects.get_for_model(Colaborador).pk,
            object_id=0,
            object_repr="Importação SRA (TOTVS)",
            action_flag=CHANGE,
            change_message=f"Iniciou a importação do arquivo SRA: {arquivo.name}"
        )

    return _iniciar_importacao_async(
        tipo_importacao="sra",
        payload={"conteudo": conteudo},
        titulo="Progresso da Importacao SRA",
        mensagem_inicial="Iniciando processamento do arquivo SRA...",
    )

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def gestao_import_async(request):
    """
    Inicia a importação assíncrona da planilha de Gestão de Pessoas (Excel).
    """
    arquivo = request.FILES.get("arquivo")
    if not arquivo:
        return Response({"success": False, "error": "Nenhum arquivo enviado."}, status=status.HTTP_400_BAD_REQUEST)

    nome = (arquivo.name or "").lower()
    if not (nome.endswith(".xlsx") or nome.endswith(".xlsm") or nome.endswith(".xls")):
        return Response({
            "success": False,
            "error": "Envie uma planilha Excel válida (.xlsx, .xlsm, .xls)."
        }, status=status.HTTP_400_BAD_REQUEST)

    if request.user.is_authenticated:
        from django.contrib.admin.models import LogEntry, CHANGE
        from django.contrib.contenttypes.models import ContentType
        from colaboradores.models import Colaborador
        LogEntry.objects.log_action(
            user_id=request.user.id,
            content_type_id=ContentType.objects.get_for_model(Colaborador).pk,
            object_id=0,
            object_repr="Importação de Gestão de Pessoas",
            action_flag=CHANGE,
            change_message=f"Iniciou a importação da planilha de Gestão de Pessoas: {arquivo.name}"
        )

    return _iniciar_importacao_async(
        tipo_importacao="gestao",
        payload={"conteudo": arquivo.read(), "nome": arquivo.name or "gestao.xlsm"},
        titulo="Progresso da Importacao Gestao",
        mensagem_inicial="Iniciando processamento da planilha de Gestao...",
    )

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def punches_report_import_async(request):
    """
    Inicia a importação assíncrona do Relatório de Marcas/Batidas (Excel) da GeoVictoria.
    """
    arquivo = request.FILES.get("arquivo")
    if not arquivo:
        return Response({"success": False, "error": "Nenhum arquivo enviado."}, status=status.HTTP_400_BAD_REQUEST)

    nome = (arquivo.name or "").lower()
    if not (nome.endswith(".xlsx") or nome.endswith(".xlsm") or nome.endswith(".xls")):
        return Response({
            "success": False,
            "error": "Envie uma planilha Excel válida (.xlsx, .xlsm, .xls)."
        }, status=status.HTTP_400_BAD_REQUEST)

    if request.user.is_authenticated:
        from django.contrib.admin.models import LogEntry, CHANGE
        from django.contrib.contenttypes.models import ContentType
        from colaboradores.models import PresencaRelogio
        LogEntry.objects.log_action(
            user_id=request.user.id,
            content_type_id=ContentType.objects.get_for_model(PresencaRelogio).pk,
            object_id=0,
            object_repr="Importação de Relatório de Marcas (GeoVictoria)",
            action_flag=CHANGE,
            change_message=f"Iniciou a importação do relatório de batidas: {arquivo.name}"
        )

    return _iniciar_importacao_async(
        tipo_importacao="marcas",
        payload={"conteudo": arquivo.read(), "nome": arquivo.name or "marcas.xlsx"},
        titulo="Progresso da Importação do Relatório de Marcas",
        mensagem_inicial="Iniciando processamento do relatório de batidas...",
    )

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def turnover_import_async(request):
    """
    Inicia a importação assíncrona da planilha de Turnover/Termos (terminos.csv).
    
    Docstring explicativa em português:
    Esta view recebe o arquivo CSV de termos, lê seu conteúdo e inicia uma thread assíncrona
    para processar o mapeamento de motivos de demissão e o cálculo de discrepâncias no background,
    retornando um ID de importação para acompanhamento.
    """
    # Por que existe: Exige permissão explícita no novo módulo de turnover
    from django.db import DatabaseError
    user = request.user
    group = user.groups.first()
    if not user.is_superuser:
        from usuarios.models import RolePermission
        try:
            perm = RolePermission.objects.get(group=group, module="turnover")
            if not perm.can_create:
                return Response({"success": False, "error": "Você não possui permissão para importar dados de turnover."}, status=status.HTTP_403_FORBIDDEN)
        except (RolePermission.DoesNotExist, DatabaseError):
            return Response({"success": False, "error": "Erro ao validar permissões de turnover."}, status=status.HTTP_403_FORBIDDEN)

    arquivo = request.FILES.get("arquivo")
    if not arquivo:
        return Response({"success": False, "error": "Nenhum arquivo enviado."}, status=status.HTTP_400_BAD_REQUEST)
    
    if not arquivo.name.lower().endswith(".csv"):
        return Response({"success": False, "error": "Envie um arquivo CSV de termos válido."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        conteudo = arquivo.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            # Tenta decodificar como ISO-8859-1 se UTF-8-sig falhar
            conteudo = arquivo.read().decode("iso-8859-1")
        except UnicodeDecodeError:
            return Response({
                "success": False,
                "error": "Não foi possível ler o arquivo. Certifique-se de que é um CSV em UTF-8 ou ISO-8859-1."
            }, status=status.HTTP_400_BAD_REQUEST)

    if request.user.is_authenticated:
        from django.contrib.admin.models import LogEntry, CHANGE
        from django.contrib.contenttypes.models import ContentType
        from colaboradores.models import Colaborador
        LogEntry.objects.log_action(
            user_id=request.user.id,
            content_type_id=ContentType.objects.get_for_model(Colaborador).pk,
            object_id=0,
            object_repr="Importação de Turnover (Termos)",
            action_flag=CHANGE,
            change_message=f"Iniciou a importação do arquivo de termos: {arquivo.name}"
        )

    return _iniciar_importacao_async(
        tipo_importacao="turnover",
        payload={"conteudo": conteudo},
        titulo="Progresso da Importação de Turnover",
        mensagem_inicial="Iniciando processamento do arquivo de termos de rescisão...",
    )

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def folha_import_async(request):
    """
    Inicia a importação assíncrona do arquivo SRD (Folha TOTVS) via upload.
    """
    arquivo = request.FILES.get("arquivo")
    if not arquivo:
        return Response({"success": False, "error": "Nenhum arquivo enviado."}, status=status.HTTP_400_BAD_REQUEST)

    if not arquivo.name.lower().endswith(".csv"):
        return Response({"success": False, "error": "Envie um arquivo CSV de folha válido."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        conteudo = arquivo.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return Response({
            "success": False,
            "error": "Não foi possível ler o arquivo. Salve o CSV em UTF-8 e tente de novo."
        }, status=status.HTTP_400_BAD_REQUEST)

    if request.user.is_authenticated:
        from django.contrib.admin.models import LogEntry, CHANGE
        from django.contrib.contenttypes.models import ContentType
        from lojas.models import LinhaFolha
        LogEntry.objects.log_action(
            user_id=request.user.id,
            content_type_id=ContentType.objects.get_for_model(LinhaFolha).pk,
            object_id=0,
            object_repr="Importação SRD (Folha TOTVS)",
            action_flag=CHANGE,
            change_message=f"Iniciou a importação do arquivo SRD: {arquivo.name}"
        )

    return _iniciar_importacao_async(
        tipo_importacao="folha",
        payload={"conteudo": conteudo, "nome": arquivo.name or "folha.csv"},
        titulo="Progresso da Importacao SRD",
        mensagem_inicial="Iniciando processamento do arquivo SRD...",
    )

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def diaria_import_async(request):
    """
    Inicia a importação assíncrona dos arquivos de Diárias (Sistema e Manual) via upload.
    """
    arquivo_sistema = request.FILES.get("arquivo_sistema")
    arquivo_manual = request.FILES.get("arquivo_manual")

    if not arquivo_sistema or not arquivo_manual:
        return Response({
            "success": False, 
            "error": "Forneça ambos os arquivos: a Base do Sistema e a Base Manual."
        }, status=status.HTTP_400_BAD_REQUEST)

    if not arquivo_sistema.name.lower().endswith(".csv"):
        return Response({
            "success": False,
            "error": "O arquivo da Base do Sistema deve ser um CSV de diárias válido."
        }, status=status.HTTP_400_BAD_REQUEST)

    nome_manual = (arquivo_manual.name or "").lower()
    if not (nome_manual.endswith(".xlsx") or nome_manual.endswith(".xlsm") or nome_manual.endswith(".xls")):
        return Response({
            "success": False,
            "error": "O arquivo da Base Manual deve ser uma planilha Excel válida."
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        conteudo_sistema = arquivo_sistema.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            conteudo_sistema = arquivo_sistema.read().decode("iso-8859-1")
        except UnicodeDecodeError:
            return Response({
                "success": False,
                "error": "Não foi possível ler o arquivo do sistema. Salve o CSV em UTF-8 e tente de novo."
            }, status=status.HTTP_400_BAD_REQUEST)

    if request.user.is_authenticated:
        from django.contrib.admin.models import LogEntry, CHANGE
        from django.contrib.contenttypes.models import ContentType
        from lojas.models import Diaria
        LogEntry.objects.log_action(
            user_id=request.user.id,
            content_type_id=ContentType.objects.get_for_model(Diaria).pk,
            object_id=0,
            object_repr="Importação Unificada de Diárias",
            action_flag=CHANGE,
            change_message=f"Iniciou a importação unificada de diárias: {arquivo_sistema.name} e {arquivo_manual.name}"
        )

    payload = {
        "conteudo_sistema": conteudo_sistema,
        "nome_sistema": arquivo_sistema.name,
        "conteudo_manual": arquivo_manual.read(),
        "nome_manual": arquivo_manual.name
    }

    return _iniciar_importacao_async(
        tipo_importacao="diaria",
        payload=payload,
        titulo="Progresso da Importação Unificada de Diárias",
        mensagem_inicial="Iniciando processamento das diárias (Sistema e Manual)...",
    )

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def premio_import_async(request):
    """
    Inicia a importação assíncrona dos arquivos de Prêmios (Sistema e Manual) via upload.
    Realiza a unificação das duas bases e substitui o período informado.
    """
    arquivo_sistema = request.FILES.get("arquivo_sistema")
    arquivo_manual = request.FILES.get("arquivo_manual")
    periodo = request.data.get("periodo") or request.POST.get("periodo")

    if not arquivo_sistema or not arquivo_manual:
        return Response({
            "success": False, 
            "error": "Forneça ambos os arquivos: a Base do Sistema e a Base Manual."
        }, status=status.HTTP_400_BAD_REQUEST)

    if not periodo:
        return Response({
            "success": False,
            "error": "Informe o período de referência (Mês/Ano) que deseja unificar e importar."
        }, status=status.HTTP_400_BAD_REQUEST)

    for arquivo, nome_campo in [(arquivo_sistema, "Base do Sistema"), (arquivo_manual, "Base Manual")]:
        nome = (arquivo.name or "").lower()
        if not (nome.endswith(".xlsx") or nome.endswith(".xlsm") or nome.endswith(".xls")):
            return Response({
                "success": False,
                "error": f"O arquivo enviado como {nome_campo} deve ser uma planilha Excel válida (.xlsx, .xlsm, .xls)."
            }, status=status.HTTP_400_BAD_REQUEST)

    periodo_limpo = str(periodo).strip().replace("-", "")
    if len(periodo_limpo) != 6 or not periodo_limpo.isdigit():
        return Response({
            "success": False,
            "error": "O período deve estar no formato YYYYMM ou YYYY-MM (ex.: 2026-02)."
        }, status=status.HTTP_400_BAD_REQUEST)

    if request.user.is_authenticated:
        from django.contrib.admin.models import LogEntry, CHANGE
        from django.contrib.contenttypes.models import ContentType
        from lojas.models import Premio
        LogEntry.objects.log_action(
            user_id=request.user.id,
            content_type_id=ContentType.objects.get_for_model(Premio).pk,
            object_id=0,
            object_repr=f"Importação Unificada Prêmios — {periodo_limpo}",
            action_flag=CHANGE,
            change_message=f"Iniciou a importação unificada de prêmios para o período {periodo_limpo}"
        )

    payload = {
        "conteudo_sistema": arquivo_sistema.read(),
        "nome_sistema": arquivo_sistema.name,
        "conteudo_manual": arquivo_manual.read(),
        "nome_manual": arquivo_manual.name,
        "periodo": periodo_limpo
    }

    return _iniciar_importacao_async(
        tipo_importacao="premio",
        payload=payload,
        titulo=f"Progresso da Importação Unificada — {periodo_limpo}",
        mensagem_inicial=f"Iniciando a unificação e processamento de prêmios do período {periodo_limpo}...",
    )

def _iniciar_importacao_async(tipo_importacao, payload, titulo, mensagem_inicial):
    """
    Função utilitária que inicia a thread de importação em background
    e retorna o ID para acompanhamento pelo frontend.
    """
    import_id = str(uuid.uuid4())

    cache.set(f"import_payload_{import_id}", payload, timeout=600)
    cache.set(
        f"import_status_{import_id}",
        {
            "status": "processing",
            "progress": 0,
            "message": mensagem_inicial,
            "result": None,
            "titulo": titulo,
        },
        timeout=600,
    )

    thread = threading.Thread(
        target=_processar_importacao_background,
        args=(import_id, tipo_importacao),
        daemon=True,
    )
    thread.start()

    return Response({
        "success": True,
        "import_id": import_id,
        "message": mensagem_inicial,
        "status": "processing"
    })

def _processar_importacao_background(import_id, tipo_importacao):
    """
    Processa o arquivo fora da resposta HTTP e atualiza o cache com o progresso.
    """
    def atualizar_progresso(progresso, mensagem):
        cache.set(
            f"import_status_{import_id}",
            {
                "status": "processing",
                "progress": progresso,
                "message": mensagem,
            },
            timeout=600,
        )

    try:
        payload = cache.get(f"import_payload_{import_id}")
        if not payload:
            raise ValueError(
                "Arquivo expirado ou nao encontrado. Envie novamente pela Central de Importacoes."
            )

        atualizar_progresso(0, "Lendo arquivo enviado...")

        if tipo_importacao == "sra":
            resultado = importar_colaboradores_de_texto(
                payload["conteudo"],
                progress_callback=atualizar_progresso,
            )
            mensagem, status_msg = _montar_mensagem_sra(resultado)
        elif tipo_importacao == "turnover":
            resultado = importar_turnover_de_texto(
                payload["conteudo"],
                progress_callback=atualizar_progresso,
            )
            mensagem, status_msg = _montar_mensagem_turnover(resultado)
        elif tipo_importacao == "gestao":
            arquivo_excel = BytesIO(payload["conteudo"])
            arquivo_excel.name = payload.get("nome", "gestao.xlsm")
            resultado = importar_gestao_pessoas(
                arquivo_excel,
                progress_callback=atualizar_progresso,
            )
            mensagem, status_msg = _montar_mensagem_gestao(resultado)
        elif tipo_importacao == "folha":
            resultado = importar_folha_de_texto(
                payload["conteudo"],
                payload.get("nome", "folha.csv"),
                dry_run=False,
                progress_callback=atualizar_progresso,
            )
            mensagem, status_msg = _montar_mensagem_folha(resultado)
        elif tipo_importacao == "diaria":
            from lojas.services.diaria_importacao import importar_diarias_unificadas
            conteudo_csv = payload["conteudo_sistema"]
            arquivo_manual = BytesIO(payload["conteudo_manual"])
            arquivo_manual.name = payload["nome_manual"]
            resultado = importar_diarias_unificadas(
                conteudo_csv=conteudo_csv,
                arquivo_manual=arquivo_manual,
                progress_callback=atualizar_progresso,
            )
            mensagem, status_msg = _montar_mensagem_diaria(resultado)
        elif tipo_importacao == "premio":
            from lojas.services.premio_importacao import importar_premios_unificados
            arquivo_sistema = BytesIO(payload["conteudo_sistema"])
            arquivo_sistema.name = payload["nome_sistema"]
            arquivo_manual = BytesIO(payload["conteudo_manual"])
            arquivo_manual.name = payload["nome_manual"]
            periodo = payload["periodo"]

            resultado = importar_premios_unificados(
                arquivo_sistema=arquivo_sistema,
                arquivo_manual=arquivo_manual,
                periodo=periodo,
                progress_callback=atualizar_progresso,
            )
            mensagem, status_msg = _montar_mensagem_premio(resultado)
        elif tipo_importacao == "marcas":
            from colaboradores.services.geovictoria_report_import import importar_marcas_de_planilha
            arquivo_excel = BytesIO(payload["conteudo"])
            arquivo_excel.name = payload.get("nome", "marcas.xlsx")
            resultado = importar_marcas_de_planilha(
                arquivo_excel,
                progress_callback=atualizar_progresso,
            )
            mensagem, status_msg = resultado["mensagem"], "success"
        else:
            raise ValueError("Tipo de importacao invalido.")

        cache.delete(f"import_payload_{import_id}")
        cache.set(
            f"import_status_{import_id}",
            {
                "status": "completed",
                "progress": 100,
                "message": mensagem,
                "result": resultado,
                "msg_type": status_msg,
            },
            timeout=600,
        )

    except ValueError as exc:
        cache.set(
            f"import_status_{import_id}",
            {"status": "error", "progress": 0, "message": str(exc)},
            timeout=600,
        )
    except Exception as exc:
        cache.set(
            f"import_status_{import_id}",
            {
                "status": "error",
                "progress": 0,
                "message": f"Erro inesperado: {str(exc)}",
            },
            timeout=600,
        )

def _montar_mensagem_turnover(resultado):
    total = resultado.get("total", 0)
    if total == 0:
        return "Nenhum termo de rescisão encontrado no arquivo. Verifique o formato.", "warning"

    atualizados = resultado.get("atualizados", 0)
    desc_csv_sistema = len(resultado.get("descrepancias_csv_para_sistema", []))
    desc_sistema_csv = len(resultado.get("descrepancias_sistema_para_csv", []))

    mensagem = (
        f"Importação de Turnover concluída: {total} registros processados. "
        f"{atualizados} colaborador(es) atualizado(s) com o motivo de desligamento."
    )
    
    tem_alerta = desc_csv_sistema > 0 or desc_sistema_csv > 0
    if tem_alerta:
        mensagem += f" Atenção: Foram detectadas discrepâncias no cruzamento de dados (CSV vs Banco)."
        return mensagem, "warning"

    return mensagem, "success"

def _montar_mensagem_sra(resultado):
    if resultado["total"] == 0:
        return "Nenhum colaborador encontrado no arquivo. Verifique o formato.", "warning"

    mensagem = (
        f"Importacao concluida: {resultado['total']} processados. "
        f"{resultado['criados']} novos, {resultado['atualizados']} atualizados."
    )
    if resultado["erros"] > 0:
        mensagem += f" {resultado['erros']} erros ignorados."
        return mensagem, "warning"
    return mensagem, "success"

def _montar_mensagem_gestao(resultado):
    if resultado["total_planilha"] == 0:
        return "Nenhum colaborador valido encontrado na planilha.", "warning"

    mensagem = (
        f"Importacao Gestao concluida: {resultado['total_planilha']} processados. "
        f"{resultado['atualizados']} atualizados, "
        f"{resultado['sem_alteracao']} sem alteracao. "
        f"{resultado['lojas_gestao_encontradas']} lojas vinculadas pelo nome da Gestao."
    )

    if resultado["nao_encontrados"] > 0:
        mensagem += f" {resultado['nao_encontrados']} nao encontrados no banco."
    if resultado["lojas_gestao_nao_encontradas"] > 0:
        mensagem += f" {resultado['lojas_gestao_nao_encontradas']} lojas da Gestao sem correspondencia."
    if resultado["lojas_gestao_duplicadas"] > 0:
        mensagem += f" {resultado['lojas_gestao_duplicadas']} nomes de Gestao duplicados no cadastro de lojas."

    alertas = resultado.get("alertas_status_multiplo", [])
    if alertas:
        mensagem += f" Atenção: {len(alertas)} colaborador(es) com múltiplos status diferentes na planilha."

    tem_alerta = (
        resultado["erros"] > 0
        or resultado["lojas_gestao_nao_encontradas"] > 0
        or resultado["lojas_gestao_duplicadas"] > 0
        or len(alertas) > 0
    )
    if resultado["erros"] > 0:
        mensagem += f" {resultado['erros']} erros ignorados."

    return mensagem, "warning" if tem_alerta else "success"

def _montar_mensagem_folha(resultado):
    if resultado["processadas"] == 0:
        return "Nenhuma linha elegivel encontrada. Verifique verbas e colunas do CSV.", "warning"

    mensagem = (
        f"Importacao SRD concluida: {resultado['gravadas']} linha(s) gravada(s). "
        f"Processadas: {resultado['processadas']}; "
        f"duplicadas: {resultado['ignoradas_duplicadas']}; "
        f"sem loja: {resultado['sem_loja']}."
    )

    if resultado["gravadas"] == 0 or resultado["ignoradas_duplicadas"] > 0 or resultado["sem_loja"] > 0:
        return mensagem, "warning"
    return mensagem, "success"

def _montar_mensagem_diaria(resultado):
    total_processado = resultado.get("total_sistema", 0) + resultado.get("total_manual", 0)
    if total_processado == 0:
        return "Nenhuma diária processada. Verifique as colunas dos arquivos.", "warning"

    mensagem = (
        f"Importação de Diárias concluída: "
        f"{resultado.get('total_sistema', 0)} do sistema e {resultado.get('total_manual', 0)} manuais processadas. "
        f"{resultado.get('criados', 0)} criadas, {resultado.get('atualizados', 0)} atualizadas."
    )
    if resultado.get("erros", 0) > 0:
        mensagem += f" {resultado['erros']} erros ignorados."
        return mensagem, "warning"
    return mensagem, "success"

def _montar_mensagem_premio(resultado):
    if resultado["criados"] == 0:
        return "Nenhum prêmio processado. Verifique as colunas da planilha.", "warning"

    periodos_str = ", ".join(resultado["periodos"])
    mensagem = (
        f"Importação de Prêmios concluída para o(s) período(s) [{periodos_str}]: "
        f"{resultado['total']} linhas processadas, {resultado['criados']} prêmios salvos."
    )
    if resultado["erros"] > 0:
        mensagem += f" {resultado['erros']} erros ignorados."
        return mensagem, "warning"
    return mensagem, "success"

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def import_progress(request, import_id):
    """
    Retorna o status/progresso atual da importação do arquivo.
    """
    status_data = cache.get(f"import_status_{import_id}")
    if not status_data:
        return Response({"status": "not_found"}, status=status.HTTP_404_NOT_FOUND)
    return Response(status_data)

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def import_status_api(request, import_id):
    """
    Retorna o status atual da importação para compatibilidade com rotas.
    """
    status_data = cache.get(f"import_status_{import_id}")
    if not status_data:
        return Response({"status": "not_found"}, status=status.HTTP_404_NOT_FOUND)
    return Response(status_data)
