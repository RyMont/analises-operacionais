from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from usuarios.permissions import IsAdministrador

from lojas.models import MESES_CHOICES, Loja
from lojas.serializers import LojaSerializer
from lojas.services.comparativo_loja import (
    competencias_distintas_para_loja,
    montar_resultado_comparativo,
    parse_competencias_get,
)

def _nome_mes(mes: int) -> str:
    """
    Transforma o número do mês no nome por extenso.
    Exemplo: 1 vira 'Janeiro'.
    """
    for chave, rotulo in MESES_CHOICES:
        if chave == mes:
            return str(rotulo)
    return str(mes)

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def comparativo_loja(request):
    """
    Retorna o comparativo entre os custos orçados (escopo) e reais (folha) da loja selecionada
    para um ou mais meses (competências) em formato JSON.
    Substitui a renderização do template comparativo_loja.html.
    """
    lojas = Loja.objects.all().order_by("nome_referencia")
    lojas_serializer = LojaSerializer(lojas, many=True)

    loja_raw = request.GET.get("loja", "").strip()
    loja_id_int = None
    if loja_raw:
        try:
            loja_id_int = int(loja_raw)
        except ValueError:
            loja_id_int = None

    competencias_opcoes = []
    if loja_id_int and Loja.objects.filter(pk=loja_id_int).exists():
        selecionados = set(parse_competencias_get(request.GET.getlist("c")))
        for ano, mes in competencias_distintas_para_loja(loja_id_int):
            valor_campo = f"{ano}-{mes}"
            competencias_opcoes.append({
                "ano": ano,
                "mes": mes,
                "value": valor_campo,
                "label": f"{_nome_mes(mes)} / {ano}",
                "checked": (ano, mes) in selecionados,
            })

    competencias_sel = parse_competencias_get(request.GET.getlist("c"))
    marcou_alguma_competencia = bool(request.GET.getlist("c"))
    resultado = None
    resultado_serializado = None

    if loja_id_int and competencias_sel:
        resultado = montar_resultado_comparativo(loja_id_int, competencias_sel)
        if resultado:
            resultado_serializado = {
                "loja": LojaSerializer(resultado.loja).data,
                "competencias": resultado.competencias,
                "escopo_base_total": str(resultado.escopo_base_total),
                "escopo_insalubridade_fixa_total": str(resultado.escopo_insalubridade_fixa_total),
                "escopo_insalubridade_banheirista_total": str(resultado.escopo_insalubridade_banheirista_total),
                "escopo_insalubridade_total": str(resultado.escopo_insalubridade_total),
                "escopo_adicional_noturno_total": str(resultado.escopo_adicional_noturno_total),
                "escopo_total": str(resultado.escopo_total),
                "escopo_itens_sem_estimativa": resultado.escopo_itens_sem_estimativa,
                "escopo_meses_sem_registro": resultado.escopo_meses_sem_registro,
                "folha_total": str(resultado.folha_total),
                "folha_linhas_count": resultado.folha_linhas_count,
                "folha_salario_categoria_total": str(resultado.folha_salario_categoria_total),
                "folha_insalubridade_categoria_total": str(resultado.folha_insalubridade_categoria_total),
                "folha_adicional_noturno_categoria_total": str(resultado.folha_adicional_noturno_categoria_total),
                "folha_verbas_extraordinarias_categoria_total": str(resultado.folha_verbas_extraordinarias_categoria_total),
                "diferenca_folha_menos_escopo": str(resultado.diferenca_folha_menos_escopo),
                "desvio_salario": str(resultado.desvio_salario),
                "desvio_insalubridade": str(resultado.desvio_insalubridade),
                "desvio_adicional_noturno": str(resultado.desvio_adicional_noturno),
                "desvio_verbas_extraordinarias": str(resultado.desvio_verbas_extraordinarias),
                "tabela_escopo_total": str(resultado.tabela_escopo_total),
                "tabela_folha_total": str(resultado.tabela_folha_total),
                "tabela_desvio_total": str(resultado.tabela_desvio_total),
                "colaboradores_salario": resultado.colaboradores_salario,
                "colaboradores_insalubridade": resultado.colaboradores_insalubridade,
                "colaboradores_adicional_noturno": resultado.colaboradores_adicional_noturno,
                "colaboradores_verbas_extraordinarias": resultado.colaboradores_verbas_extraordinarias,
            }

    return Response({
        "resultado": resultado_serializado,
        "competencias_opcoes": competencias_opcoes
    })
