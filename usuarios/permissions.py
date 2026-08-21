from rest_framework.permissions import BasePermission
from django.db import DatabaseError
from .constants import ADMINISTRADOR_ROLE, GESTAO_ROLE

def obter_modulo_por_view(view_name, path):
    """
    Identifica qual módulo do sistema está sendo acessado com base na URL (path).
    
    Docstring explicativa em português:
    Esta função auxiliar analisa o caminho (URL) da requisição HTTP recebida e determina
    a qual módulo lógico do sistema ela pertence. Esse mapeamento permite que a validação 
    de permissões ocorra de forma genérica e automatizada sem precisar alterar as views.
    """
    path_lower = path.lower()
    
    if "testes" in path_lower:
        return "testes_promocao"
    elif "usuarios" in path_lower:
        return "usuarios"
    elif "comparativo" in path_lower or "relatorio" in path_lower:
        return "comparativo"
    elif "premios" in path_lower:
        return "premios"
    elif "diarias" in path_lower:
        return "diarias"
    elif "turnover" in path_lower:
        return "turnover"
    elif "escopos" in path_lower:
        return "escopos"
    elif "presencas" in path_lower:
        return "headcount"
    elif "colaboradores" in path_lower:
        return "colaboradores"
    elif "headcount" in path_lower:
        return "headcount"
    elif "importacoes" in path_lower:
        return "importacoes"
    elif "cargos" in path_lower or "cargo" in path_lower:
        return "colaboradores"
    elif "salarios" in path_lower or "salario" in path_lower:
        return "salarios"
    elif "lojas" in path_lower or "stores" in path_lower:
        return "lojas"
        
    return "dashboard"


class IsAdministrador(BasePermission):
    """
    Esta classe de permissão existe para restringir o acesso a endpoints específicos
    do Django REST Framework apenas a usuários que possuem o papel de administrador
    ativo no banco de dados.
    """
    message = "O que você ta fazendo aqui ein espertinho? Não vai achar nada"

    def has_permission(self, request, view):
        """
        Verifica dinamicamente se o usuário tem a permissão de acordo com o módulo.
        """
        user = request.user
        if not user or not user.is_authenticated:
            return False
            
        if user.is_superuser:
            return True
            
        group = user.groups.first()
        if not group:
            return False
            
        # Determina o módulo e a ação (view, create, edit, delete)
        modulo = obter_modulo_por_view(view.__class__.__name__, request.path)
        
        action = "view"
        if request.method in ["POST"]:
            action = "create"
        elif request.method in ["PUT", "PATCH"]:
            action = "edit"
        elif request.method in ["DELETE"]:
            action = "delete"
            
        from .models import RolePermission
        try:
            perm = RolePermission.objects.get(group=group, module=modulo)
            if action == "view":
                return perm.can_view
            elif action == "create":
                if "atribuir" in request.path.lower() or "save" in request.path.lower():
                    return perm.can_create or perm.can_edit
                return perm.can_create
            elif action == "edit":
                return perm.can_edit
            elif action == "delete":
                return perm.can_delete
        except (RolePermission.DoesNotExist, DatabaseError):
            # Se a tabela não existir ou o registro for nulo, bloqueia por padrão mas evita erro 500
            return False
            
        return False


class IsGestaoOrAdministrador(IsAdministrador):
    """
    Esta classe de permissão existe para permitir o acesso a endpoints operacionais
    de acordo com as permissões cadastradas no banco de dados para a role do usuário.

    O comportamento é o mesmo de ``IsAdministrador`` porque ambas consultam as
    permissões dinâmicas de ``RolePermission``. A classe separada preserva o nome
    sem duplicar uma regra de segurança que precisa permanecer consistente.
    """
