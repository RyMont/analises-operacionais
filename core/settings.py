from pathlib import Path

import dj_database_url
from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

# core/settings.py

# Configurações lidas do arquivo .env (use .env.example como modelo).
SECRET_KEY = config(
    "SECRET_KEY",
    default="django-insecure-troque-esta-chave-em-producao",
)
DEBUG = config("DEBUG", default=False, cast=bool)
DEFAULT_ALLOWED_HOSTS = ["*"]

ALLOWED_HOSTS = DEFAULT_ALLOWED_HOSTS + config(
    "*",
    default="*",
    cast=Csv(),
)

# Configuração de Limites de Upload (Evita erro 400 Bad Request em arquivos grandes)
DATA_UPLOAD_MAX_MEMORY_SIZE = 104857600  # 100 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 104857600  # 100 MB
DATA_UPLOAD_MAX_NUMBER_FIELDS = 50000


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "plataforma",
    "lojas",
    "colaboradores",
    "usuarios",
    "django_select2",
    "rest_framework",
    "corsheaders",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core.wsgi.application"


# Banco de dados.
# Se a variável DATABASE_URL estiver definida, usamos ela (Postgres do Supabase).
# Caso contrário, caímos no SQLite local — útil para rodar antes de configurar o .env.
DATABASE_URL = config("DATABASE_URL", default="")

if DATABASE_URL:
    # Algumas connection strings (ex.: Supabase pooler) podem vir com
    # parâmetros que o psycopg2 não reconhece, como "?pgbouncer=true".
    # Removemos esse parâmetro para evitar erro "invalid connection option".
    DATABASE_URL_CLEAN = DATABASE_URL.replace("?pgbouncer=true", "")
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL_CLEAN,
            conn_max_age=600,
            ssl_require=True,
        )
    }
else:
    # Por que existe: Permite alterar o caminho do arquivo do banco de dados SQLite para
    # uma pasta de rede (como o disco F) ou outro local customizado através da variável
    # SQLITE_PATH no arquivo .env, evitando encher o armazenamento da máquina local.
    sqlite_path = config("SQLITE_PATH", default="")
    if sqlite_path:
        db_name = Path(sqlite_path)
    else:
        db_name = BASE_DIR / "db.sqlite3"

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": db_name,
            "OPTIONS": {
                "timeout": 30,  # Aumenta timeout de bloqueio de 5s para 30s
            },
        }
    }

# Otimizações de Concorrência Máxima no SQLite (Modo WAL)
# Garante que leituras simultâneas NUNCA sejam bloqueadas durante importações ou escritas pesadas.
from django.db.backends.signals import connection_created
from django.dispatch import receiver

@receiver(connection_created)
def configure_sqlite_concurrency(sender, connection, **kwargs):
    if connection.vendor == "sqlite":
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA journal_mode = WAL;")        # Leitores não travam escritores e vice-versa
            cursor.execute("PRAGMA synchronous = NORMAL;")       # Sincronização rápida sem travamentos de disco
            cursor.execute("PRAGMA busy_timeout = 30000;")       # Espera até 30s em concorrência sem dar erro de lock
            cursor.execute("PRAGMA temp_store = MEMORY;")        # Tabelas temporárias em RAM
            cursor.execute("PRAGMA mmap_size = 268435456;")      # 256MB memory map para leituras ultrarrápidas
            cursor.execute("PRAGMA cache_size = -64000;")        # 64MB de cache em memória


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True


STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "plataforma:inicio"
LOGOUT_REDIRECT_URL = "login"

SESSION_EXPIRE_AT_BROWSER_CLOSE = config(
    "SESSION_EXPIRE_AT_BROWSER_CLOSE",
    default=True,
    cast=bool,
)

# Configurações do Django REST Framework
# Define a autenticação padrão como SessionAuthentication e a permissão padrão como IsAuthenticated.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.authentication.CsrfExemptSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/day",
        "user": "5000/day",
        "auth": "5/minute",
    },
}

# URL do frontend para compor os links de redefinição de senha e configurar origens dinâmicas do CORS/CSRF
# Por que existe: Permite gerar o link completo de redefinição de senha apontando para a porta do React.
FRONTEND_URL = config("FRONTEND_URL", default="http://localhost:5173")

# Evita colisão de cookies/sessão ao rodar as instâncias de teste e produção no mesmo IP (como 10.1.1.93 ou localhost).
# O navegador compartilha cookies entre portas do mesmo domínio, então alteramos os nomes dos cookies na versão de testes (porta 5174).
if FRONTEND_URL and "5174" in FRONTEND_URL:
    SESSION_COOKIE_NAME = "sessionid_teste"
    CSRF_COOKIE_NAME = "csrftoken_teste"

# Permite requisições de origens cruzadas (CORS) para viabilizar a comunicação com o React no frontend.
# Quando usamos credentials (cookies de sessão), não podemos usar wildcard '*'. Devemos especificar as origens.
CORS_ALLOW_CREDENTIALS = True

# Por que existe: Define as origens permitidas para conexões CORS e proteção CSRF.
# Como o frontend de testes roda em uma porta diferente (ex: 5174), extraímos a porta do FRONTEND_URL
# e detectamos dinamicamente os IPs da máquina na rede local para aceitar as conexões de rede de outros dispositivos.
import socket
from urllib.parse import urlparse

frontend_port = 5173
if FRONTEND_URL:
    try:
        parsed_url = urlparse(FRONTEND_URL)
        if parsed_url.port:
            frontend_port = parsed_url.port
    except Exception:
        pass

CORS_ALLOWED_ORIGINS = [
    f"http://localhost:{frontend_port}",
    f"http://127.0.0.1:{frontend_port}",
]

# Origens confiáveis para proteção CSRF do Django, necessária para requisições POST/PUT/DELETE
CSRF_TRUSTED_ORIGINS = [
    f"http://localhost:{frontend_port}",
    f"http://127.0.0.1:{frontend_port}",
]

if FRONTEND_URL:
    clean_url = FRONTEND_URL.rstrip('/')
    if clean_url not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(clean_url)
    if clean_url not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(clean_url)

try:
    hostname = socket.gethostname()
    # Adiciona o nome do computador (hostname) às origens permitidas (tanto em maiúsculas quanto minúsculas)
    if hostname:
        CORS_ALLOWED_ORIGINS.append(f"http://{hostname.lower()}:{frontend_port}")
        CORS_ALLOWED_ORIGINS.append(f"http://{hostname}:{frontend_port}")
        CSRF_TRUSTED_ORIGINS.append(f"http://{hostname.lower()}:{frontend_port}")
        CSRF_TRUSTED_ORIGINS.append(f"http://{hostname}:{frontend_port}")
    
    # Adiciona todos os IPs da máquina na rede local
    ips = socket.gethostbyname_ex(hostname)[2]
    for ip in ips:
        CORS_ALLOWED_ORIGINS.append(f"http://{ip}:{frontend_port}")
        CSRF_TRUSTED_ORIGINS.append(f"http://{ip}:{frontend_port}")
except Exception:
    pass

# Configurações de e-mail utilizando SMTP com fallback para exibição no console em ambiente local.
# Por que existe: Permite que em desenvolvimento os e-mails sejam exibidos no console do terminal,
# facilitando os testes sem precisar configurar chaves reais imediatamente. Em produção, envia via Resend.
EMAIL_BACKEND = config("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="onboarding@resend.dev")

