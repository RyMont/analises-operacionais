from django.core.management.base import BaseCommand
from lojas.models import LinhaFolha
from lojas.services.folha_importacao import recalcular_resumos_folha


class Command(BaseCommand):
    help = "Recalcula os resumos consolidados da folha mensal (ResumoFolhaMensal) para todas as lojas e competências."

    def handle(self, *args, **options):
        self.stdout.write("Buscando combinações únicas de (loja_id, dt_arq) na tabela LinhaFolha...")
        lojas_e_datas = list(
            LinhaFolha.objects.filter(loja_id__isnull=False)
            .order_by()
            .values_list("loja_id", "dt_arq")
            .distinct()
        )
        total = len(lojas_e_datas)
        self.stdout.write(f"Encontrados {total} pares de loja/competência para recalcular...")
        
        if lojas_e_datas:
            batch_size = 500
            for i in range(0, total, batch_size):
                lote = lojas_e_datas[i:i + batch_size]
                recalcular_resumos_folha(lote)
                self.stdout.write(f"Processados {min(i + batch_size, total)} de {total}...")

        self.stdout.write(self.style.SUCCESS("Recálculo de resumos de folha concluído com sucesso!"))
