from django.urls import path
from . import views

app_name = "usuarios"

urlpatterns = [
    path("", views.usuario_list, name="list"),
    path("novo/", views.usuario_create, name="create"),
    path("<int:pk>/", views.usuario_update, name="update"),
    path("api/login/", views.api_login, name="api_login"),
    path("api/logout/", views.api_logout, name="api_logout"),
    path("api/me/", views.api_me, name="api_me"),
    path("api/roles/", views.role_list, name="role_list"),
    path("api/roles/nova/", views.role_create, name="role_create"),
    path("api/roles/<int:group_id>/permissions/", views.role_permissions_update, name="role_permissions_update"),
    path("api/recuperar-senha/", views.api_recuperar_senha, name="api_recuperar_senha"),
    path("api/redefinir-senha/", views.api_redefinir_senha, name="api_redefinir_senha"),
]
