# 🚀 Guia de Configuração: Primeiro Acesso ao Projeto

Este guia contém o passo a passo completo de todas as alterações, configurações e comandos que devem ser realizados ao clonar ou baixar este repositório pela primeira vez em uma nova máquina.

---

## 📋 Pré-requisitos
Certifique-se de ter instalado em sua máquina:
- **Python 3.11+** (Recomendado: Python 3.12 ou 3.14)
- **Node.js 20+** e **npm**
- **Git**
- Acesso à rede interna da empresa (caso utilize o banco compartilhado ou a pasta pública `F:\`)

---

## 1. Configuração do Arquivo de Ambiente (`.env`)

O projeto não versiona senhas, credenciais ou caminhos locais de disco. Você deve criar o arquivo `.env` na raiz do projeto:

1. Na raiz do projeto, faça uma cópia do `.env.example`:
   ```bash
   copy .env.example .env
   ```
2. Abra o arquivo `.env` e ajuste as variáveis conforme o seu ambiente:

| Variável | Descrição / Exemplo |
| :--- | :--- |
| `ALLOWED_HOSTS` | Hosts aceitos (use `*` em desenvolvimento local) |
| `SQLITE_PATH` | Caminho do arquivo `db.sqlite3` no seu SSD local (ex.: `C:\Users\SEU_USUARIO\Documents\db.sqlite3`). Deixar vazio usará o banco dentro da pasta do projeto. |
| `SQLITE_BACKUP_PATH` | Caminho no servidor para sincronização automática de backup (ex.: `F:\04 - Operacional\Operacional\SUPORTE OPERACIONAL\Gui\banco\db.sqlite3`) |
| `TESTES_ANEXOS_PATH` | Diretório de rede onde ficam os anexos de testes de promoção (ex.: `F:\04 - Operacional\Operacional\SUPORTE OPERACIONAL\Gui\banco\Testes`) |
| `PLANILHA_VERBAS_PATH` | Caminho opcional da planilha de De-Para de Verbas (ex.: `C:\caminho\para\planilha_verbas.xlsx` ou no servidor). |
| `GEOVICTORIA_USER` | Usuário de autenticação da API GeoVictoria |
| `GEOVICTORIA_PASSWORD`| Senha da API GeoVictoria |
| `EMAIL_BACKEND` | `django.core.mail.backends.smtp.EmailBackend` para envio real ou vazio para exibir no console |
| `EMAIL_HOST_USER` | E-mail remetente para envio de convites e recuperação de senha |
| `EMAIL_HOST_PASSWORD` | Senha de aplicativo do e-mail remetente |
| `FRONTEND_URL` | URL do frontend React (ex.: `http://localhost:5173` ou `http://SEU_IP:5173`) |

---

## 2. Configuração do De-Para de Verbas (Raio-X)

O arquivo `lojas/fixtures/de_para_verbas.json` contém as regras de classificação das verbas e está ignorado no Git por conter dados internos.

Você possui duas opções para configurá-lo:
- **Opção A (Automática):** Se você tiver acesso à planilha de De-Para e configurou seu caminho na variável `PLANILHA_VERBAS_PATH` no `.env`, o sistema gerará o arquivo JSON automaticamente na primeira execução do Raio-X.
- **Opção B (Manual):** Crie uma cópia do arquivo de exemplo:
  ```bash
  copy lojas\fixtures\de_para_verbas.json.example lojas\fixtures\de_para_verbas.json
  ```
  *(Se tiver o arquivo completo fornecido internamente pela equipe, substitua o conteúdo por ele).*

---

## 3. Configuração do Backend (Python / Django)

1. **Crie e ative o ambiente virtual Python:**
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```
2. **Instale as dependências do Python:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Execute as migrações do banco de dados:**
   ```bash
   python manage.py migrate
   ```
4. **Crie um usuário administrador (opcional para testes locais):**
   ```bash
   python manage.py createsuperuser
   ```
5. **Inicie o servidor de desenvolvimento Django:**
   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```
   *O backend estará acessível em `http://localhost:8000/`.*

---

## 4. Configuração do Frontend (React / Vite)

Abra um novo terminal para o frontend:

1. **Acesse a pasta do frontend:**
   ```bash
   cd frontend
   ```
2. **Instale as dependências do Node.js:**
   ```bash
   npm install
   ```
3. **Inicie o servidor de desenvolvimento do React:**
   ```bash
   npm run dev
   ```
   *O frontend estará acessível em `http://localhost:5173/`.*

---

## 🔒 Arquivos Sensíveis Ignorados no Git

Por segurança e privacidade, os seguintes arquivos **nunca** devem ser comitados no Git:
- `.env` (credenciais e senhas locais)
- `db.sqlite3` e `*.sqlite3` (base de dados com dados pessoais)
- `lojas/fixtures/de_para_verbas.json` (classificações internas de folha)
- `*.xlsx`, `*.csv` (planilhas brutas de folha, ponto e rescisões)
- `media/` e `staticfiles/` (arquivos gerados em tempo de execução)

---

## 💡 Dúvidas Frequentes

- **Erro ao executar scripts PowerShell no Windows:**  
  Execute `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` no terminal ou use o prompt de comando (CMD).
- **Rede ou disco `F:\` desconectado:**  
  O sistema continuará funcionando utilizando o fallback local ou o arquivo `.example` configurado.
