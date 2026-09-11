from datetime import date
from io import BytesIO
import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from lojas.models import Loja, Coordenador, Supervisor, Diaria
from lojas.serializers import DiariaSerializer


class DiariasViewsTests(TestCase):
    """
    Testes para as funcionalidades da página de Diárias Operacionais:
    - Serialização do campo coordenador_nome.
    - Listagem de diárias via API.
    - Exportação completa para Excel (.xlsx) com a coluna Coordenador.
    """

    def setUp(self):
        self.user = User.objects.create_superuser(username="admin_test", password="password123")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.coordenador_sp = Coordenador.objects.create(nome="CARLOS SILVA", orcamento_diarias=5000.0)
        self.coordenador_rj = Coordenador.objects.create(nome="MARIANA SOUZA", orcamento_diarias=3000.0)

        self.supervisor_sp = Supervisor.objects.create(nome="ROBERTO ALVES")

        self.loja_sp = Loja.objects.create(
            nome_referencia="LOJA 01 SP",
            centro_de_custo="1001",
            quadro="OPERACIONAL",
            uf="SP",
            status="ATIVA",
            coordenador=self.coordenador_sp,
            supervisor=self.supervisor_sp,
        )

        self.loja_rj = Loja.objects.create(
            nome_referencia="LOJA 02 RJ",
            centro_de_custo="1002",
            quadro="OPERACIONAL",
            uf="RJ",
            status="ATIVA",
            coordenador=self.coordenador_rj,
        )

        self.loja_sem_coord = Loja.objects.create(
            nome_referencia="LOJA 03 MG",
            centro_de_custo="1003",
            quadro="OPERACIONAL",
            uf="MG",
            status="ATIVA",
        )

        self.diaria_1 = Diaria.objects.create(
            id_diaria="D-1001",
            diarista="JOAO SILVA",
            local="LOJA 01 SP",
            loja=self.loja_sp,
            data_servico=date(2026, 5, 10),
            turno="DIURNO",
            motivo="COBERTURA FALTA",
            solicitante="GERENTE 01",
            valor=150.00,
            status="Pago",
            ultima_atualizacao=date(2026, 5, 11),
            justificativa="Falta inesperada",
            order_type="SISTEMA",
        )

        self.diaria_2 = Diaria.objects.create(
            id_diaria="D-1002",
            diarista="MARIA OLIVEIRA",
            local="LOJA 02 RJ",
            loja=self.loja_rj,
            data_servico=date(2026, 5, 12),
            turno="NOTURNO",
            motivo="REFORCO EVENTO",
            solicitante="GERENTE 02",
            valor=200.00,
            status="Pendente",
            ultima_atualizacao=date(2026, 5, 12),
            justificativa="Aumento de demanda",
            order_type="MANUAL",
        )

        self.diaria_sem_coord = Diaria.objects.create(
            id_diaria="D-1003",
            diarista="PEDRO SANTOS",
            local="LOJA 03 MG",
            loja=self.loja_sem_coord,
            data_servico=date(2026, 5, 15),
            turno="DIURNO",
            motivo="TREINAMENTO",
            solicitante="GERENTE 03",
            valor=120.00,
            status="Pago",
            ultima_atualizacao=date(2026, 5, 15),
            order_type="SISTEMA",
        )

    def test_diaria_serializer_coordenador_nome(self):
        """Verifica se o serializer inclui corretamente o campo coordenador_nome."""
        serializer_1 = DiariaSerializer(self.diaria_1)
        self.assertEqual(serializer_1.data.get("coordenador_nome"), "CARLOS SILVA")
        self.assertEqual(serializer_1.data.get("loja_nome"), "LOJA 01 SP")

        serializer_sem_coord = DiariaSerializer(self.diaria_sem_coord)
        self.assertIsNone(serializer_sem_coord.data.get("coordenador_nome"))

    def test_diarias_list_api_retorna_coordenador(self):
        """Testa se a API de listagem de diárias retorna a coluna coordenador_nome nos resultados."""
        response = self.client.get("/diarias/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        resultados = response.data.get("results", {}).get("resultados", [])
        self.assertTrue(len(resultados) >= 3)
        item_1 = next((r for r in resultados if r["id_diaria"] == "D-1001"), None)
        self.assertIsNotNone(item_1)
        self.assertEqual(item_1.get("coordenador_nome"), "CARLOS SILVA")

    def test_diarias_exportar_excel(self):
        """Testa se a rota de exportação para Excel gera planilha válida com a coluna Coordenador."""
        response = self.client.get("/diarias/exportar/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("attachment; filename=", response["Content-Disposition"])

        excel_data = BytesIO(response.content)
        df = pd.read_excel(excel_data, sheet_name="Diárias")

        expected_columns = [
            "ID Diária",
            "Diarista",
            "Loja",
            "Coordenador",
            "Data do Serviço",
            "Turno",
            "Motivo",
            "Solicitante",
            "Origem",
            "Valor (R$)",
            "Status",
            "Justificativa",
        ]
        self.assertEqual(list(df.columns), expected_columns)
        self.assertEqual(len(df), 3)

        # Checa conteúdo das linhas
        df_sp = df[df["ID Diária"] == "D-1001"].iloc[0]
        self.assertEqual(df_sp["Coordenador"], "CARLOS SILVA")
        self.assertEqual(df_sp["Diarista"], "JOAO SILVA")
        self.assertEqual(df_sp["Loja"], "LOJA 01 SP")

        df_sem = df[df["ID Diária"] == "D-1003"].iloc[0]
        self.assertEqual(df_sem["Coordenador"], "-")

    def test_diarias_exportar_excel_com_filtros(self):
        """Testa a exportação filtrando por coordenador."""
        response = self.client.get("/diarias/exportar/", {"coordenador": "MARIANA SOUZA"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        excel_data = BytesIO(response.content)
        df = pd.read_excel(excel_data, sheet_name="Diárias")
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["ID Diária"], "D-1002")
        self.assertEqual(df.iloc[0]["Coordenador"], "MARIANA SOUZA")
