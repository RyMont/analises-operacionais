from datetime import date
from decimal import Decimal
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from lojas.models import (
    Loja,
    EscopoMensal,
    ItemEscopoMensal,
    Cargo,
    Salario,
    LinhaFolha,
    Verba,
    ConfiguracaoInsalubridadeLoja,
    obter_ou_criar_config_insalubridade_loja,
)
from lojas.services.comparativo_loja import montar_resultado_comparativo

class ComparativoViewsTests(TestCase):
    """
    Docstring explicativa (segundo regra do usuário):
    Por que existe: Esta classe valida o fluxo completo de cálculo do Comparativo (Raio-X),
    testando a otimização de queries de data e o novo endpoint de relatório paginado.
    """

    def setUp(self):
        # Cria um usuário administrador de teste
        self.user = User.objects.create_superuser(username="testadmin", password="password123")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Cria a loja de teste
        self.loja = Loja.objects.create(
            nome_referencia="LOJA MODELO SP",
            centro_de_custo="123456789012",
            quadro="5",
            uf="SP",
        )

        # Configura insalubridade
        self.cfg = obter_ou_criar_config_insalubridade_loja(self.loja)
        self.cfg.insalubridade_fixa_percentual = Decimal("20.00")
        self.cfg.save()

        # Cria cargo e salário
        self.cargo = Cargo.objects.create(nome="AUXILIAR")
        Salario.objects.create(
            cargo=self.cargo,
            uf="SP",
            ano=2026,
            valor=Decimal("1500.00")
        )
        
        # Cria salário mínimo nacional
        self.cargo_min = Cargo.objects.create(nome="MÍNIMO NACIONAL")
        Salario.objects.create(
            cargo=self.cargo_min,
            uf="BR",
            ano=2026,
            valor=Decimal("1412.00")
        )

        # Cria verba
        self.verba = Verba.objects.create(
            codigo_verba="001",
            descricao="Salario base",
            tipo_codigo="PROVENTO",
            considerar_na_contagem=True,
            categoria="SALÁRIO",
        )

        # Cria escopo mensal (Orçado)
        self.escopo = EscopoMensal.objects.create(
            loja=self.loja,
            ano=2026,
            mes=3,
        )
        self.item_escopo = ItemEscopoMensal.objects.create(
            escopo_mensal=self.escopo,
            cargo=self.cargo,
            turno="DIURNO",
            quantidade=2,
        )

        # Cria linhas da folha (Realizado)
        self.linha = LinhaFolha.objects.create(
            matricula="RE001",
            verba=self.verba,
            codigo_verba="001",
            valor=Decimal("1600.00"),
            dt_arq=date(2026, 3, 1),
            dt_pagamento=date(2026, 3, 30),
            centro_custo="123456789012",
            centro_custo_real="123456789012",
            loja=self.loja,
            categoria="SALÁRIO",
        )

        # Força o recálculo para popular o ResumoFolhaMensal no ambiente de testes
        from lojas.services.folha_importacao import recalcular_resumos_folha
        recalcular_resumos_folha([(self.loja.id, date(2026, 3, 1))])


    def test_montar_resultado_comparativo(self):
        """Testa se o serviço calcula corretamente os desvios."""
        res = montar_resultado_comparativo(self.loja.pk, [(2026, 3)])
        self.assertIsNotNone(res)
        self.assertEqual(res.folha_total, Decimal("1600.00"))
        # 2 pessoas com salário 1500.00 = 3000.00
        self.assertEqual(res.escopo_base_total, Decimal("3000.00"))
        # Total orçado = 3000 (base) + 600 (insalubridade fixa) = 3600.00
        self.assertEqual(res.escopo_total, Decimal("3600.00"))
        self.assertEqual(res.diferenca_folha_menos_escopo, Decimal("-2000.00"))

    def test_comparativo_relatorio_api(self):
        """Testa se a API de relatório paginado retorna dados válidos."""
        response = self.client.get("/comparativo/relatorio/", {"period": "2026-03"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertIn("results", data)
        self.assertIn("resultados", data["results"])
        self.assertIn("kpis", data["results"])
        
        kpis = data["results"]["kpis"]
        self.assertEqual(kpis["realizado_total"], 1600.0)
        self.assertEqual(kpis["orcado_total"], 3600.0)
        self.assertEqual(kpis["desvio_total"], -2000.0)

    def test_comparativo_filtro_opcoes_api(self):
        """Testa as opções de filtro da API."""
        response = self.client.get("/comparativo/filtro-opcoes/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("competencias", response.data)
        self.assertIn("ufs", response.data)

    def test_comparativo_relatorio_exportar_excel(self):
        """Testa se a rota de exportação para Excel retorna planilha válida com os dados das lojas."""
        import pandas as pd
        from io import BytesIO

        response = self.client.get("/comparativo/relatorio/exportar/", {"period": "2026-03"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("attachment; filename=", response["Content-Disposition"])

        # Lê o conteúdo binário com o pandas para checar se as colunas estão corretas
        excel_data = BytesIO(response.content)
        df = pd.read_excel(excel_data, sheet_name="Comparativo Filiais")
        
        expected_columns = [
            "Filial Física",
            "Supervisor",
            "Coordenador",
            "UF",
            "Orçado (Escopo)",
            "Real (Folha)",
            "Desvio",
        ]
        self.assertEqual(list(df.columns), expected_columns)
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["Filial Física"], "LOJA MODELO SP")
        self.assertEqual(df.iloc[0]["UF"], "SP")
        self.assertEqual(df.iloc[0]["Orçado (Escopo)"], 3600.0)
        self.assertEqual(df.iloc[0]["Real (Folha)"], 1600.0)
        self.assertEqual(df.iloc[0]["Desvio"], -2000.0)

    def test_comparativo_fallback_escopo_anterior(self):
        """
        Por que existe: Testa se o comparativo busca o escopo anterior mais recente
        como fallback quando a competência desejada não possui escopo próprio cadastrado.
        """
        # Executa o comparativo para 2026-04. A loja não tem escopo cadastrado em 2026/04,
        # mas tem em 2026/03. Deve fazer fallback automático para o de 2026/03.
        res = montar_resultado_comparativo(self.loja.pk, [(2026, 4)])
        self.assertIsNotNone(res)
        
        # A estimativa do escopo deve ser a mesma (2 auxiliares: 3000 base + 600 insalubridade)
        self.assertEqual(res.escopo_total, Decimal("3600.00"))
        self.assertEqual(res.escopo_base_total, Decimal("3000.00"))
        
        # A lista de meses sem registro de escopo real deve ser vazia, pois houve fallback bem-sucedido
        self.assertEqual(len(res.escopo_meses_sem_registro), 0)

    def test_comparativo_sem_escopo_anterior(self):
        """
        Por que existe: Garante que se não houver nenhum escopo atual nem anterior,
        o mês analisado seja corretamente marcado como sem registro de escopo.
        """
        # Executa para 2026-02. Não há nenhum escopo antes de 2026/02.
        res = montar_resultado_comparativo(self.loja.pk, [(2026, 2)])
        self.assertIsNotNone(res)
        
        # Deve ter totais zerados
        self.assertEqual(res.escopo_total, Decimal("0.00"))
        self.assertEqual(res.escopo_base_total, Decimal("0.00"))
        
        # O mês (2026, 2) deve estar na lista de meses sem registro
        self.assertIn((2026, 2), res.escopo_meses_sem_registro)

    def test_exclusao_centros_de_custo_escritorio(self):
        """
        Por que existe: Garante que lojas com centro de custo de escritório central
        (como 999999990020) sejam excluídas das análises do Raio-X, mas equipes de apoio
        (como 999999990051) sejam mantidas.
        """
        # Cria uma loja com centro de custo de escritório
        loja_escritorio = Loja.objects.create(
            nome_referencia="ESCRITORIO CENTRAL",
            centro_de_custo="999999990020",
            quadro="1",
            uf="BR",
        )

        # Cria uma loja com centro de custo de apoio operacional (não deve ser excluída)
        loja_apoio = Loja.objects.create(
            nome_referencia="APOIO REGIONAL SP",
            centro_de_custo="999999990051",
            quadro="1",
            uf="SP",
        )

        # Adiciona folha de pagamento para esta loja de escritório
        LinhaFolha.objects.create(
            matricula="RE099",
            verba=self.verba,
            codigo_verba="001",
            valor=Decimal("5000.00"),
            dt_arq=date(2026, 3, 1),
            dt_pagamento=date(2026, 3, 30),
            centro_custo="999999990020",
            centro_custo_real="999999990020",
            loja=loja_escritorio,
            categoria="SALÁRIO",
        )

        # Adiciona folha de pagamento para o apoio
        LinhaFolha.objects.create(
            matricula="RE100",
            verba=self.verba,
            codigo_verba="001",
            valor=Decimal("3000.00"),
            dt_arq=date(2026, 3, 1),
            dt_pagamento=date(2026, 3, 30),
            centro_custo="999999990051",
            centro_custo_real="999999990051",
            loja=loja_apoio,
            categoria="SALÁRIO",
        )

        # Força o recálculo dos resumos de folha para incluir as novas linhas
        from lojas.services.folha_importacao import recalcular_resumos_folha
        recalcular_resumos_folha([
            (loja_escritorio.id, date(2026, 3, 1)),
            (loja_apoio.id, date(2026, 3, 1))
        ])

        # Limpa o cache global dos filtros para forçar a leitura do banco
        import lojas.views.comparativo_relatorio
        lojas.views.comparativo_relatorio._FILTROS_CACHE = None

        # Chama a API de opções de filtros e garante que essa UF/loja não esteja disponível
        response_filtros = self.client.get("/comparativo/filtro-opcoes/")
        self.assertEqual(response_filtros.status_code, status.HTTP_200_OK)
        # 'BR' não deve estar nas UFs porque a única loja com 'BR' é o escritório, que foi filtrado
        self.assertNotIn("BR", response_filtros.data["ufs"])
        # 'SP' deve estar nas UFs (loja modelo e loja_apoio)
        self.assertIn("SP", response_filtros.data["ufs"])

        # Chama a API de comparativo e garante que os desvios e resultados não incluam os 5000.00 do escritório, mas incluam o apoio
        response = self.client.get("/comparativo/relatorio/", {"period": "2026-03"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["results"]
        
        # Garante que os resultados da tabela paginada não contêm "ESCRITORIO CENTRAL"
        nomes_lojas = [r["loja_nome"] for r in data["resultados"]]
        self.assertNotIn("ESCRITORIO CENTRAL", nomes_lojas)
        # Garante que contêm "APOIO REGIONAL SP"
        self.assertIn("APOIO REGIONAL SP", nomes_lojas)

        # Os KPIs consolidados devem permanecer com a soma da loja modelo (1600.0) e do apoio (3000.0) = 4600.0
        kpis = data["kpis"]
        self.assertEqual(kpis["realizado_total"], 4600.0)
        self.assertEqual(kpis["orcado_total"], 3600.0)

    def test_exclusao_lojas_inativas(self):
        """
        Por que existe: Garante que lojas com status='INATIVA' sejam excluídas das análises do Raio-X,
        mesmo que possuam lançamentos de folha de pagamento por qualquer motivo residual.
        """
        # Cria uma loja inativa
        loja_inativa = Loja.objects.create(
            nome_referencia="LOJA ANTIGA INATIVA",
            centro_de_custo="987654321098",
            quadro="2",
            uf="RJ",  # UF exclusiva para testar o filtro
            status="INATIVA"
        )

        # Adiciona folha de pagamento para esta loja inativa
        LinhaFolha.objects.create(
            matricula="RE098",
            verba=self.verba,
            codigo_verba="001",
            valor=Decimal("4000.00"),
            dt_arq=date(2026, 3, 1),
            dt_pagamento=date(2026, 3, 30),
            centro_custo="987654321098",
            centro_custo_real="987654321098",
            loja=loja_inativa,
            categoria="SALÁRIO",
        )

        # Força o recálculo dos resumos de folha para incluir a nova linha
        from lojas.services.folha_importacao import recalcular_resumos_folha
        recalcular_resumos_folha([
            (loja_inativa.id, date(2026, 3, 1))
        ])

        # Limpa o cache global dos filtros para forçar a leitura do banco
        import lojas.views.comparativo_relatorio
        lojas.views.comparativo_relatorio._FILTROS_CACHE = None

        # Chama a API de opções de filtros e garante que a UF da loja inativa ('RJ') não esteja disponível
        response_filtros = self.client.get("/comparativo/filtro-opcoes/")
        self.assertEqual(response_filtros.status_code, status.HTTP_200_OK)
        self.assertNotIn("RJ", response_filtros.data["ufs"])

        # Chama a API de comparativo e garante que os desvios e resultados não incluam os 4000.00 da loja inativa
        response = self.client.get("/comparativo/relatorio/", {"period": "2026-03"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["results"]
        
        # Garante que os resultados da tabela paginada não contêm "LOJA ANTIGA INATIVA"
        nomes_lojas = [r["loja_nome"] for r in data["resultados"]]
        self.assertNotIn("LOJA ANTIGA INATIVA", nomes_lojas)

        # Os KPIs consolidados devem permanecer apenas com a soma da loja modelo (1600.0)
        # Os 4000.00 da loja inativa devem ser ignorados.
        kpis = data["kpis"]
        self.assertEqual(kpis["realizado_total"], 1600.0)

    def test_desconsiderar_loja_com_folha_zerada_com_filtro(self):
        """
        Por que existe: Garante que, ao filtrar por uma loja específica que está com a folha zerada
        (mas o mês de referência possui dados de folha importados no banco para outras lojas),
        o custo orçado (escopo) dessa loja seja desconsiderado (retornando 0.0), evitando divergências de orçamento.
        """
        # Cria uma nova loja ativa
        loja_sem_folha = Loja.objects.create(
            nome_referencia="LOJA SEM FOLHA",
            centro_de_custo="876543210987",
            quadro="3",
            uf="SP",
        )
        
        # Cria escopo orçado para ela em 2026/03
        escopo_loja = EscopoMensal.objects.create(
            loja=loja_sem_folha,
            ano=2026,
            mes=3,
        )
        ItemEscopoMensal.objects.create(
            escopo_mensal=escopo_loja,
            cargo=self.cargo,
            turno="DIURNO",
            quantidade=1,
        )
        
        # Não adicionamos folha para a loja_sem_folha em 2026/03 (a folha dela fica zerada).
        # Porém, a loja modelo (self.loja) possui folha importada para 2026/03 (self.linha).
        
        # Faz uma consulta ao comparativo filtrando especificamente por essa loja sem folha
        response = self.client.get("/comparativo/relatorio/", {
            "period": "2026-03",
            "loja": str(loja_sem_folha.id)
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # O orçado total para essa loja filtrada deve ser 0.0, pois a folha dela é zerada,
        # e outras lojas possuem folha na competência de 2026-03.
        kpis = response.data["results"]["kpis"]
        self.assertEqual(kpis["realizado_total"], 0.0)
        self.assertEqual(kpis["orcado_total"], 0.0)

    def test_verbas_extraordinarias_calculo_e_detalhamento(self):
        """
        Por que existe: Garante que verbas que não são Salário, Insalubridade nem Adicional Noturno
        sejam devidamente alocadas na categoria 'Verbas Extraordinárias', permitindo drill-down
        e fechando a soma da tabela em 100% com o total da folha.
        """
        from lojas.services.folha_importacao import recalcular_resumos_folha
        from lojas.models import ResumoFolhaMensal

        # Cria verba extraordinária
        verba_extra = Verba.objects.create(
            codigo_verba="999",
            descricao="Premiacao Eventual",
            tipo_codigo="PROVENTO",
            considerar_na_contagem=True,
            categoria="PREMIACOES",
        )

        # Adiciona LinhaFolha com verba extraordinária
        LinhaFolha.objects.create(
            matricula="RE002",
            verba=verba_extra,
            codigo_verba="999",
            valor=Decimal("450.00"),
            dt_arq=date(2026, 3, 1),
            dt_pagamento=date(2026, 3, 30),
            centro_custo="123456789012",
            centro_custo_real="123456789012",
            loja=self.loja,
            categoria="PREMIACOES",
        )

        # Recalcula os resumos da folha
        recalcular_resumos_folha([(self.loja.id, date(2026, 3, 1))])

        # Verifica o valor gravado em ResumoFolhaMensal
        resumo = ResumoFolhaMensal.objects.get(loja=self.loja, dt_arq=date(2026, 3, 1))
        self.assertEqual(resumo.valor_salario, Decimal("1600.00"))
        self.assertEqual(resumo.valor_verbas_extraordinarias, Decimal("450.00"))
        self.assertEqual(resumo.valor_total, Decimal("2050.00"))

        # Executa a montagem do comparativo
        res = montar_resultado_comparativo(self.loja.pk, [(2026, 3)])
        self.assertIsNotNone(res)
        self.assertEqual(res.folha_salario_categoria_total, Decimal("1600.00"))
        self.assertEqual(res.folha_verbas_extraordinarias_categoria_total, Decimal("450.00"))
        self.assertEqual(res.desvio_verbas_extraordinarias, Decimal("450.00"))
        self.assertEqual(res.folha_total, Decimal("2050.00"))
        self.assertEqual(res.tabela_folha_total, Decimal("2050.00"))
        self.assertEqual(len(res.colaboradores_verbas_extraordinarias), 1)
        self.assertEqual(res.colaboradores_verbas_extraordinarias[0]["matricula"], "RE002")
        self.assertEqual(res.colaboradores_verbas_extraordinarias[0]["valor"], 450.0)

        # Valida chamada à API de comparativo da loja
        response = self.client.get("/comparativo/", {"loja": str(self.loja.id), "c": "2026-3"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        res_api = response.data["resultado"]
        self.assertEqual(res_api["folha_verbas_extraordinarias_categoria_total"], "450.00")
        self.assertEqual(res_api["desvio_verbas_extraordinarias"], "450.00")
        self.assertEqual(len(res_api["colaboradores_verbas_extraordinarias"]), 1)






