from decimal import Decimal
from rest_framework import serializers
from .models import (
    Loja,
    Cargo,
    ConfiguracaoInsalubridadeLoja,
    EscopoMensal,
    ItemEscopoMensal,
    escala_insalubridade_fixa_para_escopo,
    montar_caches_salario_para_itens,
    Coordenador,
    Supervisor,
    Diaria,
    Premio,
    Salario,
)

class CoordenadorSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para formatar as informações de coordenadores de loja,
    convertendo o ID em string para o frontend.
    """
    class Meta:
        model = Coordenador
        fields = "__all__"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        if "orcamento_diarias" in data and data["orcamento_diarias"] is not None:
            data["orcamento_diarias"] = str(data["orcamento_diarias"])
        if "orcamento_premios" in data and data["orcamento_premios"] is not None:
            data["orcamento_premios"] = str(data["orcamento_premios"])
        return data

class SupervisorSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para formatar as informações de supervisores de loja,
    convertendo o ID em string para o frontend.
    """
    coordenador_nome = serializers.CharField(source="coordenador.nome", read_only=True)

    class Meta:
        model = Supervisor
        fields = "__all__"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        if "coordenador" in data and data["coordenador"] is not None:
            data["coordenador"] = str(data["coordenador"])
        return data

class LojaSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para mapear o modelo Loja em uma representação JSON.
    Garante de forma estrita que o ID da loja e o código da loja sejam retornados como strings,
    além de manter o formato de texto para o centro de custo de acordo com as regras de segurança do projeto.
    """
    supervisor_nome = serializers.CharField(source="supervisor.nome", read_only=True)
    coordenador_nome = serializers.CharField(source="coordenador.nome", read_only=True)

    class Meta:
        model = Loja
        fields = "__all__"

    def to_representation(self, instance):
        """
        Garante a conversão de IDs, códigos numéricos de lojas e centros de custo em strings,
        prevenindo erros de interpretação do tipo int no Javascript do frontend.
        """
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        if "codigo_loja" in data and data["codigo_loja"] is not None:
            data["codigo_loja"] = str(data["codigo_loja"])
        if "centro_de_custo" in data and data["centro_de_custo"] is not None:
            data["centro_de_custo"] = str(data["centro_de_custo"])
        if "coordenador" in data and data["coordenador"] is not None:
            data["coordenador"] = str(data["coordenador"])
        if "supervisor" in data and data["supervisor"] is not None:
            data["supervisor"] = str(data["supervisor"])
        return data

class ConfiguracaoInsalubridadeLojaSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para gerenciar e validar as configurações de insalubridade de uma loja específica,
    incluindo percentuais de insalubridade fixa, banheirista e modos de rateio de pessoal.
    """
    class Meta:
        model = ConfiguracaoInsalubridadeLoja
        fields = "__all__"

    def to_representation(self, instance):
        """
        Garante a tipagem de IDs de controle e relacionamento como strings no payload de resposta.
        """
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        if "loja" in data and data["loja"] is not None:
            data["loja"] = str(data["loja"])
        return data

class CargoSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para formatar as informações de cargos e funções disponíveis para
    listagem e preenchimento de campos de seleção no frontend.
    """
    class Meta:
        model = Cargo
        fields = "__all__"

    def to_representation(self, instance):
        """
        Converte o identificador único do cargo em string.
        """
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        return data

class ItemEscopoMensalSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para formatar as linhas individuais de um escopo mensal (cargos, turno e quantidade),
    calculando e injetando as estimativas de custo unitárias e totais calculadas com base nas tabelas de salários e
    regra de adicional noturno/insalubridade.
    """
    cargo_nome = serializers.CharField(source="cargo.nome", read_only=True)
    turno_display = serializers.CharField(source="get_turno_display", read_only=True)
    detalhamento = serializers.SerializerMethodField()

    class Meta:
        model = ItemEscopoMensal
        fields = [
            "id",
            "escopo_mensal",
            "cargo",
            "cargo_nome",
            "turno",
            "turno_display",
            "quantidade",
            "detalhamento",
        ]

    def get_detalhamento(self, obj):
        """
        Calcula as estimativas detalhadas de salário base, adicionais e totalização para o item,
        usando caches passados no contexto da serialização para otimizar o tempo de resposta das consultas.
        """
        cache_reg = self.context.get("cache_salarios_regional")
        cache_min = self.context.get("cache_salario_minimo_br_por_ano")
        escala_fixa = self.context.get("escala_insalubridade_fixa", Decimal("1"))

        det = obj.get_estimativa_detalhada(
            cache_salarios_regional=cache_reg,
            cache_salario_minimo_br_por_ano=cache_min,
            escala_insalubridade_fixa=escala_fixa,
        )
        if det:
            # Convertemos todos os valores numéricos decimais em strings limpas para evitar problemas com floats no frontend.
            return {key: str(value) for key, value in det.items()}
        return None

    def to_representation(self, instance):
        """
        Garante a formatação dos IDs de controle como strings.
        """
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        if "escopo_mensal" in data and data["escopo_mensal"] is not None:
            data["escopo_mensal"] = str(data["escopo_mensal"])
        if "cargo" in data and data["cargo"] is not None:
            data["cargo"] = str(data["cargo"])
        return data

class EscopoMensalSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para unificar as informações do cabeçalho de um escopo mensal
    de uma loja (loja, ano, mês) com o detalhamento consolidado de todos os seus itens e
    o custo financeiro totalizado estimado.
    """
    loja_nome = serializers.CharField(source="loja.nome_referencia", read_only=True)
    itens_com_estimativa = serializers.SerializerMethodField()
    total_estimativa_escopo = serializers.SerializerMethodField()

    class Meta:
        model = EscopoMensal
        fields = [
            "id",
            "loja",
            "loja_nome",
            "ano",
            "mes",
            "itens_com_estimativa",
            "total_estimativa_escopo",
        ]

    def get_itens_com_estimativa(self, obj):
        """
        Busca e serializa todos os itens pertencentes ao escopo mensal, passando
        a escala de insalubridade e as tabelas salariais pré-carregadas para evitar queries N+1.
        """
        itens = obj.itens.all()
        # Busca cache no contexto global se presente. Caso contrário, monta localmente.
        cache_reg = self.context.get("cache_salarios_regional")
        cache_min = self.context.get("cache_salario_minimo_br_por_ano")
        
        if cache_reg is None or cache_min is None:
            cache_reg, cache_min = montar_caches_salario_para_itens(itens)
            
        escala_fixa = escala_insalubridade_fixa_para_escopo(obj)
        
        serializer = ItemEscopoMensalSerializer(
            itens,
            many=True,
            context={
                "cache_salarios_regional": cache_reg,
                "cache_salario_minimo_br_por_ano": cache_min,
                "escala_insalubridade_fixa": escala_fixa,
            },
        )
        return serializer.data

    def get_total_estimativa_escopo(self, obj):
        """
        Calcula o total da estimativa financeira acumulada para este escopo.
        """
        itens = obj.itens.all()
        cache_reg = self.context.get("cache_salarios_regional")
        cache_min = self.context.get("cache_salario_minimo_br_por_ano")
        
        if cache_reg is None or cache_min is None:
            cache_reg, cache_min = montar_caches_salario_para_itens(itens)
            
        escala_fixa = escala_insalubridade_fixa_para_escopo(obj)
        total_acumulado = Decimal("0")
        
        for item in itens:
            det = item.get_estimativa_detalhada(
                cache_salarios_regional=cache_reg,
                cache_salario_minimo_br_por_ano=cache_min,
                escala_insalubridade_fixa=escala_fixa,
            )
            if det:
                total_acumulado += det["total"]
                
        return str(total_acumulado)

    def to_representation(self, instance):
        """
        Garante a representação de ID e loja de forma textual.
        """
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        if "loja" in data and data["loja"] is not None:
            data["loja"] = str(data["loja"])
        return data


class DiariaSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para mapear o modelo de Diaria operacionais em payloads JSON,
    preservando chaves primárias e valores numéricos como string de acordo com as regras de design.
    """
    loja_nome = serializers.CharField(source="loja.nome_referencia", read_only=True)
    coordenador_nome = serializers.SerializerMethodField()

    class Meta:
        model = Diaria
        fields = "__all__"

    def get_coordenador_nome(self, obj):
        """Retorna o nome do coordenador da loja vinculada, se houver."""
        if obj.loja and obj.loja.coordenador:
            return obj.loja.coordenador.nome
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Preserva ID e valor como strings
        if "id_diaria" in data and data["id_diaria"] is not None:
            data["id_diaria"] = str(data["id_diaria"])
        if "loja" in data and data["loja"] is not None:
            data["loja"] = str(data["loja"])
        if "valor" in data and data["valor"] is not None:
            data["valor"] = str(data["valor"])
        return data


class PremioSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para mapear o modelo de Premio em payloads JSON,
    convertendo chaves primárias e valores numéricos como strings para conformidade do frontend.
    """
    loja_nome = serializers.CharField(source="loja.nome_referencia", read_only=True)
    coordenador_nome = serializers.CharField(source="coordenador.nome", read_only=True)
    supervisor_nome = serializers.CharField(source="supervisor.nome", read_only=True)

    class Meta:
        model = Premio
        fields = "__all__"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        if "loja" in data and data["loja"] is not None:
            data["loja"] = str(data["loja"])
        if "coordenador" in data and data["coordenador"] is not None:
            data["coordenador"] = str(data["coordenador"])
        if "supervisor" in data and data["supervisor"] is not None:
            data["supervisor"] = str(data["supervisor"])
        if "reward_value" in data and data["reward_value"] is not None:
            data["reward_value"] = str(data["reward_value"])
        return data


class SalarioSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para formatar as informações de salários de cargos operacionais,
    fornecendo o nome do cargo por extenso e preservando chaves numéricas e valores como strings.
    """
    cargo_nome = serializers.CharField(source="cargo.nome", read_only=True)

    class Meta:
        model = Salario
        fields = ["id", "cargo", "cargo_nome", "uf", "ano", "valor"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        if "cargo" in data and data["cargo"] is not None:
            data["cargo"] = str(data["cargo"])
        if "valor" in data and data["valor"] is not None:
            data["valor"] = str(data["valor"])
        return data




