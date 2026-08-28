# Agrega estimativa de escopo (vários meses) e total da folha por loja e competências (DT ARQ).
# Usado na tela de comparativo estilo BI.

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List, Optional, Set, Tuple

from django.db.models import Q, Sum
from django.db.models.functions import ExtractMonth, ExtractYear

from lojas.models import (
    EscopoMensal,
    ItemEscopoMensal,
    LinhaFolha,
    Loja,
    ResumoFolhaMensal,
    escala_insalubridade_fixa_para_escopo,
    montar_caches_salario_para_itens,
)

# ---------------------------------------------------------------------------
# Categorias da planilha de verbas (coluna "Categoria Inovação" / campo categoria).
# Ajuste as tuplas se no Excel os textos forem diferentes (ex.: sem acento).
# Por que tuplas: permite mais de um rótulo aceito para a mesma rubrica.
# ---------------------------------------------------------------------------
CAT_FOLHA_SALARIO = ("SALÁRIO",)
CAT_FOLHA_INSALUBRIDADE = ("INSALUBRIDADE",)
CAT_FOLHA_ADICIONAL_NOTURNO = ("ADICIONAL NOTURNO",)


def _q_categoria_um_dos(rotulos):
    """Monta um Q com OR de categoria__iexact para cada rótulo não vazio."""
    q = Q()
    for r in rotulos:
        t = (r or "").strip()
        if t:
            q |= Q(categoria__iexact=t)
    return q


def _somar_valor_folha_com_filtro(qs, filtro_extra):
    """Soma o campo valor no queryset já restrito a loja + competências."""
    agg = qs.filter(filtro_extra).aggregate(s=Sum("valor"))
    return agg["s"] or Decimal("0.00")


def competencias_distintas_para_loja(loja_id: int) -> List[Tuple[int, int]]:
    """
    Lista (ano, mês) únicos onde a loja tem escopo OU folha importada (por DT ARQ).
    Ordenação: ano/mês decrescente (mais recente primeiro).
    """
    pares: Set[Tuple[int, int]] = set()

    for ano, mes in EscopoMensal.objects.filter(loja_id=loja_id).values_list(
        "ano", "mes"
    ):
        pares.add((int(ano), int(mes)))

    # Otimizado: Busca no ResumoFolhaMensal em vez de varrer a gigantesca LinhaFolha.
    for dt_arq in ResumoFolhaMensal.objects.filter(loja_id=loja_id).values_list("dt_arq", flat=True):
        if dt_arq:
            pares.add((dt_arq.year, dt_arq.month))

    return sorted(pares, reverse=True)



def _parse_competencia_param(texto: str) -> Optional[Tuple[int, int]]:
    """Aceita '2026-3' ou '2026-03' -> (2026, 3)."""
    if not texto or not isinstance(texto, str):
        return None
    partes = texto.strip().split("-", 1)
    if len(partes) != 2:
        return None
    try:
        ano = int(partes[0])
        mes = int(partes[1])
    except ValueError:
        return None
    if ano < 2000 or ano > 2100 or mes < 1 or mes > 12:
        return None
    return ano, mes


def parse_competencias_get(getlist) -> List[Tuple[int, int]]:
    """Lê request.GET.getlist('c') e devolve lista única de (ano, mês) ordenada."""
    visto: Set[Tuple[int, int]] = set()
    for raw in getlist:
        for item in raw.split(","):
            par = _parse_competencia_param(item)
            if par:
                visto.add(par)
    return sorted(visto)


@dataclass
class ResultadoComparativoLoja:
    """Totais agregados no período selecionado para uma loja."""

    loja: Loja
    competencias: List[Tuple[int, int]]
    # Escopo (soma de todos os itens de todos os escopos dos meses)
    escopo_base_total: Decimal = Decimal("0.00")
    escopo_insalubridade_fixa_total: Decimal = Decimal("0.00")
    escopo_insalubridade_banheirista_total: Decimal = Decimal("0.00")
    escopo_adicional_noturno_total: Decimal = Decimal("0.00")
    escopo_total: Decimal = Decimal("0.00")
    escopo_itens_sem_estimativa: int = 0
    escopo_meses_sem_registro: List[Tuple[int, int]] = field(default_factory=list)
    # Folha (soma dos valores das linhas com DT ARQ nos meses)
    folha_total: Decimal = Decimal("0.00")
    folha_linhas_count: int = 0

    # Folha por categoria (apenas para a tabela de comparativo; o total geral é folha_total)
    folha_salario_categoria_total: Decimal = Decimal("0.00")
    folha_insalubridade_categoria_total: Decimal = Decimal("0.00")
    folha_adicional_noturno_categoria_total: Decimal = Decimal("0.00")
    folha_verbas_extraordinarias_categoria_total: Decimal = Decimal("0.00")
    escopo_verbas_extraordinarias_total: Decimal = Decimal("0.00")

    # Detalhe por colaborador para a tabela expansível (drill-down no frontend)
    colaboradores_salario: List[Dict] = field(default_factory=list)
    colaboradores_insalubridade: List[Dict] = field(default_factory=list)
    colaboradores_adicional_noturno: List[Dict] = field(default_factory=list)
    colaboradores_verbas_extraordinarias: List[Dict] = field(default_factory=list)

    @property
    def escopo_insalubridade_total(self) -> Decimal:
        """Soma das duas insalubridades do escopo (fixa + banheirista), para exibir na tabela."""
        return (
            self.escopo_insalubridade_fixa_total
            + self.escopo_insalubridade_banheirista_total
        )

    @property
    def diferenca_folha_menos_escopo(self) -> Decimal:
        """
        Calcula a diferença geral entre o total importado na folha e o estimado no escopo.
        Positivo indica gasto acima do orçado. Negativo indica economia.
        """
        return self.folha_total - self.escopo_total

    @property
    def desvio_salario(self) -> Decimal:
        """Diferença específica apenas para a rubrica de Salário Base."""
        return self.folha_salario_categoria_total - self.escopo_base_total

    @property
    def desvio_insalubridade(self) -> Decimal:
        """Diferença específica para a rubrica de Insalubridade (Total)."""
        return (
            self.folha_insalubridade_categoria_total - self.escopo_insalubridade_total
        )

    @property
    def desvio_adicional_noturno(self) -> Decimal:
        """Diferença específica para a rubrica de Adicional Noturno."""
        return (
            self.folha_adicional_noturno_categoria_total
            - self.escopo_adicional_noturno_total
        )

    @property
    def desvio_verbas_extraordinarias(self) -> Decimal:
        """Diferença específica para a rubrica de Verbas Extraordinárias."""
        return (
            self.folha_verbas_extraordinarias_categoria_total
            - self.escopo_verbas_extraordinarias_total
        )

    @property
    def tabela_escopo_total(self) -> Decimal:
        """Soma total apenas das colunas estimadas que aparecem na tabela de detalhamento."""
        return (
            self.escopo_base_total
            + self.escopo_insalubridade_total
            + self.escopo_adicional_noturno_total
            + self.escopo_verbas_extraordinarias_total
        )

    @property
    def tabela_folha_total(self) -> Decimal:
        """Soma total apenas das colunas de folha que aparecem na tabela de detalhamento."""
        return (
            self.folha_salario_categoria_total
            + self.folha_insalubridade_categoria_total
            + self.folha_adicional_noturno_categoria_total
            + self.folha_verbas_extraordinarias_categoria_total
        )

    @property
    def tabela_desvio_total(self) -> Decimal:
        """Desvio total da tabela de detalhamento."""
        return self.tabela_folha_total - self.tabela_escopo_total


def montar_resultado_comparativo(
    loja_id: int,
    competencias: List[Tuple[int, int]],
) -> Optional[ResultadoComparativoLoja]:
    """
    Agrega escopo + folha para a loja e lista de (ano, mês) de competência (DT ARQ na folha).
    Retorna None se a loja não existir.
    """
    import datetime
    from lojas.models import ConfiguracaoInsalubridadeLoja, obter_ou_criar_config_insalubridade_loja

    loja = Loja.objects.filter(pk=loja_id).first()
    if loja is None:
        return None

    resultado = ResultadoComparativoLoja(loja=loja, competencias=list(competencias))

    if not competencias:
        return resultado

    # Otimização de data: Converte competências (ano, mês) para datas exatas (sempre dia 1º).
    # Isso permite que o SQLite utilize o índice no campo dt_arq e evite full table scans.
    datas_exatas = [datetime.date(ano, mes, 1) for ano, mes in competencias]

    # Otimização: Obtém os valores consolidados diretamente de ResumoFolhaMensal
    # evitando agregação na gigantesca tabela LinhaFolha.
    resumos = ResumoFolhaMensal.objects.filter(loja_id=loja_id, dt_arq__in=datas_exatas)

    folha_total = Decimal("0.00")
    folha_linhas_count = 0
    folha_salario = Decimal("0.00")
    folha_insalubridade = Decimal("0.00")
    folha_adicional_noturno = Decimal("0.00")
    folha_verbas_extraordinarias = Decimal("0.00")

    for r in resumos:
        folha_total += r.valor_total
        folha_linhas_count += r.linhas_count
        folha_salario += r.valor_salario
        folha_insalubridade += r.valor_insalubridade
        folha_adicional_noturno += r.valor_adicional_noturno
        folha_verbas_extraordinarias += r.valor_verbas_extraordinarias

    resultado.folha_total = folha_total
    resultado.folha_linhas_count = folha_linhas_count
    resultado.folha_salario_categoria_total = folha_salario
    resultado.folha_insalubridade_categoria_total = folha_insalubridade
    resultado.folha_adicional_noturno_categoria_total = folha_adicional_noturno
    resultado.folha_verbas_extraordinarias_categoria_total = folha_verbas_extraordinarias

    # --- Escopo: todos os itens dos escopos mensais da loja nesses meses
    itens_todos: List[ItemEscopoMensal] = []
    meses_sem_escopo: List[Tuple[int, int]] = []
    escala_por_escopo_id: Dict[int, Decimal] = {}

    # Pré-carrega a configuração de insalubridade para evitar queries N+1 no loop
    cfg_insalubridade = ConfiguracaoInsalubridadeLoja.objects.filter(loja_id=loja_id).first()
    if cfg_insalubridade:
        loja._cached_config_insalubridade = cfg_insalubridade
    else:
        obter_ou_criar_config_insalubridade_loja(loja)

    # Busca todos os escopos das competências desejadas de uma vez
    q_escopos = Q()
    for ano, mes in competencias:
        q_escopos |= Q(ano=ano, mes=mes)

    escopos = (
        EscopoMensal.objects.filter(loja_id=loja_id)
        .filter(q_escopos)
        .prefetch_related("itens", "itens__cargo")
    )
    escopos_dict = {(esc.ano, esc.mes): esc for esc in escopos}

    # Mapeia quais competências de fato possuem qualquer folha de pagamento na base geral do banco
    datas_com_folha_no_banco = set(
        ResumoFolhaMensal.objects.filter(dt_arq__in=datas_exatas)
        .values_list("dt_arq", flat=True)
    )

    competencias_com_folha_da_loja = set(r.dt_arq for r in resumos)

    for ano, mes in competencias:
        # Regra: Se esse mês possui dados de folha de pagamento importados no banco,
        # só calculamos o escopo se a loja tiver de fato folha nesta competência.
        dt_comp = datetime.date(ano, mes, 1)
        if dt_comp in datas_com_folha_no_banco:
            if dt_comp not in competencias_com_folha_da_loja:
                continue

        escopo = escopos_dict.get((ano, mes))
        if escopo is None:
            # EXPLICAÇÃO DO PORQUÊ EXISTE (Docstring de suporte em português):
            # Esta busca de fallback serve para encontrar o último escopo planejado ativo
            # da loja em competências passadas, evitando a necessidade do usuário cadastrar
            # registros idênticos todo mês.
            escopo_fallback = (
                EscopoMensal.objects.filter(loja_id=loja_id)
                .filter(Q(ano__lt=ano) | Q(ano=ano, mes__lt=mes))
                .order_by("-ano", "-mes")
                .prefetch_related("itens", "itens__cargo")
                .first()
            )
            if escopo_fallback is None:
                # Caso realmente não exista planejamento atual nem anterior
                meses_sem_escopo.append((ano, mes))
                continue
            
            # Criamos uma instância temporária em memória do EscopoMensal para a competência
            # analisada. Isso garante que a estimativa salarial utilize as tabelas salariais
            # correspondentes ao ano do comparativo (ano), e não ao ano do escopo de origem.
            escopo = EscopoMensal(
                id=escopo_fallback.id,
                loja=loja,
                ano=ano,
                mes=mes,
            )
            escopo.loja = loja
            escala_por_escopo_id[escopo_fallback.pk] = escala_insalubridade_fixa_para_escopo(escopo_fallback)
            
            # Cria cópias dos itens em memória vinculados ao escopo virtual
            for item_orig in escopo_fallback.itens.all():
                item_fake = ItemEscopoMensal(
                    id=item_orig.id,
                    escopo_mensal=escopo,
                    cargo=item_orig.cargo,
                    turno=item_orig.turno,
                    quantidade=item_orig.quantidade,
                )
                itens_todos.append(item_fake)
        else:
            # Garante que a loja pré-carregada seja usada nos métodos internos
            escopo.loja = loja
            escala_por_escopo_id[escopo.pk] = escala_insalubridade_fixa_para_escopo(escopo)
            itens_todos.extend(list(escopo.itens.all()))

    resultado.escopo_meses_sem_registro = meses_sem_escopo

    if not itens_todos:
        return resultado

    cache_regional, cache_minimo_br = montar_caches_salario_para_itens(itens_todos)

    for item in itens_todos:
        escala = escala_por_escopo_id.get(item.escopo_mensal_id, Decimal("1"))
        det = item.get_estimativa_detalhada(
            cache_regional,
            cache_minimo_br,
            escala_insalubridade_fixa=escala,
        )
        if det is None:
            resultado.escopo_itens_sem_estimativa += 1
            continue
        resultado.escopo_base_total += det["base_total"]
        resultado.escopo_insalubridade_fixa_total += det["insalubridade_fixa_total"]
        resultado.escopo_insalubridade_banheirista_total += det[
            "insalubridade_banheirista_total"
        ]
        resultado.escopo_adicional_noturno_total += det["adicional_noturno_total"]
        resultado.escopo_total += det["total"]

    # =========================================================================
    # DETALHAMENTO DE COLABORADORES POR CATEGORIA (Rubricas detalhadas)
    # Por que existe: Permite que o usuário no frontend clique em uma categoria
    # (Salário Base, Insalubridade, Adicional Noturno, Verbas Extraordinárias)
    # para expandir e listar quais colaboradores receberam valores e quanto receberam.
    # =========================================================================
    folha_qs = LinhaFolha.objects.filter(
        loja_id=loja_id,
        dt_arq__in=datas_exatas,
        verba__tipo_codigo="PROVENTO",
        verba__considerar_na_contagem=True,
    )

    q_salario = _q_categoria_um_dos(CAT_FOLHA_SALARIO)
    q_insalubridade = _q_categoria_um_dos(CAT_FOLHA_INSALUBRIDADE)
    q_adicional_noturno = _q_categoria_um_dos(CAT_FOLHA_ADICIONAL_NOTURNO)

    # Agrupa e soma no banco de dados por matricula (usando Group By matricula)
    linhas_salario = (
        folha_qs.filter(q_salario)
        .values("matricula")
        .annotate(total=Sum("valor"))
        .order_by("-total")
    )
    
    linhas_insalubridade = (
        folha_qs.filter(q_insalubridade)
        .values("matricula")
        .annotate(total=Sum("valor"))
        .order_by("-total")
    )
    
    linhas_adicional_noturno = (
        folha_qs.filter(q_adicional_noturno)
        .values("matricula")
        .annotate(total=Sum("valor"))
        .order_by("-total")
    )

    linhas_extraordinarias = (
        folha_qs.exclude(q_salario).exclude(q_insalubridade).exclude(q_adicional_noturno)
        .values("matricula")
        .annotate(total=Sum("valor"))
        .order_by("-total")
    )

    # Coleta todas as matrículas para obter os nomes em uma única query
    todas_matriculas = set()
    for item in list(linhas_salario) + list(linhas_insalubridade) + list(linhas_adicional_noturno) + list(linhas_extraordinarias):
        todas_matriculas.add(item["matricula"])

    # Importação local do Colaborador para evitar importação circular no Django
    from colaboradores.models import Colaborador
    colaboradores_dict = {
        colab.re: colab.nome
        for colab in Colaborador.objects.filter(re__in=todas_matriculas)
    }

    def formatar_lista_colabs(linhas_agrupadas):
        lista = []
        for item in linhas_agrupadas:
            mat = item["matricula"]
            nome = colaboradores_dict.get(mat) or f"Colaborador {mat}"
            lista.append({
                "matricula": mat,
                "nome": nome,
                "valor": float(item["total"]),
            })
        return lista

    resultado.colaboradores_salario = formatar_lista_colabs(linhas_salario)
    resultado.colaboradores_insalubridade = formatar_lista_colabs(linhas_insalubridade)
    resultado.colaboradores_adicional_noturno = formatar_lista_colabs(linhas_adicional_noturno)
    resultado.colaboradores_verbas_extraordinarias = formatar_lista_colabs(linhas_extraordinarias)

    return resultado
