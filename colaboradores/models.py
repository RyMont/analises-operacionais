from django.db import models
from lojas.models import Loja
from django.core.files.storage import FileSystemStorage
from decouple import config

# Por que existe: Instancia o storage customizado para salvar arquivos na pasta escolhida no .env.
testes_anexos_path = config("TESTES_ANEXOS_PATH", default=None)
testes_storage = FileSystemStorage(location=testes_anexos_path) if testes_anexos_path else None


class Colaborador(models.Model):
    """
    Representa um colaborador vindo do sistema TOTVS.
    Contém informações de contrato, cargo e lotação (centro de custo).
    """

    re = models.CharField("RE", max_length=20, unique=True)
    nome = models.CharField("Nome", max_length=255, db_index=True)
    loja = models.ForeignKey(
        Loja,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="colaboradores",
        verbose_name="Loja",
    )
    centro_custo = models.CharField("Centro de Custo", max_length=50)
    data_admissao = models.DateField("Data de Admissão")
    data_demissao = models.DateField("Data de Demissão", null=True, blank=True)
    # Por que existe: Registra o motivo amigável do desligamento mapeado do CSV de termos para cálculo de Turnover.
    motivo_demissao = models.CharField("Motivo de Demissão", max_length=100, null=True, blank=True, db_index=True)
    salario_rescisao = models.DecimalField("Salário na Rescisão", max_digits=12, decimal_places=2, null=True, blank=True)
    aviso_indenizado_dias = models.DecimalField("Dias Aviso Indenizado", max_digits=6, decimal_places=2, null=True, blank=True, default=0)
    ferias_vencidas_dias = models.DecimalField("Dias Férias Vencidas", max_digits=6, decimal_places=2, null=True, blank=True, default=0)
    ferias_proporcionais_dias = models.DecimalField("Dias Férias Proporcionais", max_digits=6, decimal_places=2, null=True, blank=True, default=0)
    ferias_aviso_dias = models.DecimalField("Dias Férias Aviso", max_digits=6, decimal_places=2, null=True, blank=True, default=0)
    valor_rescisao_estimado = models.DecimalField("Valor Estimado Rescisão", max_digits=12, decimal_places=2, null=True, blank=True, default=0)
    status = models.CharField("Status", max_length=100, db_index=True)
    cargo = models.CharField("Cargo", max_length=150, db_index=True)
    cpf = models.CharField("CPF", max_length=14, null=True, blank=True)
    termino_1 = models.DateField("Término 1", null=True, blank=True, db_index=True)
    termino_2 = models.DateField("Término 2", null=True, blank=True, db_index=True)

    # Campos vindos da planilha de Gestão de Pessoas
    funcao_gestao = models.CharField("Função (Gestão)", max_length=255, null=True, blank=True)
    loja_gestao = models.ForeignKey(
        Loja,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="colaboradores_loja_gestao",
        verbose_name="Loja (Gestão)",
        db_column="loja_gestao",
    )
    loja_geo = models.ForeignKey(
        Loja,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="colaboradores_loja_geo",
        verbose_name="Loja (GeoVictoria)",
    )
    status_gestao = models.CharField("Status (Gestão)", max_length=255, null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_divergente(self):
        """
        Compara as lojas externas preenchidas contra a loja TOTVS para destacar divergências reais.
        """
        if not self.loja_id:
            return False

        if self.loja and self.loja.dispensa_gestao_pessoas:
            return False

        return self.loja_gestao_divergente or self.loja_geo_divergente

    @property
    def loja_gestao_divergente(self):
        """
        Evita marcar divergência quando a Gestão está em branco e só compara quando existe ID dos dois lados.
        """
        if not self.loja_id or not self.loja_gestao_id:
            return False
        return self.loja_id != self.loja_gestao_id

    @property
    def loja_geo_divergente(self):
        """
        Evita marcar divergência quando a GeoVictoria está em branco e só compara quando existe ID dos dois lados.
        """
        if not self.loja_id or not self.loja_geo_id:
            return False
        return self.loja_id != self.loja_geo_id

    class Meta:
        verbose_name = "Colaborador"
        verbose_name_plural = "Colaboradores"
        ordering = ["nome"]

    def __str__(self):
        return f"{self.re} - {self.nome}"

class ControleTermino(models.Model):
    """
    Registra as ações tomadas sobre os términos de experiência (Prorrogação, Término, Manutenção).
    """
    ACOES = [
        ('prorrogado', 'Prorrogado'),
        ('termino', 'Término'),
        ('manter', 'Manter'),
    ]

    colaborador = models.ForeignKey(
        Colaborador, on_delete=models.CASCADE, related_name='controles_termino'
    )
    etapa = models.IntegerField("Etapa do Término (1 ou 2)")
    acao = models.CharField("Ação", max_length=20, choices=ACOES)
    observacao = models.TextField("Observação", blank=True)
    respondido_por = models.CharField("Respondido Por", max_length=255, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Controle de Término"
        verbose_name_plural = "Controles de Término"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.colaborador.nome} - Etapa {self.etapa} - {self.get_acao_display()}"


class Agendamento(models.Model):
    """
    Representa o agendamento de um colaborador de apoio a uma loja física em um dia.

    Por que existe: Permite a programação diária dos roteiros da equipe de apoio. 
    Contém a vinculação relacional ao colaborador e à loja física, o status do roteiro, 
    o turno (matutino ou noturno), os horários previstos de entrada e saída, e observações operacionais.
    """
    STATUS_CHOICES = [
        ('agendado', 'Agendado'),
        ('concluido', 'Concluído'),
        ('folga', 'Folga'),
        ('livre', 'Sem Loja (Livre)'),
        ('faltou', 'Falta'),
        ('atestado', 'Atestado'),
    ]

    colaborador = models.ForeignKey(
        Colaborador,
        on_delete=models.CASCADE,
        related_name="agendamentos",
        verbose_name="Colaborador",
    )
    loja = models.ForeignKey(
        Loja,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agendamentos",
        verbose_name="Loja",
    )
    loja_manual = models.CharField("Loja Manual", max_length=255, blank=True, null=True)
    funcao = models.CharField("Função a Exercer", max_length=150, default="Apoio")
    data = models.DateField("Data do Roteiro")
    status = models.CharField("Status", max_length=20, choices=STATUS_CHOICES, default='agendado')
    turno = models.CharField("Turno", max_length=20, default='noturno')
    hora_entrada = models.CharField("Hora Entrada", max_length=10, blank=True, null=True)
    hora_saida = models.CharField("Hora Saída", max_length=10, blank=True, null=True)
    observacao = models.TextField("Observação", blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Agendamento"
        verbose_name_plural = "Agendamentos"
        unique_together = ("colaborador", "data")
        ordering = ["data"]

    def __str__(self):
        dest = self.loja.nome_referencia if self.loja else (self.loja_manual or "Sem Loja")
        return f"{self.colaborador.nome} em {self.data} - {dest}"


class TestePromocao(models.Model):
    """
    Representa uma solicitação de teste de promoção de um colaborador.
    
    Por que existe: Registra os dados da solicitação do teste, incluindo a data de início,
    o colaborador envolvido, o anexo da folha de teste e o status atual da aprovação/ciclo.
    """
    STATUS_CHOICES = [
        ("pendente", "Pendente de Aprovação"),
        ("ativo", "Ativo"),
        ("promovido", "Promovido"),
        ("cancelado", "Cancelado"),
    ]

    colaborador = models.ForeignKey(
        Colaborador,
        on_delete=models.CASCADE,
        related_name="testes_promocao",
        verbose_name="Colaborador",
    )
    data_inicio = models.DateField("Data de Início")
    cargo_teste = models.CharField("Cargo em Teste", max_length=150, blank=True, null=True)
    status = models.CharField(
        "Status",
        max_length=20,
        choices=STATUS_CHOICES,
        default="pendente",
        db_index=True,
    )
    anexo = models.FileField(
        "Anexo da Folha de Teste",
        storage=testes_storage,
        upload_to="",
        null=True,
        blank=True,
    )
    criado_por = models.CharField("Criado Por", max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Teste de Promoção"
        verbose_name_plural = "Testes de Promoção"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.colaborador.nome} - Início: {self.data_inicio} - {self.get_status_display()}"


class HistoricoAcaoTeste(models.Model):
    """
    Registra as decisões e o andamento mensal dos testes de promoção.
    
    Por que existe: Mantém um histórico detalhado e auditável de cada ação tomada pelo
    usuário durante o controle mensal (Aprovar, Pagar Prêmio, Promover, Cancelar), incluindo
    a observação com a data/autor da solicitação e quem realizou o lançamento no sistema.
    """
    ACOES = [
        ("ativar", "Aprovar/Ativar"),
        ("registrar_resposta", "Registrar Resposta do Supervisor"),
        ("pagar_premio", "Pagar Prêmio"),
        ("promover", "Promover"),
        ("cancelar", "Cancelar"),
        ("pagar_premio_cancelar", "Pagar Prêmio e Cancelar"),
        ("alterar_data_inicio", "Alteração de Data de Início"),
    ]

    teste = models.ForeignKey(
        TestePromocao,
        on_delete=models.CASCADE,
        related_name="historico_acoes",
        verbose_name="Teste de Promoção",
    )
    acao = models.CharField("Ação", max_length=30, choices=ACOES)
    resposta_supervisor = models.CharField(
        "Resposta do Supervisor",
        max_length=30,
        choices=[
            ("pagar_premio", "Pagar Prêmio"),
            ("promover", "Promover"),
            ("cancelar", "Cancelar"),
            ("pagar_premio_cancelar", "Pagar Prêmio e Cancelar"),
        ],
        blank=True,
        null=True,
    ) # Por que existe: Guarda a intenção de ação do supervisor antes da efetivação prática pela gestão. E a nova opção pagar_premio_cancelar indica pagamento do prêmio e imediato cancelamento.
    mes_referencia = models.IntegerField("Mês de Referência")
    observacao = models.TextField("Observação", blank=True)
    solicitado_por = models.CharField("Solicitado Por", max_length=255, blank=True)
    realizado_por = models.CharField("Realizado Por", max_length=255, blank=True)
    data_acao = models.DateField("Data da Ação")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Histórico de Ação do Teste"
        verbose_name_plural = "Históricos de Ações dos Testes"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.teste.colaborador.nome} - {self.get_acao_display()} (Mês {self.mes_referencia})"


class PresencaRelogio(models.Model):
    """
    Por que existe: Armazena as batidas de entrada presenciais importadas da GeoVictoria.
    Evita chamadas em tempo real na API externa durante a navegação, permitindo renderizar
    o calendário de presenças por loja em milissegundos.
    """
    punch_id = models.CharField("ID da Batida", max_length=100, unique=True, db_index=True)
    colaborador = models.ForeignKey(
        Colaborador,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="presencias_relogio",
        verbose_name="Colaborador Resolvido"
    )
    cpf_original = models.CharField("CPF da Batida", max_length=15, db_index=True)
    loja = models.ForeignKey(
        Loja,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="presencias_relogio",
        verbose_name="Loja Resolvida"
    )
    grupo_geovictoria = models.CharField("Grupo Original GeoVictoria", max_length=255)
    data = models.DateField("Data da Batida", db_index=True)
    data_hora = models.DateTimeField("Data e Hora da Entrada")
    origem_report = models.BooleanField("Origem Relatório", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Presença do Relógio"
        verbose_name_plural = "Presenças do Relógio"
        ordering = ["-data_hora"]


class Ausencia(models.Model):
    """
    Por que existe: Armazena o registro individual de faltas, atestados e suspensões dos colaboradores,
    desmembrando períodos de afastamento em datas específicas para facilitar a análise e relatórios.
    """
    TIPO_CHOICES = [
        ("falta", "Falta"),
        ("atestado", "Atestado"),
        ("suspensao", "Suspensão"),
    ]

    colaborador = models.ForeignKey(
        Colaborador,
        on_delete=models.CASCADE,
        related_name="ausencias_registradas",
        verbose_name="Colaborador",
    )
    tipo = models.CharField("Tipo", max_length=20, choices=TIPO_CHOICES, db_index=True)
    descricao = models.CharField("Descrição Original", max_length=255)
    data = models.DateField("Data da Ausência", db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Ausência"
        verbose_name_plural = "Ausências"
        unique_together = ("colaborador", "data")
        ordering = ["-data"]

    def __str__(self):
        return f"{self.colaborador.nome} - {self.get_tipo_display()} em {self.data}"




