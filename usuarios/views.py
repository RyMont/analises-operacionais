from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes, throttle_classes
from .throttles import AuthAnonRateThrottle
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authentication import SessionAuthentication
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str

from .permissions import IsAdministrador
from .serializers import UsuarioSerializer, UsuarioCreateSerializer

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def usuario_list(request):
    """
    Retorna uma lista JSON de todos os usuários cadastrados no sistema, ordenada por username.
    Esta view exige autenticação e permissão de administrador corporativo.
    """
    usuarios = User.objects.all().order_by("username")
    serializer = UsuarioSerializer(usuarios, many=True)
    return Response(serializer.data)

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def usuario_create(request):
    """
    Cria um novo usuário administrador a partir de um payload JSON.
    Esta view exige privilégios de administrador para evitar o cadastro de contas arbitrárias.
    """
    serializer = UsuarioCreateSerializer(data=request.data)
    if serializer.is_valid():
        novo_usuario = serializer.save()
        
        # Envia e-mail de boas-vindas com dados de acesso se houver e-mail cadastrado
        email = novo_usuario.email
        if email:
            senha_plana = request.data.get("password", "")
            subject = "Sua conta foi criada no Sistema de Análises Operacionais"
            message = f"Olá, {novo_usuario.first_name or novo_usuario.username}!\n\n" \
                      f"Sua conta no Sistema de Análises Operacionais foi criada por um administrador.\n\n" \
                      f"Seguem abaixo os seus dados de acesso:\n" \
                      f"Link do sistema: {settings.FRONTEND_URL}/login\n" \
                      f"Usuário: {novo_usuario.username}\n" \
                      f"Senha: {senha_plana}\n\n" \
                      f"Por favor, acesse o sistema utilizando as credenciais acima.\n\n" \
                      f"Atenciosamente,\n" \
                      f"Equipe de Suporte Operacional"
            try:
                send_mail(
                    subject=subject,
                    message=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[email],
                    fail_silently=False,
                )
            except Exception as e:
                # Se falhar o envio de e-mail, registramos o erro no log e prosseguimos para não impedir a criação do usuário
                print(f"Erro ao enviar email de boas-vindas: {e}")

        return Response({
            "success": True,
            "message": f"Usuário {novo_usuario.username} cadastrado como administrador.",
            "usuario": UsuarioSerializer(novo_usuario).data
        }, status=status.HTTP_201_CREATED)
    return Response({
        "success": False,
        "errors": serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)

@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthAnonRateThrottle])
def api_login(request):
    """
    Realiza a autenticação e inicia a sessão (cookie-based) para o usuário.
    Esta view é pública para permitir o login do frontend React.
    """
    username = request.data.get("username")
    password = request.data.get("password")
    
    if not username or not password:
        return Response({
            "success": False,
            "error": "Por favor, forneça usuário e senha."
        }, status=status.HTTP_400_BAD_REQUEST)
        
    user = authenticate(request, username=username, password=password)
    
    if user is not None:
        if user.is_active:
            login(request, user)
            return Response({
                "success": True,
                "message": "Autenticação bem-sucedida.",
                "user": UsuarioSerializer(user).data
            })
        return Response({
            "success": False,
            "error": "Esta conta de usuário está desativada."
        }, status=status.HTTP_403_FORBIDDEN)
        
    return Response({
        "success": False,
        "error": "Usuário ou senha incorretos."
    }, status=status.HTTP_401_UNAUTHORIZED)

@api_view(["POST"])
@permission_classes([AllowAny])
def api_logout(request):
    """
    Finaliza a sessão do usuário ativo, limpando os cookies de sessão.
    Disponível para qualquer requisição para facilitar o encerramento seguro.
    """
    logout(request)
    return Response({
        "success": True,
        "message": "Sessão encerrada com sucesso."
    })

@api_view(["GET"])
@permission_classes([AllowAny])
def api_me(request):
    """
    Retorna os detalhes do usuário atualmente autenticado na sessão ativa.
    Útil para o frontend React verificar o estado de login na inicialização da página.
    """
    if request.user.is_authenticated:
        return Response({
            "authenticated": True,
            "user": UsuarioSerializer(request.user).data
        })
    return Response({
        "authenticated": False,
        "user": None
    })

@api_view(["PUT", "PATCH"])
@permission_classes([IsAuthenticated])
def usuario_update(request, pk):
    """
    Esta view permite a edição de usuários do sistema por outros administradores
    ou por si próprio (perfil).
    
    Docstring explicativa em português:
    Esta view serve para permitir que os administradores editem o cadastro de outros usuários,
    e que usuários comuns possam editar suas próprias informações (nome, e-mail e senha)
    sem precisar de direitos administrativos gerais, mantendo a integridade e segurança do sistema.
    """
    from usuarios.decorators import usuario_e_administrador
    try:
        usuario = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({
            "success": False,
            "error": "Usuário não encontrado."
        }, status=status.HTTP_404_NOT_FOUND)

    is_self = (request.user == usuario)
    is_admin = usuario_e_administrador(request.user)

    if not (is_self or is_admin):
        return Response({
            "success": False,
            "error": "Você não tem permissão para editar este usuário."
        }, status=status.HTTP_403_FORBIDDEN)

    # Não permitir desativar a si próprio para evitar lockout acidental do sistema
    is_active = request.data.get("is_active")
    if is_active is not None and not bool(is_active) and usuario == request.user:
        return Response({
            "success": False,
            "error": "Você não pode desativar o seu próprio usuário administrador."
        }, status=status.HTTP_400_BAD_REQUEST)

    role = request.data.get("role")
    if role is not None:
        if not is_admin:
            return Response({
                "success": False,
                "error": "Você não tem permissão para alterar o papel de acesso."
            }, status=status.HTTP_403_FORBIDDEN)
        
        role_str = str(role)
            
        if usuario == request.user and role_str.lower() != "administrador":
            return Response({
                "success": False,
                "error": "Você não pode rebaixar o seu próprio papel de administrador."
            }, status=status.HTTP_400_BAD_REQUEST)
            
        from django.contrib.auth.models import Group
        
        usuario.groups.clear()
        
        if role_str.lower() != "sem role":
            try:
                group = Group.objects.get(name__iexact=role_str)
                usuario.groups.add(group)
                if group.name.lower() == "administrador":
                    usuario.is_superuser = True
                    usuario.is_staff = True
                else:
                    usuario.is_superuser = False
                    usuario.is_staff = False
            except Group.DoesNotExist:
                return Response({
                    "success": False,
                    "error": "Papel de acesso inválido."
                }, status=status.HTTP_400_BAD_REQUEST)
        else: # Sem role
            usuario.is_superuser = False
            usuario.is_staff = False

    username = request.data.get("username")
    first_name = request.data.get("first_name")
    last_name = request.data.get("last_name")
    email = request.data.get("email")
    password = request.data.get("password")

    # Apenas admin pode alterar o username
    if username and username != usuario.username:
        if not is_admin:
            return Response({
                "success": False,
                "error": "Você não tem permissão para alterar o nome de usuário."
            }, status=status.HTTP_403_FORBIDDEN)
        if User.objects.filter(username=username).exclude(pk=pk).exists():
            return Response({
                "success": False,
                "error": "Este nome de usuário já está sendo utilizado."
            }, status=status.HTTP_400_BAD_REQUEST)
        usuario.username = username

    if first_name is not None:
        usuario.first_name = first_name
    if last_name is not None:
        usuario.last_name = last_name
    if email is not None:
        usuario.email = email
        
    if is_active is not None:
        if not is_admin:
            return Response({
                "success": False,
                "error": "Você não tem permissão para alterar o status de ativação."
            }, status=status.HTTP_403_FORBIDDEN)
        usuario.is_active = bool(is_active)

    if password:
        # Valida a força da senha antes de defini-la
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(password, user=usuario)
        except ValidationError as e:
            return Response({
                "success": False,
                "error": "Senha muito fraca.",
                "details": list(e.messages)
            }, status=status.HTTP_400_BAD_REQUEST)
        usuario.set_password(password)

    usuario.save()

    # Se editou a própria senha, faz o login de novo para manter a sessão ativa
    if is_self and password:
        login(request, usuario)

    return Response({
        "success": True,
        "message": f"Usuário {usuario.username} atualizado com sucesso.",
        "usuario": UsuarioSerializer(usuario).data
    })

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdministrador])
def role_list(request):
    """
    Retorna a lista de roles (grupos) e as permissões de acesso associadas a cada um.
    
    Docstring explicativa em português:
    Esta view serve para listar todas as roles (auth.Group) no sistema e recuperar suas respectivas
    permissões de acesso cadastradas na tabela RolePermission. Se algum módulo não tiver registro
    ainda para o grupo, criamos com permissão inativa por segurança.
    """
    from django.contrib.auth.models import Group
    from .models import RolePermission
    from .serializers import RolePermissionSerializer
    
    groups = Group.objects.all().order_by("name")
    data = []
    
    modulos = [
        "dashboard", "lojas", "apoio", "colaboradores", "turnover",
        "escopos", "comparativo", "headcount", "diarias", "premios",
        "importacoes", "usuarios", "salarios", "testes_promocao",
        "ausencias"
    ]
    
    for group in groups:
        group_perms = []
        for modulo in modulos:
            perm, _ = RolePermission.objects.get_or_create(
                group=group,
                module=modulo,
                defaults={
                    "can_view": False,
                    "can_create": False,
                    "can_edit": False,
                    "can_delete": False
                }
            )
            group_perms.append(perm)
            
        serializer = RolePermissionSerializer(group_perms, many=True)
        data.append({
            "id": str(group.id),
            "name": group.name.capitalize() if group.name else "",
            "permissions": serializer.data
        })
        
    return Response(data)

@api_view(["PUT"])
@permission_classes([IsAuthenticated, IsAdministrador])
def role_permissions_update(request, group_id):
    """
    Atualiza as permissões de acesso por módulo de um determinado grupo de usuário.
    
    Docstring explicativa em português:
    Esta view permite que administradores atualizem em lote as permissões (can_view, can_create, etc)
    dos módulos para um determinado grupo (Role), salvando essas alterações diretamente no banco.
    """
    from django.contrib.auth.models import Group
    from .models import RolePermission
    
    try:
        group = Group.objects.get(pk=group_id)
    except Group.DoesNotExist:
        return Response({
            "success": False,
            "error": "Grupo não encontrado."
        }, status=status.HTTP_404_NOT_FOUND)
        
    permissions_data = request.data.get("permissions", [])
    
    for perm_data in permissions_data:
        module = perm_data.get("module")
        if not module:
            continue
            
        RolePermission.objects.update_or_create(
            group=group,
            module=module,
            defaults={
                "can_view": bool(perm_data.get("can_view", False)),
                "can_create": bool(perm_data.get("can_create", False)),
                "can_edit": bool(perm_data.get("can_edit", False)),
                "can_delete": bool(perm_data.get("can_delete", False))
            }
        )
        
    return Response({
        "success": True,
        "message": f"Permissões do grupo {group.name} atualizadas com sucesso."
    })


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthAnonRateThrottle])
def api_recuperar_senha(request):
    """
    Gera um token de redefinição de senha seguro e envia por e-mail para o usuário.
    
    Docstring explicativa em português:
    Esta view serve para permitir que um usuário que esqueceu sua senha informe seu e-mail.
    Se o e-mail estiver vinculado a uma conta ativa, geramos um token seguro e um ID em Base64
    e enviamos um link por e-mail para redefinição.
    """
    email = request.data.get("email")
    if not email:
        return Response({
            "success": False,
            "error": "Por favor, informe o e-mail."
        }, status=status.HTTP_400_BAD_REQUEST)
        
    try:
        user = User.objects.get(email=email, is_active=True)
    except User.DoesNotExist:
        # Por motivos de segurança, se o e-mail não existir, retornamos sucesso
        # para evitar a descoberta de e-mails cadastrados na base (username harvesting).
        return Response({
            "success": True,
            "message": "Se o e-mail estiver cadastrado, um link de redefinição foi enviado."
        })
        
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    
    link = f"{settings.FRONTEND_URL}/redefinir-senha?uidb64={uidb64}&token={token}"
    
    subject = "Recuperação de Senha - Sistema de Análises Operacionais"
    message = f"Olá, {user.first_name or user.username}!\n\n" \
              f"Você solicitou a redefinição de sua senha no Sistema de Análises Operacionais.\n\n" \
              f"Para definir uma nova senha, clique no link abaixo:\n" \
              f"{link}\n\n" \
              f"Caso você não tenha solicitado esta alteração, desconsidere este e-mail.\n\n" \
              f"Atenciosamente,\n" \
              f"Equipe de Suporte Operacional"
              
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        return Response({
            "success": True,
            "message": "Se o e-mail estiver cadastrado, um link de redefinição foi enviado."
        })
    except Exception as e:
        print(f"Erro ao enviar email de recuperação de senha: {e}")
        return Response({
            "success": False,
            "error": "Ocorreu um erro ao processar o envio do e-mail. Tente novamente mais tarde."
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthAnonRateThrottle])
def api_redefinir_senha(request):
    """
    Valida o token seguro e altera a senha do usuário.
    
    Docstring explicativa em português:
    Esta view serve para receber a nova senha do usuário juntamente com o ID criptografado (uidb64)
    e o token de segurança de redefinição de senha gerado anteriormente. Valida esses dados e,
    se forem corretos e válidos, altera e hasheia a nova senha do usuário.
    """
    uidb64 = request.data.get("uidb64")
    token = request.data.get("token")
    password = request.data.get("password")
    
    if not uidb64 or not token or not password:
        return Response({
            "success": False,
            "error": "Dados incompletos fornecidos."
        }, status=status.HTTP_400_BAD_REQUEST)
        
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None
        
    if user is not None and default_token_generator.check_token(user, token):
        # Valida a força da senha antes de defini-la
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(password, user=user)
        except ValidationError as e:
            return Response({
                "success": False,
                "error": "Senha muito fraca.",
                "details": list(e.messages)
            }, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save()
        return Response({
            "success": True,
            "message": "Sua senha foi redefinida com sucesso!"
        })
        
    return Response({
        "success": False,
        "error": "Este link de redefinição é inválido ou expirou. Solicite um novo link."
    }, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrador])
def role_create(request):
    """
    Cria uma nova função (Role) no sistema.
    """
    from django.contrib.auth.models import Group
    name = request.data.get("name")
    
    if not name:
        return Response({"success": False, "error": "Nome da função é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)
        
    if Group.objects.filter(name__iexact=name).exists():
        return Response({"success": False, "error": "Já existe uma função com este nome."}, status=status.HTTP_400_BAD_REQUEST)
        
    group = Group.objects.create(name=name)
    
    return Response({
        "success": True,
        "message": f"Função {name} criada com sucesso.",
        "id": group.id,
        "name": group.name
    }, status=status.HTTP_201_CREATED)
