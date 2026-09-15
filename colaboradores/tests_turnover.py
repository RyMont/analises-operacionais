from datetime import date
from io import BytesIO
import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from colaboradores.models import Colaborador
from lojas.models import Loja, Coordenador, Supervisor


class TurnoverExportTests(TestCase):
    """
    Testes para a exportação em Excel (.xlsx) de Turnover (desligamentos).
    """

    def setUp(self):
        self.user = User.objects.create_superuser(username="admin_turnover", password="password123")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.coord = Coordenador.objects.create(nome="FERNANDO COORD")
        self.superv = Supervisor.objects.create(nome="ALICE SUPER")

        self.loja = Loja.objects.create(
            nome_referencia="LOJA CENTRAL SP",
            centro_de_custo="0101",
            quadro="10",
            uf="SP",
            status="ATIVA",
            coordenador=self.coord,
            supervisor=self.superv,
        )

        # Colaborador demitido
        self.colab_demitido = Colaborador.objects.create(
            re="10001",
            nome="CARLOS DEMITIDO",
            cargo="OPERADOR DE CAIXA",
            loja_gestao=self.loja,
            centro_custo="0101",
            status="D",
            data_admissao=date(2025, 1, 1),
            data_demissao=date(2026, 6, 15),
            motivo_demissao="PEDIDO DE DEMISSAO",
            salario_rescisao=1800.00,
            valor_rescisao_estimado=2500.00,
        )

        # Colaborador ativo (não deve sair no relatório de demissões)
        self.colab_ativo = Colaborador.objects.create(
            re="10002",
            nome="ANA ATIVA",
            cargo="LIDER",
            loja_gestao=self.loja,
            centro_custo="0101",
            status="A",
            data_admissao=date(2026, 1, 10),
        )

    def test_turnover_exportar_excel(self):
        """Testa se a rota /colaboradores/turnover/exportar/ retorna uma planilha válida com os demitidos."""
        response = self.client.get("/colaboradores/turnover/exportar/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("attachment; filename=", response["Content-Disposition"])

        excel_data = BytesIO(response.content)
        df = pd.read_excel(excel_data, sheet_name="Desligamentos")

        expected_columns = [
            "RE",
            "Colaborador",
            "Cargo",
            "Loja",
            "Centro de Custo",
            "Coordenador",
            "Supervisor",
            "Data Demissão",
            "Motivo Demissão",
            "Salário Base (R$)",
            "Custo Rescisão (R$)",
        ]
        self.assertEqual(list(df.columns), expected_columns)
        self.assertEqual(len(df), 1)

        row = df.iloc[0]
        self.assertEqual(str(row["RE"]), "10001")
        self.assertEqual(row["Colaborador"], "CARLOS DEMITIDO")
        self.assertEqual(row["Loja"], "LOJA CENTRAL SP")
        self.assertEqual(row["Coordenador"], "FERNANDO COORD")
        self.assertEqual(row["Supervisor"], "ALICE SUPER")
        self.assertEqual(row["Motivo Demissão"], "PEDIDO DE DEMISSAO")
        self.assertEqual(float(row["Salário Base (R$)"]), 1800.00)
        self.assertEqual(float(row["Custo Rescisão (R$)"]), 2500.00)

    def test_turnover_exportar_excel_com_filtros(self):
        """Testa se os filtros são respeitados na exportação de turnover."""
        response = self.client.get("/colaboradores/turnover/exportar/", {"motivo": "OUTRO MOTIVO"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        excel_data = BytesIO(response.content)
        df = pd.read_excel(excel_data, sheet_name="Desligamentos")
        self.assertEqual(len(df), 0)


class ColaboradorExportTests(TestCase):
    """
    Testes para a exportação em Excel (.xlsx) da Base de Colaboradores e inclusão de liderança.
    """

    def setUp(self):
        self.user = User.objects.create_superuser(username="admin_colab", password="password123")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.coord = Coordenador.objects.create(nome="ROBERTA COORD")
        self.superv = Supervisor.objects.create(nome="MARCOS SUPER")

        self.loja = Loja.objects.create(
            nome_referencia="LOJA MODELO",
            centro_de_custo="0202",
            quadro="15",
            uf="RJ",
            status="ATIVA",
            coordenador=self.coord,
            supervisor=self.superv,
        )

        self.colab_ativo = Colaborador.objects.create(
            re="20001",
            nome="JULIA SILVA",
            cargo="ATENDENTE",
            loja=self.loja,
            centro_custo="0202",
            status="ATIVO",
            data_admissao=date(2024, 3, 1),
            cpf="111.222.333-44",
        )

        self.colab_demitido = Colaborador.objects.create(
            re="20002",
            nome="PEDRO DEMITIDO",
            cargo="ESTOQUISTA",
            loja=self.loja,
            centro_custo="0202",
            status="D",
            data_admissao=date(2023, 1, 1),
            data_demissao=date(2024, 5, 10),
            motivo_demissao="PEDIDO DE DEMISSAO",
            cpf="555.666.777-88",
        )

    def test_api_list_inclui_coordenador_e_supervisor(self):
        """Verifica se os campos coordenador e supervisor estão presentes no serializer da API."""
        response = self.client.get("/colaboradores/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        self.assertTrue(len(results) >= 1)
        colab_data = results[0]
        self.assertIn("coordenador", colab_data)
        self.assertIn("supervisor", colab_data)
        self.assertEqual(colab_data["coordenador"], "ROBERTA COORD")
        self.assertEqual(colab_data["supervisor"], "MARCOS SUPER")

    def test_exportar_colaboradores_ativos_excel(self):
        """Testa o endpoint /colaboradores/exportar/?tipo=ativos."""
        response = self.client.get("/colaboradores/exportar/?tipo=ativos")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        excel_data = BytesIO(response.content)
        df = pd.read_excel(excel_data, sheet_name="Colaboradores Ativos")
        self.assertIn("Coordenador", df.columns)
        self.assertIn("Supervisor", df.columns)
        self.assertIn("Matrícula (RE)", df.columns)
        self.assertIn("Colaborador", df.columns)

        row = df[df["Matrícula (RE)"].astype(str) == "20001"].iloc[0]
        self.assertEqual(row["Colaborador"], "JULIA SILVA")
        self.assertEqual(row["Coordenador"], "ROBERTA COORD")
        self.assertEqual(row["Supervisor"], "MARCOS SUPER")

    def test_exportar_colaboradores_demitidos_excel(self):
        """Testa o endpoint /colaboradores/exportar/?tipo=demitidos."""
        response = self.client.get("/colaboradores/exportar/?tipo=demitidos")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        excel_data = BytesIO(response.content)
        df = pd.read_excel(excel_data, sheet_name="Colaboradores Demitidos")
        self.assertIn("Coordenador", df.columns)
        self.assertIn("Supervisor", df.columns)
        self.assertIn("Data Demissão", df.columns)

        row = df[df["Matrícula (RE)"].astype(str) == "20002"].iloc[0]
        self.assertEqual(row["Colaborador"], "PEDRO DEMITIDO")
        self.assertEqual(row["Coordenador"], "ROBERTA COORD")
        self.assertEqual(row["Supervisor"], "MARCOS SUPER")


