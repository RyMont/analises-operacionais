"""
Serviço responsável pelo snapshot mensal de headcount (força de trabalho) por filial física
alimentado pelo upload do arquivo SRA (TOTVS) e fechamento ao final do mês.
"""

import calendar
import datetime
import logging
from typing import Any, Dict, List, Optional

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from colaboradores.models import Colaborador
from lojas.models import HeadcountMensalLoja, Loja

logger = logging.getLogger(__name__)


def calcular_forca_trabalho_lojas(
    ano: int,
    mes: int,
    lojas_ids: Optional[List[int]] = None
) -> Dict[int, int]:
    """
    Calcula a força de trabalho (colaboradores ativos) por loja para o mês/ano de referência.
    
    Regra aprovada (Opção 1):
    - Pertencem à loja (loja_id)
    - Exclui cargo desconsiderado ('AUXILIAR ADMINISTRAT')
    - Admitidos até o fim do mês (data_admissao <= fim_mes)
    - Estiveram ativos no mês:
      - Demitidos durante o mês ou após (data_demissao >= inicio_mes) OU
      - Sem data de demissão e com status diferente de 'D'.
    
    Retorna: Dicionário {loja_id: total_ativos}
    """
    inicio_mes = datetime.date(ano, mes, 1)
    _, ultimo_dia = calendar.monthrange(ano, mes)
    fim_mes = datetime.date(ano, mes, ultimo_dia)

    qs = (
        Colaborador.objects.filter(loja_id__isnull=False)
        .exclude(cargo="AUXILIAR ADMINISTRAT")
        .filter(data_admissao__lte=fim_mes)
        .filter(
            Q(data_demissao__gte=inicio_mes)
            | (Q(data_demissao__isnull=True) & ~Q(status="D"))
        )
    )

    if lojas_ids is not None:
        qs = qs.filter(loja_id__in=lojas_ids)

    contagens = qs.values("loja_id").annotate(total=Count("id"))
    return {c["loja_id"]: c["total"] for c in contagens}


def fechar_meses_anteriores(ano_referencia: int, mes_referencia: int) -> int:
    """
    Congela (fechado=True) todos os snapshots de meses anteriores ao mês de referência.
    Garante que registros passados não sejam mais alterados por uploads atuais.
    """
    filtro_anteriores = Q(ano__lt=ano_referencia) | (
        Q(ano=ano_referencia, mes__lt=mes_referencia)
    )
    total_fechados = HeadcountMensalLoja.objects.filter(
        filtro_anteriores,
        fechado=False
    ).update(
        fechado=True,
        data_fechamento=timezone.now()
    )

    if total_fechados > 0:
        logger.info(
            "Fechamento automático: %d registros de headcount de meses anteriores congelados.",
            total_fechados
        )
    return total_fechados


def registrar_snapshot_headcount_sra(
    ano: Optional[int] = None,
    mes: Optional[int] = None
) -> Dict[str, Any]:
    """
    Executado a cada importação do arquivo SRA para atualizar o snapshot do mês da subida.
    
    1. Fecha automaticamente os meses anteriores.
    2. Calcula os colaboradores ativos de cada loja física.
    3. Cria ou atualiza o HeadcountMensalLoja para o mês corrente se ainda aberto (fechado=False).
    """
    hoje = timezone.now().date()
    if ano is None:
        ano = hoje.year
    if mes is None:
        mes = hoje.month

    # 1. Congela meses passados
    fechados_anteriores = fechar_meses_anteriores(ano, mes)

    # 2. Calcula a força de trabalho atual por loja
    mapa_ativos = calcular_forca_trabalho_lojas(ano, mes)

    # Lojas ativas cadastradas no sistema
    lojas = list(Loja.objects.all().values_list("id", flat=True))

    criados = 0
    atualizados = 0
    ignorados_fechados = 0
    total_ativos_geral = 0

    with transaction.atomic():
        # Busca snapshots já existentes deste mês
        existentes = {
            h.loja_id: h
            for h in HeadcountMensalLoja.objects.filter(ano=ano, mes=mes)
        }

        para_criar = []
        para_atualizar = []

        for loja_id in lojas:
            qtd_ativos = mapa_ativos.get(loja_id, 0)
            total_ativos_geral += qtd_ativos

            registro = existentes.get(loja_id)
            if registro is not None:
                if registro.fechado:
                    ignorados_fechados += 1
                    continue
                if registro.total_ativos != qtd_ativos:
                    registro.total_ativos = qtd_ativos
                    para_atualizar.append(registro)
                    atualizados += 1
            else:
                para_criar.append(
                    HeadcountMensalLoja(
                        loja_id=loja_id,
                        ano=ano,
                        mes=mes,
                        total_ativos=qtd_ativos,
                        fechado=False,
                    )
                )
                criados += 1

        if para_criar:
            HeadcountMensalLoja.objects.bulk_create(para_criar, batch_size=500)
        if para_atualizar:
            HeadcountMensalLoja.objects.bulk_update(
                para_atualizar, ["total_ativos", "updated_at"], batch_size=500
            )

    logger.info(
        "Snapshot SRA concluído para %02d/%d: %d criados, %d atualizados, %d ativos totais.",
        mes, ano, criados, atualizados, total_ativos_geral
    )

    return {
        "ano": ano,
        "mes": mes,
        "criados": criados,
        "atualizados": atualizados,
        "ignorados_fechados": ignorados_fechados,
        "fechados_anteriores": fechados_anteriores,
        "total_ativos": total_ativos_geral,
    }
