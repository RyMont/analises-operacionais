from django.contrib.auth.models import User, Group
from rest_framework import serializers
from .constants import ADMINISTRADOR_ROLE, GESTAO_ROLE, APRENDIZ_ROLE
from .models import RolePermission

class RolePermissionSerializer(serializers.ModelSerializer):
    """
    Este serializer serve para formatar as permissões de cada módulo em formato JSON
    para que o frontend consiga listá-las e editá-las na matriz de permissões.
    """
    class Meta:
        model = RolePermission
        fields = ["id", "module", "can_view", "can_create", "can_edit", "can_delete"]

class UsuarioSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para transformar o modelo User do Django em representações JSON
    limpas e estruturadas, garantindo que o frontend React receba todos os dados prontos,
    inclusive papéis de acesso calculados de forma transparente.
    """
    role = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "is_active", "permissions"]

    def get_role(self, obj):
        """
        Calcula o papel do usuário para exibição no frontend.
        """
        if obj.is_superuser:
            return "Administrador"
        group = obj.groups.first()
        if group:
            return group.name
        return "Sem role"

    def get_permissions(self, obj):
        """
        Retorna as permissões do usuário agrupadas por módulo de forma dinâmica,
        lendo a tabela RolePermission baseada na role (grupo) atual do usuário.
        """
        permissions_dict = {}
        
        # Superusuário (admin raiz) sempre tem permissão completa para tudo
        if obj.is_superuser:
            modulos = [
                "dashboard", "lojas", "apoio", "colaboradores", "turnover",
                "escopos", "comparativo", "headcount", "diarias", "premios",
                "importacoes", "usuarios", "salarios", "testes_promocao",
                "ausencias"
            ]
            for modulo in modulos:
                permissions_dict[modulo] = {
                    "view": True,
                    "create": True,
                    "edit": True,
                    "delete": True
                }
            return permissions_dict

        group = obj.groups.first()
        if group:
            from django.db import DatabaseError
            try:
                perms = RolePermission.objects.filter(group=group)
                for perm in perms:
                    permissions_dict[perm.module] = {
                        "view": perm.can_view,
                        "create": perm.can_create,
                        "edit": perm.can_edit,
                        "delete": perm.can_delete
                    }
            except DatabaseError:
                # Se a tabela não existir, retorna um dicionário de permissões vazio e evita erro 500
                pass
        return permissions_dict

    def to_representation(self, instance):
        """
        Modifica a representação final do JSON para garantir que o ID do usuário
        seja retornado estritamente como string, seguindo as diretrizes de integridade
        e segurança de dados para evitar problemas de arredondamento ou tipagem no frontend.
        """
        data = super().to_representation(instance)
        if "id" in data and data["id"] is not None:
            data["id"] = str(data["id"])
        return data

class UsuarioCreateSerializer(serializers.ModelSerializer):
    """
    Este serializer existe para validar e persistir a criação de novos usuários administradores ou gestores via API.
    Ele garante que a senha seja salva de forma segura (hasheada) e que o usuário seja criado com as
    permissões e grupos corretos para o respectivo papel de acesso ao sistema.
    """
    role = serializers.CharField(
        default="Administrador",
        required=False
    )
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "first_name", "last_name", "email", "password", "role"]

    def validate_password(self, value):
        """
        Valida a força da senha de acordo com as políticas configuradas no Django.
        
        Por que existe: Garante que senhas cadastradas para novos usuários sigam as regras 
        de complexidade e tamanho mínimo estipuladas no settings.py, evitando contas inseguras.
        """
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def create(self, validated_data):
        """
        Sobrescreve o método de criação padrão para aplicar a lógica de hashing de senha do Django,
        configurar os flags de superusuário e vincular o usuário ao grupo correto.
        """
        role = validated_data.pop("role", "Administrador")
        password = validated_data.pop("password")
        
        user = User(**validated_data)
        user.set_password(password)
        user.is_active = True
        
        if role.lower() == "administrador":
            user.is_staff = True
            user.is_superuser = True
        else:
            user.is_staff = False
            user.is_superuser = False
            
        user.save()
        
        group, _ = Group.objects.get_or_create(
            name=role,
        )
        user.groups.add(group)
        return user
