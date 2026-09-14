from datetime import date, timedelta
from io import BytesIO

import pandas as pd
from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User

from colaboradores.models import Colaborador, ControleTermino
from colaboradores.services.gestao_importacao import importar_gestao_pessoas
from colaboradores.view_utils import derive_termino_state
from lojas.models import Loja


class GestaoImportacaoTests(TestCase):
    def criar_loja(self, nome_referencia, nome_gestao, centro_de_custo):
        """
        Cria lojas pequenas para validar a ligação entre o nome da Gestão e o ID real da loja.
        """
        return Loja.objects.create(
            nome_referencia=nome_referencia,
            nome_gestao=nome_gestao,
            centro_de_custo=centro_de_custo,
            quadro="1",
            uf="SP",
        )

    def criar_planilha_gestao(self, linhas, linhas_lojas=None):
        """
        Monta uma planilha em memória para testar a importação sem depender de arquivo manual.
        """
        if linhas_lojas is None:
            linhas_lojas = []
        arquivo = BytesIO()
        with pd.ExcelWriter(arquivo, engine="openpyxl") as writer:
            pd.DataFrame(linhas).to_excel(
                writer,
                sheet_name="Relação de funcionários",
                index=False,
            )
            pd.DataFrame(linhas_lojas).to_excel(
                writer,
                sheet_name="Relação de lojas",
                index=False,
            )
        arquivo.seek(0)
        return arquivo

    def test_importacao_referencia_loja_pelo_nome_gestao(self):
        loja_totvs = self.criar_loja("LOJA TOTVS", "LOJA TOTVS", "100")
        loja_gestao = self.criar_loja("LOJA GESTAO", "LOJA PLANILHA", "200")

        colaborador = Colaborador.objects.create(
            re="000123",
            nome="Maria Silva",
            loja=loja_totvs,
            centro_custo="100",
            data_admissao=date(2026, 1, 10),
            status="A",
            cargo="OPERADOR",
        )

        arquivo = self.criar_planilha_gestao(
            [
                {
                    "CÓD. FUNCIONÁRIO": 123,
                    "FUNÇÃO": "OPERADOR",
                    "LOJA": " loja planilha ",
                    "STATUS": "ATIVO",
                }
            ],
            linhas_lojas=[
                {
                    "LOJA": "LOJA PLANILHA",
                    "CNPJ": "12.345.678/0001-90",
                    "QUADRO CONTRATO": 15,
                }
            ]
        )

        resultado = importar_gestao_pessoas(arquivo)
        colaborador.refresh_from_db()
        loja_gestao.refresh_from_db()

        self.assertEqual(resultado["atualizados"], 1)
        self.assertEqual(resultado["lojas_gestao_encontradas"], 1)
        self.assertEqual(colaborador.loja_id, loja_totvs.id)
        self.assertEqual(colaborador.loja_gestao_id, loja_gestao.id)
        self.assertTrue(colaborador.is_divergente)
        self.assertEqual(loja_gestao.quadro, "15")
        self.assertEqual(loja_gestao.headcount_real, 1)



class TerminoStateTests(TestCase):
    """
    Testes para validar a máquina de estados de controle de término (derive_termino_state).
    Garante que os status de pendência, prorrogação, efetivação (manter) e término
    sejam derivados corretamente a partir do histórico de decisões do colaborador.
    """

    def setUp(self):
        """
        Cria dados básicos necessários para os testes de controle de término.
        """
        self.loja = Loja.objects.create(
            nome_referencia="LOJA TESTE",
            nome_gestao="LOJA TESTE GESTAO",
            centro_de_custo="100",
            quadro="1",
            uf="SP",
        )
        self.colaborador = Colaborador.objects.create(
            re="000999",
            nome="Carlos Teste",
            loja=self.loja,
            centro_custo="100",
            data_admissao=date(2026, 1, 1),
            termino_1=date(2026, 2, 15),
            termino_2=date(2026, 4, 1),
            status="A",
            cargo="FRENTISTA",
        )

    def test_state_pending_first_term(self):
        """
        Valida que o estado inicial é 'Pendente 1º Término' se não há histórico e a data não passou.
        """
        state = derive_termino_state(self.colaborador, date(2026, 1, 15))
        self.assertEqual(state["etapaAtual"], 1)
        self.assertEqual(state["statusControle"], "Pendente 1º Término")
        self.assertFalse(state["encerrado"])
        self.assertIsNone(state["ultimaAcao"])

    def test_state_first_term_passed_without_decision(self):
        """
        Valida que se o primeiro prazo passou sem decisão, o estado assume automaticamente a etapa 2 pendente.
        """
        state = derive_termino_state(self.colaborador, date(2026, 2, 20))
        self.assertEqual(state["etapaAtual"], 2)
        self.assertEqual(state["statusControle"], "Pendente 2º Término")
        self.assertFalse(state["encerrado"])
        self.assertIsNone(state["ultimaAcao"])

    def test_state_first_term_manter(self):
        """
        Valida que a decisão de 'manter' (Efetivar) na etapa 1 encerra o fluxo e marca como Mantido.
        """
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=1,
            acao="manter",
            observacao="Ótimo desempenho.",
            respondido_por="Coordenador",
        )
        state = derive_termino_state(self.colaborador, date(2026, 1, 15))
        self.assertEqual(state["etapaAtual"], 1)
        self.assertEqual(state["statusControle"], "Mantido")
        self.assertTrue(state["encerrado"])
        self.assertEqual(state["ultimaAcao"], "manter")

    def test_state_first_term_prorrogado(self):
        """
        Valida que a decisão de 'prorrogado' na etapa 1 move o fluxo para a etapa 2.
        """
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=1,
            acao="prorrogado",
            observacao="Necessita mais avaliação.",
            respondido_por="Coordenador",
        )
        state = derive_termino_state(self.colaborador, date(2026, 1, 15))
        self.assertEqual(state["etapaAtual"], 2)
        self.assertEqual(state["statusControle"], "Prorrogado")
        self.assertFalse(state["encerrado"])
        self.assertEqual(state["ultimaAcao"], "prorrogado")

    def test_state_second_term_manter_after_prorrogado(self):
        """
        Valida que após prorrogação na etapa 1, a decisão 'manter' na etapa 2 encerra o fluxo como Mantido.
        """
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=1,
            acao="prorrogado",
            observacao="Prorrogar.",
        )
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=2,
            acao="manter",
            observacao="Efetivado final.",
        )
        state = derive_termino_state(self.colaborador, date(2026, 2, 20))
        self.assertEqual(state["etapaAtual"], 2)
        self.assertEqual(state["statusControle"], "Mantido")
        self.assertTrue(state["encerrado"])
        self.assertEqual(state["ultimaAcao"], "manter")

    def test_state_backtrack_decision_etapa_1(self):
        """
        Valida que se o usuário alterar a etapa 1 de 'prorrogado' para 'manter',
        o fluxo volta para a etapa 1, fica encerrado e ignora qualquer decisão da etapa 2.
        """
        # 1. Primeiro prorroga na etapa 1 e depois efetiva na etapa 2
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=1,
            acao="prorrogado",
            observacao="Prorrogar.",
        )
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=2,
            acao="manter",
            observacao="Efetivado na etapa 2.",
        )
        # 2. Usuário altera a decisão da etapa 1 para "manter" (Efetivar)
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=1,
            acao="manter",
            observacao="Volta atrás e decide efetivar direto na etapa 1.",
        )

        state = derive_termino_state(self.colaborador, date(2026, 2, 20))
        # Deve respeitar a decisão mais recente da etapa 1 (que é manter) e encerrar o fluxo na etapa 1.
        self.assertEqual(state["etapaAtual"], 1)
        self.assertEqual(state["statusControle"], "Mantido")
        self.assertTrue(state["encerrado"])
        self.assertEqual(state["ultimaAcao"], "manter")

    def test_state_second_term_passed_with_prorrogado_decision(self):
        """
        Valida que se o segundo prazo passou com decisão de prorrogação na etapa 1,
        o estado assume a etapa 2 com status 'Atrasado'.
        """
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=1,
            acao="prorrogado",
            observacao="Prorrogar.",
        )
        state = derive_termino_state(self.colaborador, date(2026, 4, 5))
        self.assertEqual(state["etapaAtual"], 2)
        self.assertEqual(state["statusControle"], "Atrasado")
        self.assertFalse(state["encerrado"])
        self.assertEqual(state["ultimaAcao"], "prorrogado")

    def test_state_second_term_passed_without_decision(self):
        """
        Valida que se o segundo prazo passou sem qualquer decisão anterior,
        o estado assume a etapa 2 com status 'Atrasado'.
        """
        state = derive_termino_state(self.colaborador, date(2026, 4, 5))
        self.assertEqual(state["etapaAtual"], 2)
        self.assertEqual(state["statusControle"], "Atrasado")
        self.assertFalse(state["encerrado"])
        self.assertIsNone(state["ultimaAcao"])

# Create your tests here.


class TerminoAPITests(TestCase):
    """
    Por que existe: Garante a integridade das requisições REST da listagem e registro
    de término, especificamente as ações de salvar (POST) e limpar (DELETE) decisão.
    """
    def setUp(self):
        # Criar usuário administrador para passar no IsGestaoOrAdministrador
        self.user = User.objects.create_superuser(
            username="admin", email="admin@teste.com", password="password123"
        )
        self.client.force_login(self.user)
        
        # Criar loja e colaborador para os testes
        self.loja = Loja.objects.create(
            nome_referencia="LOJA SP TESTE",
            nome_gestao="LOJA SP TESTE",
            centro_de_custo="999",
            quadro="1",
            uf="SP",
        )
        self.colaborador = Colaborador.objects.create(
            re="999999",
            nome="Colaborador Teste",
            loja=self.loja,
            centro_custo="999",
            data_admissao=date(2026, 1, 10),
            status="A",
            termino_1=date(2026, 2, 10),
            termino_2=date(2026, 3, 10),
        )
        self.url = reverse("colaboradores:terminos_list")

    def test_delete_limpa_decisao_etapa_1_e_2(self):
        # 1. Registrar decisões na etapa 1 e na etapa 2
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=1,
            acao="prorrogado",
            observacao="Prorrogar etapa 1",
        )
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=2,
            acao="manter",
            observacao="Efetivar na etapa 2",
        )

        # Confirmar que existem 2 controles
        self.assertEqual(ControleTermino.objects.filter(colaborador=self.colaborador).count(), 2)

        # 2. Fazer requisição DELETE para limpar a etapa 1
        response = self.client.delete(
            self.url,
            data={"colaborador_id": self.colaborador.id, "etapa": 1},
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)
        # O DELETE na etapa 1 deve apagar tanto a etapa 1 quanto a etapa 2
        self.assertEqual(ControleTermino.objects.filter(colaborador=self.colaborador).count(), 0)

    def test_delete_limpa_apenas_etapa_2(self):
        # 1. Registrar decisões na etapa 1 e na etapa 2
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=1,
            acao="prorrogado",
            observacao="Prorrogar etapa 1",
        )
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=2,
            acao="manter",
            observacao="Efetivar na etapa 2",
        )

        # 2. Fazer requisição DELETE para limpar apenas a etapa 2
        response = self.client.delete(
            self.url,
            data={"colaborador_id": self.colaborador.id, "etapa": 2},
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)
        # O DELETE na etapa 2 deve remover apenas a decisão da etapa 2
        self.assertEqual(ControleTermino.objects.filter(colaborador=self.colaborador).count(), 1)
        self.assertEqual(ControleTermino.objects.filter(colaborador=self.colaborador, etapa=1).count(), 1)

    def test_list_filter_by_acao(self):
        """
        Testa se o filtro de ação ('acao') funciona na listagem de términos.
        """
        today = date.today()
        # Ajustar data de self.colaborador para não expirar por atraso
        self.colaborador.termino_1 = today + timedelta(days=5)
        self.colaborador.termino_2 = today + timedelta(days=35)
        self.colaborador.save()

        # Criar outro colaborador
        colab_outro = Colaborador.objects.create(
            re="888888",
            nome="Outro Colaborador",
            loja=self.loja,
            centro_custo="999",
            data_admissao=today - timedelta(days=10),
            status="A",
            termino_1=today + timedelta(days=5),
            termino_2=today + timedelta(days=35),
        )

        # 1. Por padrão, sem filtros, ambos aparecem (pendentes)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 2)

        # 2. Filtrar por 'pendente' (ambos estão pendentes)
        response = self.client.get(self.url, {"acao": "pendente"})
        self.assertEqual(len(response.data["results"]), 2)

        # 3. Filtrar por 'manter' (nenhum foi efetivado ainda)
        response = self.client.get(self.url, {"acao": "manter"})
        self.assertEqual(len(response.data["results"]), 0)

        # 4. Registrar decisão 'manter' para self.colaborador na etapa 1 (ele encerra)
        ControleTermino.objects.create(
            colaborador=self.colaborador,
            etapa=1,
            acao="manter",
            observacao="Efetivar",
        )

        # Agora, self.colaborador está 'manter' (efetivado) e colab_outro está 'pendente'
        # 5. Filtrar por 'manter' (apenas self.colaborador deve vir)
        response = self.client.get(self.url, {"acao": "manter"})
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["colaborador"]["re"], "999999")

        # 6. Filtrar por 'pendente' (apenas colab_outro deve vir)
        response = self.client.get(self.url, {"acao": "pendente"})
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["colaborador"]["re"], "888888")

    def test_list_order_by_ausencias(self):
        """
        Por que existe: Garante que a ordenação 'ausencias' traz os colaboradores
        com maior soma de faltas e atestados no total primeiro.
        """
        from colaboradores.models import Ausencia

        today = date.today()
        self.colaborador.termino_1 = today + timedelta(days=5)
        self.colaborador.termino_2 = today + timedelta(days=35)
        self.colaborador.cpf = "99999999999"
        self.colaborador.save()

        # Colaborador (total 3 ausências)
        Ausencia.objects.create(colaborador=self.colaborador, tipo="falta", data=today - timedelta(days=1), descricao="Falta")
        Ausencia.objects.create(colaborador=self.colaborador, tipo="falta", data=today - timedelta(days=2), descricao="Falta")
        Ausencia.objects.create(colaborador=self.colaborador, tipo="atestado", data=today - timedelta(days=3), descricao="Atestado")

        # Colaborador com poucas ausências (total 1)
        colab_pouco = Colaborador.objects.create(
            re="888888",
            nome="Colaborador Pouco",
            loja=self.loja,
            centro_custo="999",
            data_admissao=today - timedelta(days=10),
            status="A",
            termino_1=today + timedelta(days=5),
            termino_2=today + timedelta(days=35),
            cpf="88888888888",
        )
        Ausencia.objects.create(colaborador=colab_pouco, tipo="falta", data=today - timedelta(days=1), descricao="Falta")

        # Colaborador com muitas ausências (total 5)
        colab_muito = Colaborador.objects.create(
            re="777777",
            nome="Colaborador Muito",
            loja=self.loja,
            centro_custo="999",
            data_admissao=today - timedelta(days=10),
            status="A",
            termino_1=today + timedelta(days=5),
            termino_2=today + timedelta(days=35),
            cpf="77777777777",
        )
        Ausencia.objects.create(colaborador=colab_muito, tipo="falta", data=today - timedelta(days=1), descricao="Falta")
        Ausencia.objects.create(colaborador=colab_muito, tipo="falta", data=today - timedelta(days=2), descricao="Falta")
        Ausencia.objects.create(colaborador=colab_muito, tipo="falta", data=today - timedelta(days=3), descricao="Falta")
        Ausencia.objects.create(colaborador=colab_muito, tipo="atestado", data=today - timedelta(days=4), descricao="Atestado")
        Ausencia.objects.create(colaborador=colab_muito, tipo="atestado", data=today - timedelta(days=5), descricao="Atestado")

        # Buscar ordenando por 'ausencias'
        response = self.client.get(self.url, {"ordenar": "ausencias"})
        self.assertEqual(response.status_code, 200)
        
        results = response.data["results"]
        self.assertEqual(len(results), 3)
        
        # A ordem deve ser: Muito (5), self.colaborador (3), Pouco (1)
        self.assertEqual(results[0]["colaborador"]["re"], "777777")
        self.assertEqual(results[1]["colaborador"]["re"], "999999")
        self.assertEqual(results[2]["colaborador"]["re"], "888888")

    def test_congelamento_ausencias_apos_decisao_definitiva(self):
        """
        Garante que faltas/atestados ocorridos após a decisão definitiva de término (termino)
        ou manutenção (manter na etapa 2) não são contabilizados na página de términos.
        """
        from colaboradores.models import Ausencia

        today = date.today()

        # Colaborador 1: Prorrogado no 1º Termino (não definitivo, deve contar tudo)
        colab_prorrogado = Colaborador.objects.create(
            re="111111",
            nome="Colab Prorrogado",
            loja=self.loja,
            centro_custo="999",
            cpf="11111111111",
            data_admissao=today - timedelta(days=10),
            status="A",
            termino_1=today + timedelta(days=5),
            termino_2=today + timedelta(days=35),
        )
        ControleTermino.objects.create(
            colaborador=colab_prorrogado,
            etapa=1,
            acao="prorrogado",
            observacao="Prorrogar",
        )

        # Colaborador 2: Mantido no 2º Termino (definitivo, deve congelar hoje)
        colab_mantido = Colaborador.objects.create(
            re="222222",
            nome="Colab Mantido",
            loja=self.loja,
            centro_custo="999",
            cpf="22222222222",
            data_admissao=today - timedelta(days=10),
            status="A",
            termino_1=today + timedelta(days=5),
            termino_2=today + timedelta(days=35),
        )
        ControleTermino.objects.create(
            colaborador=colab_mantido,
            etapa=1,
            acao="prorrogado",
            observacao="Prorrogar",
        )
        ControleTermino.objects.create(
            colaborador=colab_mantido,
            etapa=2,
            acao="manter",
            observacao="Efetivar",
        )

        # Colaborador 3: Dispensado no 1º Termino (definitivo, deve congelar hoje)
        colab_dispensado = Colaborador.objects.create(
            re="333333",
            nome="Colab Dispensado",
            loja=self.loja,
            centro_custo="999",
            cpf="33333333333",
            data_admissao=today - timedelta(days=10),
            status="A",
            termino_1=today + timedelta(days=5),
            termino_2=today + timedelta(days=35),
        )
        ControleTermino.objects.create(
            colaborador=colab_dispensado,
            etapa=1,
            acao="termino",
            observacao="Dispensar",
        )

        # Criar ausências para todos eles (uma antes da decisão e uma após)
        # Antes da decisão (2 dias atrás)
        Ausencia.objects.create(colaborador=colab_prorrogado, tipo="falta", data=today - timedelta(days=2), descricao="Falta antes")
        Ausencia.objects.create(colaborador=colab_mantido, tipo="falta", data=today - timedelta(days=2), descricao="Falta antes")
        Ausencia.objects.create(colaborador=colab_dispensado, tipo="falta", data=today - timedelta(days=2), descricao="Falta antes")

        # Depois da decisão (2 dias no futuro)
        Ausencia.objects.create(colaborador=colab_prorrogado, tipo="falta", data=today + timedelta(days=2), descricao="Falta depois")
        Ausencia.objects.create(colaborador=colab_mantido, tipo="falta", data=today + timedelta(days=2), descricao="Falta depois")
        Ausencia.objects.create(colaborador=colab_dispensado, tipo="falta", data=today + timedelta(days=2), descricao="Falta depois")

        # Chamar API da listagem de términos
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        results = {item["colaborador"]["re"]: item for item in response.data["results"]}

        # Colab Prorrogado (não definitivo) -> Deve contar 2 faltas (antes e depois)
        self.assertEqual(int(results["111111"]["faltas"]), 2)

        # Colab Mantido (definitivo) -> Deve contar apenas 1 falta (antes)
        self.assertEqual(int(results["222222"]["faltas"]), 1)

        # Colab Dispensado (definitivo) -> Deve contar apenas 1 falta (antes)
        self.assertEqual(int(results["333333"]["faltas"]), 1)


class GeoVictoriaFilterTests(TestCase):
    """
    Por que existe: Garante que ausências anteriores à data de admissão
    do contrato atual de um colaborador sejam ignoradas no resumo de faltas.
    """

    def test_get_timeoff_summary_filters_by_individual_admission(self):
        from unittest.mock import patch
        from colaboradores.services import geovictoria
        
        # Simulamos o retorno da API da GeoVictoria
        mock_payload = [
            # Falta antiga (antes da admissão do colaborador readmitido)
            {
                "UserIdentifier": "99999999999",
                "TimeOffTypeDescription": "FALTA",
                "Starts": "20260710000000",
                "Ends": "20260710000000",
            },
            # Falta nova (depois da admissão do colaborador readmitido)
            {
                "UserIdentifier": "99999999999",
                "TimeOffTypeDescription": "FALTA",
                "Starts": "20260716000000",
                "Ends": "20260716000000",
            },
        ]
        
        with patch("colaboradores.services.geovictoria.get_token", return_value="mock-token"), \
             patch("colaboradores.services.geovictoria._geovictoria_request", return_value=mock_payload):
            
            # Admissão do colaborador é no dia 2026-07-15
            admissoes_dict = {
                "99999999999": date(2026, 7, 15)
            }
            
            res = geovictoria.get_timeoff_summary(
                cpfs="99999999999",
                start_date=date(2026, 7, 1),
                end_date=date(2026, 7, 20),
                admissoes_dict=admissoes_dict
            )
            
            # A falta de '2026-07-10' deve ser ignorada pois é anterior a '2026-07-15'
            # Apenas a falta de '2026-07-16' deve ser contabilizada (1 dia)
            self.assertEqual(res["99999999999"]["faltas"], 1)


class GeoVictoriaAusenciasSyncTests(TestCase):
    """
    Por que existe: Garante que o serviço de sincronização retroativa de ausências
    salva corretamente faltas, atestados e suspensões por dia individual, 
    pulando colaboradores demitidos na gestão e ignorando dias antes da admissão.
    """

    def setUp(self):
        from lojas.models import Loja
        from colaboradores.models import Colaborador
        
        # Cria loja para teste
        self.loja = Loja.objects.create(nome_referencia="Loja Teste", centro_de_custo="CC1", quadro="Quadro Teste")
        
        # Colaborador ativo comum
        self.colab_ativo = Colaborador.objects.create(
            re="R1",
            nome="Colaborador Ativo",
            loja=self.loja,
            centro_custo="CC1",
            data_admissao=date(2026, 1, 1),
            cpf="11111111111",
            status="A",
            status_gestao="ATIVO"
        )
        
        # Colaborador demitido na gestão (deve ser ignorado na sincronização)
        self.colab_demitido = Colaborador.objects.create(
            re="R2",
            nome="Colaborador Demitido",
            loja=self.loja,
            centro_custo="CC1",
            data_admissao=date(2026, 1, 1),
            cpf="22222222222",
            status="A",
            status_gestao="DEMITIDO"
        )

    def test_sincronizar_ausencias_api_saves_correct_types_and_days(self):
        from unittest.mock import patch
        from colaboradores.services.geovictoria_ausencias_sync import sincronizar_ausencias_api
        from colaboradores.models import Ausencia

        # Simula resposta da API GeoVictoria
        mock_payload = [
            # Atestado de 3 dias para Colaborador Ativo (2026-07-10 até 2026-07-12)
            {
                "UserIdentifier": "11111111111",
                "TimeOffTypeDescription": "ATESTADO MEDICO",
                "Starts": "20260710000000",
                "Ends": "20260712000000",
                "Comment": "Atestado de gripe",
            },
            # Falta de 1 dia para Colaborador Ativo (2026-07-15)
            {
                "UserIdentifier": "11111111111",
                "TimeOffTypeDescription": "FALTA INJUSTIFICADA",
                "Starts": "20260715000000",
                "Ends": "20260715000000",
            },
            # Suspensão de 2 dias para Colaborador Ativo (2026-07-20 até 2026-07-21)
            {
                "UserIdentifier": "11111111111",
                "TimeOffTypeDescription": "SUSPENSÃO DISCIPLINAR",
                "Starts": "20260720000000",
                "Ends": "20260721000000",
            },
            # Registro de ausência para Colaborador Demitido (deve ser ignorado porque ele não entra na busca de CPFs)
            {
                "UserIdentifier": "22222222222",
                "TimeOffTypeDescription": "FALTA",
                "Starts": "20260710000000",
                "Ends": "20260710000000",
            }
        ]

        with patch("colaboradores.services.geovictoria_ausencias_sync.get_token", return_value="mock-token"), \
             patch("colaboradores.services.geovictoria_ausencias_sync._geovictoria_request", return_value=mock_payload):

            res = sincronizar_ausencias_api(
                start_date=date(2026, 7, 1),
                end_date=date(2026, 7, 25)
            )

            # Verifica retorno da sincronização
            self.assertEqual(res["total_colaboradores"], 1) # Apenas o ativo entra no mapeamento
            self.assertEqual(res["novas"], 6) # 3 dias atestado + 1 dia falta + 2 dias suspensão = 6 registros

            # Verifica se os registros foram criados no banco
            self.assertTrue(Ausencia.objects.filter(colaborador=self.colab_ativo, tipo="atestado", data=date(2026, 7, 10)).exists())
            self.assertTrue(Ausencia.objects.filter(colaborador=self.colab_ativo, tipo="atestado", data=date(2026, 7, 11)).exists())
            self.assertTrue(Ausencia.objects.filter(colaborador=self.colab_ativo, tipo="atestado", data=date(2026, 7, 12)).exists())
            self.assertTrue(Ausencia.objects.filter(colaborador=self.colab_ativo, tipo="falta", data=date(2026, 7, 15)).exists())
            self.assertTrue(Ausencia.objects.filter(colaborador=self.colab_ativo, tipo="suspensao", data=date(2026, 7, 20)).exists())
            self.assertTrue(Ausencia.objects.filter(colaborador=self.colab_ativo, tipo="suspensao", data=date(2026, 7, 21)).exists())

            # Garante que nenhum registro foi criado para o colaborador demitido
            self.assertFalse(Ausencia.objects.filter(colaborador=self.colab_demitido).exists())


class AusenciaAnalysisAPITests(TestCase):
    """
    Por que existe: Garante a correção matemática e lógica do cálculo de médias,
    limites do Top 30% maiores, filtros e retorno de suspensões da API de análise de ausências.
    """
    def setUp(self):
        from django.contrib.auth.models import Group, User
        from lojas.models import Loja, Coordenador, Supervisor
        from colaboradores.models import Colaborador
        
        # Grupo e usuário autenticado com permissão GestaoOrAdministrador
        self.grupo_gestao = Group.objects.create(name="Gestao")
        self.user = User.objects.create_user(username="testuser", password="password")
        self.user.groups.add(self.grupo_gestao)
        
        # Cria a permissão para visualizar o módulo colaboradores
        from usuarios.models import RolePermission
        RolePermission.objects.create(
            group=self.grupo_gestao,
            module="colaboradores",
            can_view=True
        )
        
        self.client.login(username="testuser", password="password")

        # Coordenadores e Supervisores
        self.coord_a = Coordenador.objects.create(nome="Coord A")
        self.coord_b = Coordenador.objects.create(nome="Coord B")
        self.super_a = Supervisor.objects.create(nome="Super A")

        # Lojas
        self.loja_1 = Loja.objects.create(nome_referencia="Loja 1", centro_de_custo="101", coordenador=self.coord_a, supervisor=self.super_a, uf="SP")
        self.loja_2 = Loja.objects.create(nome_referencia="Loja 2", centro_de_custo="102", coordenador=self.coord_b, uf="RJ")

        # Colaboradores (3 colaboradores em Loja 1, 2 em Loja 2)
        # Ativos
        today = date.today()
        self.colab_1 = Colaborador.objects.create(re="100001", nome="Ana Maria", loja=self.loja_1, cpf="111", status="A", data_admissao=today)
        self.colab_2 = Colaborador.objects.create(re="100002", nome="Bruno Sousa", loja=self.loja_1, cpf="222", status="A", data_admissao=today)
        self.colab_3 = Colaborador.objects.create(re="100003", nome="Carlos Santos", loja=self.loja_1, cpf="333", status="A", data_admissao=today)
        self.colab_4 = Colaborador.objects.create(re="100004", nome="Diana Costa", loja=self.loja_2, cpf="444", status="A", data_admissao=today)
        
        # Demitido (deve ser desconsiderado)
        self.colab_demitido = Colaborador.objects.create(re="100005", nome="Demitido", loja=self.loja_2, cpf="555", status="D", data_admissao=today)

    def test_average_and_top_30_calculation(self):
        from colaboradores.models import Ausencia
        today = date.today()

        # Criar ausências (faltas):
        # colab_1: 4 faltas
        # colab_2: 2 faltas
        # colab_3: 1 falta
        # colab_4: 0 faltas
        # Total ativos = 4 (colab_1, colab_2, colab_3, colab_4)
        # Total faltas = 7
        # Média = 7 / 4 = 1.75
        # Colaboradores ativos com >= 1 falta: 3 (colab_1, colab_2, colab_3)
        # Contagem ordenada: [1, 2, 4]
        # Percentil 70 (30% maiores): len = 3, idx = int(3 * 0.70) = 2.
        # counts[2] = 4 (limite_top_30)
        # Acima da média (> 1.75): colab_1 (4), colab_2 (2)
        # Top 30% (>= 4): colab_1 (4)

        for i in range(4):
            Ausencia.objects.create(colaborador=self.colab_1, tipo="falta", data=today - timedelta(days=i), descricao=f"Falta {i}")
        for i in range(2):
            Ausencia.objects.create(colaborador=self.colab_2, tipo="falta", data=today - timedelta(days=i), descricao=f"Falta {i}")
        Ausencia.objects.create(colaborador=self.colab_3, tipo="falta", data=today, descricao="Falta 0")

        url = "/colaboradores/ausencias/analise/?aba=faltas"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        stats = response.data["stats"]
        self.assertEqual(stats["total_colaboradores_ativos"], 4)
        self.assertEqual(stats["total_ausencias"], 7)
        self.assertEqual(stats["media_geral"], 2.33)
        self.assertEqual(stats["colaboradores_acima_media"], 1)  # Apenas Ana (4) é > 2.33
        self.assertEqual(stats["colaboradores_top_30"], 1)  # Apenas Ana (4)

        # Verificar resultados individuais
        results = {item["re"]: item for item in response.data["results"]}
        # Ana Maria (4 faltas) -> acima_da_media=True, top_30_percent=True
        self.assertTrue(results["100001"]["acima_da_media"])
        self.assertTrue(results["100001"]["top_30_percent"])
        self.assertEqual(results["100001"]["coordenador_nome"], "Coord A")
        self.assertEqual(results["100001"]["supervisor_nome"], "Super A")

        # Bruno Sousa (2 faltas) -> acima_da_media=False, top_30_percent=False
        self.assertFalse(results["100002"]["acima_da_media"])
        self.assertFalse(results["100002"]["top_30_percent"])

        # Carlos Santos (1 falta) -> acima_da_media=False, top_30_percent=False
        self.assertFalse(results["100003"]["acima_da_media"])
        self.assertFalse(results["100003"]["top_30_percent"])

    def test_filter_by_loja_coordenador_regiao_and_search(self):
        from colaboradores.models import Ausencia
        today = date.today()

        Ausencia.objects.create(colaborador=self.colab_1, tipo="falta", data=today, descricao="Falta")
        Ausencia.objects.create(colaborador=self.colab_4, tipo="falta", data=today, descricao="Falta")

        # Filtro por loja_id da Loja 1
        url = f"/colaboradores/ausencias/analise/?aba=faltas&loja={self.loja_1.id}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["stats"]["total_colaboradores_ativos"], 3) # colab 1, 2, 3

        # Filtro por coordenador Coord B
        url = "/colaboradores/ausencias/analise/?aba=faltas&coordenador=Coord B"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["stats"]["total_colaboradores_ativos"], 1) # colab 4

        # Filtro por região SP
        url = "/colaboradores/ausencias/analise/?aba=faltas&regiao=SP"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["stats"]["total_colaboradores_ativos"], 3)

        # Filtro por busca de nome
        url = "/colaboradores/ausencias/analise/?aba=faltas&search=maria"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["stats"]["total_colaboradores_ativos"], 1)
        self.assertEqual(response.data["results"][0]["re"], "100001")

    def test_suspensions_list_api(self):
        from colaboradores.models import Ausencia
        today = date.today()

        Ausencia.objects.create(colaborador=self.colab_1, tipo="suspensao", data=today, descricao="Atraso Grave")
        Ausencia.objects.create(colaborador=self.colab_4, tipo="suspensao", data=today, descricao="Indisciplina")

        url = "/colaboradores/ausencias/analise/?aba=suspensoes"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        
        self.assertEqual(len(response.data["results"]), 2)
        stats = response.data["stats"]
        self.assertEqual(stats["total_ausencias"], 2)
        self.assertEqual(stats["colaboradores_suspensos"], 2)
        
        first = response.data["results"][0]
        self.assertEqual(first["quantidade"], 1)
        self.assertEqual(first["detalhes"][0]["descricao"], "Atraso Grave")

    def test_exportar_ausencias_excel(self):
        from colaboradores.models import Ausencia
        today = date.today()
        Ausencia.objects.create(colaborador=self.colab_1, tipo="falta", data=today, descricao="Falta 0")

        url = "/colaboradores/ausencias/analise/exportar/?aba=faltas&filtro_tabela=todos"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertTrue(len(response.content) > 0)

        # Valida que as colunas e dados no Excel contêm Coordenador e Supervisor à direita de Loja
        df = pd.read_excel(BytesIO(response.content))
        expected_cols = [
            "RE", "Nome", "Dt. Admissão", "Loja", "Coordenador", "Supervisor",
            "Status Gestão", "Faltas", "Atestados", "Faltas + Atestados", "Suspensões"
        ]
        self.assertEqual(list(df.columns), expected_cols)
        self.assertEqual(df.iloc[0]["Coordenador"], "Coord A")
        self.assertEqual(df.iloc[0]["Supervisor"], "Super A")

    def test_soma_tab_logic(self):
        """
        Por que este teste existe:
        Garante a correção da nova lógica na aba 'soma' (Faltas + Atestados).
        Ela deve retornar colaboradores que possuem faltas OR atestados, excluindo 
        os colaboradores que estejam no Top 30% individual de Faltas ou Atestados.
        Em seguida, os cálculos estatísticos (média geral, acima da média e top 30%) 
        devem ser realizados apenas em cima do subgrupo restante de colaboradores.
        """
        from colaboradores.models import Ausencia
        today = date.today()

        # Faltas:
        # colab_1: 4 faltas (Top 30% de faltas)
        # colab_2: 1 falta
        for i in range(4):
            Ausencia.objects.create(colaborador=self.colab_1, tipo="falta", data=today - timedelta(days=i), descricao="Falta A")
        Ausencia.objects.create(colaborador=self.colab_2, tipo="falta", data=today, descricao="Falta B")

        # Atestados:
        # colab_1: 1 atestado
        # colab_3: 4 atestados (Top 30% de atestados)
        # colab_4: 1 atestado
        Ausencia.objects.create(colaborador=self.colab_1, tipo="atestado", data=today - timedelta(days=4), descricao="Atestado A")
        for i in range(4):
            Ausencia.objects.create(colaborador=self.colab_3, tipo="atestado", data=today - timedelta(days=i), descricao="Atestado B")
        Ausencia.objects.create(colaborador=self.colab_4, tipo="atestado", data=today, descricao="Atestado C")

        # Requisição para a aba soma
        url = "/colaboradores/ausencias/analise/?aba=soma"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        # Devem ser listados apenas colab_2 e colab_4 (colab_1 e colab_3 foram excluídos pelo Top 30% individual)
        results = response.data["results"]
        self.assertEqual(len(results), 2)
        
        re_list = [r["re"] for r in results]
        self.assertIn("100002", re_list)  # colab_2
        self.assertIn("100004", re_list)  # colab_4
        self.assertNotIn("100001", re_list) # colab_1 excluído
        self.assertNotIn("100003", re_list) # colab_3 excluído

        # Stats de soma devem ser calculados com base no grupo restante (colab_2 e colab_4)
        # colab_2: 1 falta + 0 atestado = 1 soma
        # colab_4: 0 faltas + 1 atestado = 1 soma
        # total_ausencias = 1 + 1 = 2
        # media_geral = 2 / 2 = 1.0
        stats = response.data["stats"]
        self.assertEqual(stats["total_ausencias"], 2)
        self.assertEqual(stats["media_geral"], 1.0)
        self.assertEqual(stats["colaboradores_acima_media"], 0)
        self.assertEqual(stats["colaboradores_top_30"], 0)


