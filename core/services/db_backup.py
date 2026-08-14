import os
import sqlite3
import logging
import threading
from pathlib import Path
from decouple import config
from django.conf import settings

logger = logging.getLogger(__name__)

def executar_backup_sqlite():
    """
    Executa cópia de segurança segura e atômica do SQLite para o caminho de backup configurado no .env (SQLITE_BACKUP_PATH).
    Usa o recurso nativo sqlite3.backup da biblioteca padrão para garantir integridade mesmo enquanto o sistema está em uso.
    """
    backup_path_str = config("SQLITE_BACKUP_PATH", default="").strip()
    if not backup_path_str:
        return
    
    # Remove aspas se houver
    backup_path_str = backup_path_str.strip('"\'')
    if not backup_path_str:
        return

    db_engine = settings.DATABASES.get("default", {}).get("ENGINE", "")
    if "sqlite" not in db_engine:
        logger.info("Backup ignorado: banco de dados padrão não é SQLite.")
        return

    db_origin = settings.DATABASES["default"]["NAME"]
    if not db_origin or not os.path.exists(db_origin):
        logger.warning(f"Arquivo de banco de dados original não encontrado: {db_origin}")
        return

    try:
        dest_path = Path(backup_path_str)
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"[BACKUP DB] Iniciando backup atômico do SQLite para: {dest_path}")
        
        # Conexão de origem (leitura)
        src_conn = sqlite3.connect(str(db_origin), timeout=30.0)
        # Conexão de destino (escrita no arquivo de backup no servidor)
        dst_conn = sqlite3.connect(str(dest_path), timeout=60.0)
        
        with dst_conn:
            # Copia em páginas de forma segura e não-bloqueante
            src_conn.backup(dst_conn, pages=200, sleep=0.01)
            
        dst_conn.close()
        src_conn.close()
        
        logger.info(f"[BACKUP DB] Backup do SQLite concluído com sucesso para: {dest_path}")
    except Exception as e:
        logger.error(f"[BACKUP DB] Erro ao realizar backup do SQLite para {backup_path_str}: {e}")

def disparar_backup_sqlite_async():
    """
    Dispara o backup do SQLite em uma thread em background separada para não bloquear o usuário ou a resposta HTTP.
    """
    backup_path_str = config("SQLITE_BACKUP_PATH", default="").strip()
    if not backup_path_str:
        return
        
    thread = threading.Thread(target=executar_backup_sqlite, daemon=True)
    thread.start()
