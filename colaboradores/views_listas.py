from django.core.paginator import Paginator
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
import re
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from usuarios.permissions import IsGestaoOrAdministrador

from lojas.models import Loja, Cargo
from lojas.serializers import LojaSerializer

from .models import Colaborador
from .serializers import ColaboradorSerializer
from .view_utils import funcao_esta_divergente


from rest_framework.pagination import PageNumberPagination

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def colaborador_list(request):
    """
    Retorna a lista paginada e filtrada de colaboradores ativos no formato JSON.
    """
    filtros = _ler_filtros_colaboradores(request.GET)
    colaboradores_qs = _buscar_colaboradores_ativos()
    colaboradores_qs = _aplicar_filtros_colaboradores(colaboradores_qs, filtros)

    paginator = PageNumberPagination()
    paginator.page_size = 10
    page = paginator.paginate_queryset(colaboradores_qs, request)
    if page is not None:
        serializer = ColaboradorSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    serializer = ColaboradorSerializer(colaboradores_qs, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def demitido_list(request):
    """
    Retorna a lista paginada e filtrada de colaboradores demitidos no formato JSON.
    """
    filtros = _ler_filtros_demitidos(request.GET)
    colaboradores_qs = Colaborador.objects.filter(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).select_related("loja")

    colaboradores_qs = _aplicar_filtros_demitidos(colaboradores_qs, filtros)

    paginator = PageNumberPagination()
    paginator.page_size = 10
    page = paginator.paginate_queryset(colaboradores_qs, request)
    if page is not None:
        serializer = ColaboradorSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    serializer = ColaboradorSerializer(colaboradores_qs, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def status_gestao_opcoes(request):
    """
    Esta view existe para retornar ao frontend todas as opções distintas de status de gestão
    salvas no banco de dados, permitindo que a tela renderize um menu select dinamicamente.
    """
    status_unicos = Colaborador.objects.values_list("status_gestao", flat=True)
    opcoes = sorted(
        set(
            status.strip().upper()
            for status in status_unicos
            if status and status.strip()
        )
    )
    return Response(opcoes)


def _termo_para_regex(termo):
    """
    Por que existe: Converte um termo de busca textual em uma expressao regular
    flexivel que aceita variacoes de acentuacao e cedilhas. Isso eh necessario
    porque o SQLite nao suporta buscas insensiveis a acentos e cedilhas de forma nativa,
    e os dados no banco de dados muitas vezes possuem acentos mistos ou estao normalizados.
    """
    if not termo:
        return ""
    
    mapeamento = {
        'a': '[aáàãâäAÁÀÃÂÄ]', 'á': '[aáàãâäAÁÀÃÂÄ]', 'à': '[aáàãâäAÁÀÃÂÄ]', 'ã': '[aáàãâäAÁÀÃÂÄ]', 'â': '[aáàãâäAÁÀÃÂÄ]', 'ä': '[aáàãâäAÁÀÃÂÄ]',
        'e': '[eéèêëEÉÈÊË]', 'é': '[eéèêëEÉÈÊË]', 'è': '[eéèêëEÉÈÊË]', 'ê': '[eéèêëEÉÈÊË]', 'ë': '[eéèêëEÉÈÊË]',
        'i': '[iíìîïIÍÌÎÏ]', 'í': '[iíìîïIÍÌÎÏ]', 'ì': '[iíìîïIÍÌÎÏ]', 'î': '[iíìîïIÍÌÎÏ]', 'ï': '[iíìîïIÍÌÎÏ]',
        'o': '[oóòõôöOÓÒÕÔÖ]', 'ó': '[oóòõôöOÓÒÕÔÖ]', 'ò': '[oóòõôöOÓÒÕÔÖ]', 'õ': '[oóòõôöOÓÒÕÔÖ]', 'ô': '[oóòõôöOÓÒÕÔÖ]', 'ö': '[oóòõôöOÓÒÕÔÖ]',
        'u': '[uúùûüUÚÙÛÜ]', 'ú': '[uúùûüUÚÙÛÜ]', 'ù': '[uúùûüUÚÙÛÜ]', 'û': '[uúùûüUÚÙÛÜ]', 'ü': '[uúùûüUÚÙÛÜ]',
        'c': '[cçCÇ]', 'ç': '[cçCÇ]'
    }
    
    resultado = []
    for char in termo:
        char_lower = char.lower()
        if char_lower in mapeamento:
            resultado.append(mapeamento[char_lower])
        else:
            resultado.append(re.escape(char))
            
    return "".join(resultado)


def _ler_filtros_colaboradores(params):
    """
    Centraliza a leitura dos filtros para a tela e para a sincronização usarem os mesmos nomes.
    """
    return {
        "loja": params.get("loja", ""),
        "re": params.get("re", ""),
        "cpf": params.get("cpf", ""),
        "nome": params.get("nome", ""),
        "cargo": params.get("cargo", ""),
        "status": params.get("status", ""),
        "loja_gestao": params.get("loja_gestao", ""),
        "status_gestao": params.get("status_gestao", ""),
        "divergente": params.get("divergente", ""),
        "funcao_divergente": params.get("funcao_divergente", ""),
        "so_totvs": params.get("so_totvs", ""),
        "status_divergente": params.get("status_divergente", ""),
    }


def _ler_filtros_demitidos(params):
    """
    Lê apenas os filtros usados na tela de demitidos para manter o contexto explícito.
    """
    return {
        "loja": params.get("loja", ""),
        "re": params.get("re", ""),
        "cpf": params.get("cpf", ""),
        "nome": params.get("nome", ""),
        "cargo": params.get("cargo", ""),
        "status_gestao": params.get("status_gestao", ""),
        "status_divergente": params.get("status_divergente", ""),
    }


def _buscar_colaboradores_ativos():
    """
    Mantém a consulta base dos ativos em um único lugar para evitar diferenças entre telas.
    """
    return Colaborador.objects.exclude(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).select_related("loja", "loja_gestao", "loja_geo")


def _aplicar_filtros_colaboradores(colaboradores_qs, filtros):
    """
    Aplica os filtros da listagem de ativos de forma direta e previsível.
    Suporta filtragem por registros sem informação (nulo/vazio) quando o valor "null" é recebido.
    """
    if filtros["loja"]:
        lojas_list = [l.strip() for l in filtros["loja"].split(",") if l.strip()]
        if lojas_list:
            has_null = "null" in lojas_list
            ids = [l for l in lojas_list if l != "null"]
            q_obj = Q()
            if ids:
                q_obj = Q(loja_id__in=ids)
            if has_null:
                q_obj = q_obj | Q(loja_id__isnull=True)
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if filtros["loja_gestao"]:
        colaboradores_qs = colaboradores_qs.filter(
            Q(loja_gestao__nome_gestao__icontains=filtros["loja_gestao"])
            | Q(loja_gestao__nome_referencia__icontains=filtros["loja_gestao"])
        )

    if filtros["re"]:
        re_list = [r.strip() for r in filtros["re"].split(",") if r.strip()]
        if re_list:
            has_null = "null" in re_list
            vals = [r for r in re_list if r != "null"]
            q_obj = Q()
            if vals:
                # Modificado para busca parcial com icontains de forma simples e legível.
                # Como RE agora é um input de texto simples, permitimos ao usuário digitar partes do código.
                q_vals = Q()
                for val in vals:
                    q_vals = q_vals | Q(re__icontains=val)
                q_obj = q_vals
            if has_null:
                q_obj = q_obj | Q(re__isnull=True) | Q(re="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if filtros["cpf"]:
        cpf_list = [cpf.strip() for cpf in filtros["cpf"].split(",") if cpf.strip()]
        if cpf_list:
            has_null = "null" in cpf_list
            vals = [cpf for cpf in cpf_list if cpf != "null"]
            q_obj = Q()
            if vals:
                q_vals = Q()
                for cpf in vals:
                    q_vals = q_vals | Q(cpf__icontains=cpf)
                q_obj = q_vals
            if has_null:
                q_obj = q_obj | Q(cpf__isnull=True) | Q(cpf="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)
    if filtros["nome"]:
        nome_list = [n.strip() for n in filtros["nome"].split(",") if n.strip()]
        if nome_list:
            has_null = "null" in nome_list
            vals = [n for n in nome_list if n != "null"]
            q_obj = Q()
            if vals:
                # Modificado para busca parcial flexível usando regex para ignorar acentos e cedilhas.
                # Como Nome agora é um input de texto simples, permitimos ao usuário digitar partes do nome.
                # Também fazemos busca concorrente no RE para atender pesquisas unificadas.
                q_vals = Q()
                for val in vals:
                    val_regex = _termo_para_regex(val)
                    q_vals = (
                        q_vals
                        | Q(nome__iregex=val_regex)
                        | Q(re__icontains=val)
                    )
                q_obj = q_vals
            if has_null:
                q_obj = q_obj | Q(nome__isnull=True) | Q(nome="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if filtros["cargo"]:
        colaboradores_qs = colaboradores_qs.filter(cargo__iexact=filtros["cargo"])

    if filtros["status"]:
        status_list = [s.strip() for s in filtros["status"].split(",") if s.strip()]
        if status_list:
            has_null = "null" in status_list
            vals = [s for s in status_list if s != "null"]
            q_obj = Q()
            if "ativo" in vals:
                other_statuses = [s for s in vals if s != "ativo"]
                q_obj = Q(status__in=other_statuses) | ~Q(status__in=["A", "F"])
            elif vals:
                q_obj = Q(status__in=vals)
            if has_null:
                q_obj = q_obj | Q(status__isnull=True) | Q(status="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if filtros["status_gestao"]:
        status_list = [s.strip() for s in filtros["status_gestao"].split(",") if s.strip()]
        if status_list:
            has_null = "null" in status_list
            vals = [s for s in status_list if s != "null"]
            q_obj = Q()
            if vals:
                q_obj = Q(status_gestao__in=vals)
            if has_null:
                q_obj = q_obj | Q(status_gestao__isnull=True) | Q(status_gestao="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if filtros["funcao_divergente"] == "S":
        ids_funcao_divergente = [
            colaborador.id
            for colaborador in colaboradores_qs
            if funcao_esta_divergente(colaborador)
        ]
        colaboradores_qs = colaboradores_qs.filter(id__in=ids_fungent_divergente if 'ids_fungent_divergente' in locals() else ids_funcao_divergente)

    if filtros["divergente"] == "S":
        colaboradores_qs = colaboradores_qs.exclude(status="A").exclude(
            loja__dispensa_gestao_pessoas=True,
        ).filter(
            loja__isnull=False,
        ).filter(
            Q(loja_gestao__isnull=False) | Q(loja_geo__isnull=False)
        )
        ids_divergentes = [
            colaborador.id for colaborador in colaboradores_qs if colaborador.is_divergente
        ]
        colaboradores_qs = colaboradores_qs.filter(id__in=ids_divergentes)

    if filtros["so_totvs"] == "S":
        colaboradores_qs = colaboradores_qs.exclude(
            loja__dispensa_gestao_pessoas=True,
        ).filter(
            loja__isnull=False,
            loja_gestao__isnull=True,
        )

    if filtros["status_divergente"] == "S":
        colaboradores_qs = colaboradores_qs.filter(_filtro_status_divergente_ativo())

    return colaboradores_qs


def _aplicar_filtros_demitidos(colaboradores_qs, filtros):
    """
    Aplica os filtros da listagem de demitidos mantendo a regra separada dos ativos.
    Suporta filtragem por registros sem informação (nulo/vazio) quando o valor "null" é recebido.
    """
    if filtros["loja"]:
        lojas_list = [l.strip() for l in filtros["loja"].split(",") if l.strip()]
        if lojas_list:
            has_null = "null" in lojas_list
            ids = [l for l in lojas_list if l != "null"]
            q_obj = Q()
            if ids:
                q_obj = Q(loja_id__in=ids)
            if has_null:
                q_obj = q_obj | Q(loja_id__isnull=True)
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if filtros["re"]:
        re_list = [r.strip() for r in filtros["re"].split(",") if r.strip()]
        if re_list:
            has_null = "null" in re_list
            vals = [r for r in re_list if r != "null"]
            q_obj = Q()
            if vals:
                # Modificado para busca parcial com icontains de forma simples e legível.
                # Como RE agora é um input de texto simples, permitimos ao usuário digitar partes do código.
                q_vals = Q()
                for val in vals:
                    q_vals = q_vals | Q(re__icontains=val)
                q_obj = q_vals
            if has_null:
                q_obj = q_obj | Q(re__isnull=True) | Q(re="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if filtros["cpf"]:
        cpf_list = [cpf.strip() for cpf in filtros["cpf"].split(",") if cpf.strip()]
        if cpf_list:
            has_null = "null" in cpf_list
            vals = [cpf for cpf in cpf_list if cpf != "null"]
            q_obj = Q()
            if vals:
                q_vals = Q()
                for cpf in vals:
                    q_vals = q_vals | Q(cpf__icontains=cpf)
                q_obj = q_vals
            if has_null:
                q_obj = q_obj | Q(cpf__isnull=True) | Q(cpf="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)
    if filtros["nome"]:
        nome_list = [n.strip() for n in filtros["nome"].split(",") if n.strip()]
        if nome_list:
            has_null = "null" in nome_list
            vals = [n for n in nome_list if n != "null"]
            q_obj = Q()
            if vals:
                # Modificado para busca parcial flexível usando regex para ignorar acentos e cedilhas.
                # Como Nome agora é um input de texto simples, permitimos ao usuário digitar partes do nome.
                # Também fazemos busca concorrente no RE para atender pesquisas unificadas.
                q_vals = Q()
                for val in vals:
                    val_regex = _termo_para_regex(val)
                    q_vals = (
                        q_vals
                        | Q(nome__iregex=val_regex)
                        | Q(re__icontains=val)
                    )
                q_obj = q_vals
            if has_null:
                q_obj = q_obj | Q(nome__isnull=True) | Q(nome="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if filtros["cargo"]:
        colaboradores_qs = colaboradores_qs.filter(cargo__iexact=filtros["cargo"])

    if filtros["status_gestao"]:
        status_list = [s.strip() for s in filtros["status_gestao"].split(",") if s.strip()]
        if status_list:
            has_null = "null" in status_list
            vals = [s for s in status_list if s != "null"]
            q_obj = Q()
            if vals:
                q_obj = Q(status_gestao__in=vals)
            if has_null:
                q_obj = q_obj | Q(status_gestao__isnull=True) | Q(status_gestao="")
            colaboradores_qs = colaboradores_qs.filter(q_obj)

    if filtros["status_divergente"] == "S":
        colaboradores_qs = colaboradores_qs.filter(_filtro_status_divergente_demitido())

    return colaboradores_qs


def _buscar_lojas_ativas():
    """
    Busca lojas ativas respeitando o método customizado de ordenação quando ele existir.
    """
    lojas_qs = Loja.objects.filter(status="ATIVA")
    if hasattr(Loja.objects, "order_title"):
        return lojas_qs.order_title()
    return lojas_qs.order_by("nome_referencia")


def _buscar_cargos_ativos():
    """
    Monta opções de cargo a partir dos colaboradores ativos para preencher o filtro da tela.
    """
    cargos_unicos = Colaborador.objects.exclude(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).values_list("cargo", flat=True).distinct().order_by("cargo")
    return sorted(set(cargo.strip() for cargo in cargos_unicos if cargo.strip()))


def _buscar_cargos_demitidos():
    """
    Monta opções de cargo a partir dos demitidos para preencher o filtro correto da tela.
    """
    cargos_unicos = Colaborador.objects.filter(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).values_list("cargo", flat=True).distinct().order_by("cargo")
    return sorted(set(cargo.strip() for cargo in cargos_unicos if cargo.strip()))


def _buscar_status_gestao_ativos():
    """
    Monta opções de status da Gestão usando apenas registros ativos exibidos na tela principal.
    """
    status_gestao_unicos = Colaborador.objects.exclude(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).values_list("status_gestao", flat=True)
    return sorted(
        set(
            status.strip().upper()
            for status in status_gestao_unicos
            if status and status.strip()
        )
    )


def _contar_status_divergentes_ativos():
    """
    Calcula o total do atalho de status divergente para mostrar o indicador na tela de ativos.
    """
    return Colaborador.objects.exclude(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).filter(_filtro_status_divergente_ativo()).count()


def _contar_status_divergentes_demitidos():
    """
    Calcula o total do atalho de status divergente para mostrar o indicador na tela de demitidos.
    """
    return Colaborador.objects.filter(status="D").exclude(
        cargo="AUXILIAR ADMINISTRAT"
    ).filter(_filtro_status_divergente_demitido()).count()


def _filtro_status_divergente_ativo():
    """
    Reúne as condições de status divergente dos ativos para evitar copiar a mesma regra.
    """
    return (
        Q(status__in=["", "A", "F"])
        & (
            Q(status_gestao__icontains="DESLIG")
            | Q(status_gestao__icontains="DEMIT")
            | Q(status_gestao__icontains="ENCERRADO")
        )
    )


def _filtro_status_divergente_demitido():
    """
    Reúne as condições de status divergente dos demitidos para evitar copiar a mesma regra.
    """
    return (
        Q(status_gestao__isnull=True)
        | Q(status_gestao="")
        | (~Q(status_gestao__icontains="DEMIT"))
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def colaborador_filtro_opcoes(request):
    """
    Retorna as opções de busca para os seletores (RE, Nome, Loja, Coordenador, Status) de forma reativa.
    Para reproduzir o comportamento do Excel, as opções de cada filtro são calculadas
    aplicando-se todos os outros filtros ativos, EXCETO o filtro do próprio campo. Isso evita
    que a seleção de uma opção oculte todas as outras opções do mesmo seletor.
    """
    is_demitido = request.GET.get("is_demitido") == "true"
    is_termino = request.GET.get("is_termino") == "true"
    
    res_list = []
    nomes_list = []
    lojas_list = []
    status_list = []
    status_gestao_list = []
    coordenadores_list = []

    if is_termino:
        from .views_terminos import (
            _buscar_colaboradores_com_termino,
            _filtrar_terminos_queryset,
            _processar_colaboradores_termino
        )
        from datetime import date
        today = date.today()

        coordenador_val = request.GET.get("coordenador", "")
        status_gestao_val = request.GET.get("status_gestao", "")
        data_filtro = request.GET.get("data_filtro", "")
        data_fim = request.GET.get("data_fim", "")
        re_val = request.GET.get("re", "")
        nome_val = request.GET.get("nome", "")

        # Modificado: Para economizar recursos de rede e CPU, RE e Nome agora são inputs
        # normais de texto e não necessitam que pré-carreguemos 14.000 opções do banco.
        res_list = []
        nomes_list = []

        # 3. Opções de Coordenador (ignora a seleção de Coordenador)
        qs_coord = _buscar_colaboradores_com_termino()
        qs_coord = _filtrar_terminos_queryset(
            qs_coord,
            search_query="",
            coordenador_query="",
            status_gestao_query=status_gestao_val,
            re_query=re_val,
            nome_query=nome_val,
        )
        proc_coord = _processar_colaboradores_termino(qs_coord, today, data_filtro, data_fim, calcular_ausencias=False)
        coords_set = set()
        has_null_coord = False
        for item in proc_coord:
            colab = item["colaborador"]
            if colab.loja and colab.loja.coordenador and colab.loja.coordenador.nome:
                coords_set.add(colab.loja.coordenador.nome.strip().upper())
            else:
                has_null_coord = True
        coordenadores_list = sorted(list(coords_set))
        if has_null_coord:
            coordenadores_list.append("null")

        # 4. Opções de Status de Gestão (ignora a seleção de Status Gestão)
        qs_sg = _buscar_colaboradores_com_termino()
        qs_sg = _filtrar_terminos_queryset(
            qs_sg,
            search_query="",
            coordenador_query=coordenador_val,
            status_gestao_query="",
            re_query=re_val,
            nome_query=nome_val,
        )
        proc_sg = _processar_colaboradores_termino(qs_sg, today, data_filtro, data_fim, calcular_ausencias=False)
        sg_set = set()
        has_null_sg = False
        for item in proc_sg:
            colab = item["colaborador"]
            if colab.status_gestao:
                sg_set.add(colab.status_gestao.strip().upper())
            else:
                has_null_sg = True
        status_gestao_list = sorted(list(sg_set))
        if has_null_sg:
            status_gestao_list.append("null")

    elif is_demitido:
        filtros_base = _ler_filtros_demitidos(request.GET)

        # Modificado: Para economizar recursos de rede e CPU, RE e Nome agora são inputs
        # normais de texto e não necessitam que pré-carreguemos 14.000 opções do banco.
        res_list = []
        nomes_list = []

        # 3. Opções de Loja
        filtros_loja = filtros_base.copy()
        filtros_loja["loja"] = ""
        qs_loja = Colaborador.objects.filter(status="D").exclude(cargo="AUXILIAR ADMINISTRAT").select_related("loja")
        qs_loja = _aplicar_filtros_demitidos(qs_loja, filtros_loja)
        # Por que existe: Obtém o nome_totvs (com fallback para nome_referencia) para exibição correta no filtro de loja totvs.
        lojas_set = set(qs_loja.filter(loja__isnull=False).values_list("loja_id", "loja__nome_totvs", "loja__nome_referencia"))
        lojas_list = sorted(
            [{"id": str(lid), "nome_totvs": ltotvs if ltotvs else lref} for lid, ltotvs, lref in lojas_set],
            key=lambda x: x["nome_totvs"]
        )
        has_null_loja = qs_loja.filter(loja__isnull=True).exists()
        if has_null_loja:
            lojas_list.append({"id": "null", "nome_totvs": "(Vazio)"})

        # 4. Opções de Status Gestão
        filtros_sg = filtros_base.copy()
        filtros_sg["status_gestao"] = ""
        qs_sg = Colaborador.objects.filter(status="D").exclude(cargo="AUXILIAR ADMINISTRAT").select_related("loja")
        qs_sg = _aplicar_filtros_demitidos(qs_sg, filtros_sg)
        sg_set = set(qs_sg.values_list("status_gestao", flat=True).distinct())
        status_gestao_list = sorted(list(s.strip().upper() for s in sg_set if s and s.strip()))
        has_null_sg = qs_sg.filter(Q(status_gestao__isnull=True) | Q(status_gestao="")).exists()
        if has_null_sg:
            status_gestao_list.append("null")

    else:  # ativos
        filtros_base = _ler_filtros_colaboradores(request.GET)

        # Modificado: Para economizar recursos de rede e CPU, RE e Nome agora são inputs
        # normais de texto e não necessitam que pré-carreguemos 14.000 opções do banco.
        res_list = []
        nomes_list = []

        # 3. Opções de Loja
        filtros_loja = filtros_base.copy()
        filtros_loja["loja"] = ""
        qs_loja = _buscar_colaboradores_ativos()
        qs_loja = _aplicar_filtros_colaboradores(qs_loja, filtros_loja)
        # Por que existe: Obtém o nome_totvs (com fallback para nome_referencia) para exibição correta no filtro de loja totvs.
        lojas_set = set(qs_loja.filter(loja__isnull=False).values_list("loja_id", "loja__nome_totvs", "loja__nome_referencia"))
        lojas_list = sorted(
            [{"id": str(lid), "nome_totvs": ltotvs if ltotvs else lref} for lid, ltotvs, lref in lojas_set],
            key=lambda x: x["nome_totvs"]
        )
        has_null_loja = qs_loja.filter(loja__isnull=True).exists()
        if has_null_loja:
            lojas_list.append({"id": "null", "nome_totvs": "(Vazio)"})

        # 4. Opções de Status
        filtros_st = filtros_base.copy()
        filtros_st["status"] = ""
        qs_st = _buscar_colaboradores_ativos()
        qs_st = _aplicar_filtros_colaboradores(qs_st, filtros_st)
        status_set = set(qs_st.values_list("status", flat=True).distinct())
        status_list = sorted(list(s.strip().upper() for s in status_set if s and s.strip()))
        has_null_status = qs_st.filter(Q(status__isnull=True) | Q(status="")).exists()
        if has_null_status:
            status_list.append("null")

        # 5. Opções de Status Gestão
        filtros_sg = filtros_base.copy()
        filtros_sg["status_gestao"] = ""
        qs_sg = _buscar_colaboradores_ativos()
        qs_sg = _aplicar_filtros_colaboradores(qs_sg, filtros_sg)
        sg_set = set(qs_sg.values_list("status_gestao", flat=True).distinct())
        status_gestao_list = sorted(list(s.strip().upper() for s in sg_set if s and s.strip()))
        has_null_sg = qs_sg.filter(Q(status_gestao__isnull=True) | Q(status_gestao="")).exists()
        if has_null_sg:
            status_gestao_list.append("null")

    return Response({
        "res": [{"value": r, "label": r} for r in res_list],
        "nomes": [{"value": n, "label": n} for n in nomes_list],
        "lojas": lojas_list,
        "status": status_list,
        "status_gestao": status_gestao_list,
        "coordenadores": coordenadores_list
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def colaborador_atribuir_cargo_api(request):
    """
    Por que existe: Permite atribuir um cargo cadastrado a um ou múltiplos colaboradores
    selecionados no frontend, atualizando o campo 'cargo' no banco de dados.
    """
    cargo_nome = (request.data.get("cargo") or "").strip()
    colaborador_ids = request.data.get("colaborador_ids") or []

    if not cargo_nome:
        return Response(
            {"error": "O nome do cargo é obrigatório."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not colaborador_ids:
        single_id = request.data.get("colaborador_id")
        if single_id:
            colaborador_ids = [single_id]
        else:
            return Response(
                {"error": "Selecione pelo menos um colaborador para atribuir o cargo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Converte IDs para inteiros caso estejam em string
    ids_validos = []
    for cid in colaborador_ids:
        try:
            ids_validos.append(int(cid))
        except (ValueError, TypeError):
            continue

    if not ids_validos:
        return Response(
            {"error": "Nenhum colaborador válido foi selecionado."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Garante que o cargo existe na tabela Cargo
    cargo_obj, _ = Cargo.objects.get_or_create(nome=cargo_nome.upper())

    total_atualizados = Colaborador.objects.filter(id__in=ids_validos).update(
        cargo=cargo_obj.nome
    )

    return Response({
        "success": True,
        "atualizados": total_atualizados,
        "cargo": cargo_obj.nome,
        "message": f"Cargo '{cargo_obj.nome}' atribuído com sucesso a {total_atualizados} colaborador(es)."
    })


@api_view(["GET", "PATCH", "PUT"])
@permission_classes([IsAuthenticated, IsGestaoOrAdministrador])
def colaborador_detail_update_api(request, pk):
    """
    Por que existe: Permite consultar e atualizar individualmente as informações de um colaborador,
    como cargo, função na gestão, status ou datas contratuais.
    """
    colaborador = get_object_or_404(
        Colaborador.objects.select_related("loja", "loja_gestao", "loja_geo"),
        pk=pk,
    )

    if request.method == "GET":
        serializer = ColaboradorSerializer(colaborador)
        return Response(serializer.data)

    elif request.method in ["PATCH", "PUT"]:
        data = request.data
        if "cargo" in data:
            novo_cargo = (data["cargo"] or "").strip().upper()
            if novo_cargo:
                Cargo.objects.get_or_create(nome=novo_cargo)
                colaborador.cargo = novo_cargo

        if "funcao_gestao" in data:
            colaborador.funcao_gestao = data["funcao_gestao"]

        if "status_gestao" in data:
            colaborador.status_gestao = data["status_gestao"]

        if "data_admissao" in data and data["data_admissao"]:
            colaborador.data_admissao = data["data_admissao"]

        if "termino_1" in data:
            colaborador.termino_1 = data["termino_1"] or None

        if "termino_2" in data:
            colaborador.termino_2 = data["termino_2"] or None

        colaborador.save()
        serializer = ColaboradorSerializer(colaborador)
        return Response(serializer.data)
