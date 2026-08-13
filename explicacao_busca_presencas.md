# Como as Presenças são Buscadas e Calculadas no Sistema

Este documento descreve detalhadamente o funcionamento atual da busca de presenças via API, da importação por planilha e de como esses dados são cruzados na aba de Headcount.

---

## 1. Sincronização via API do GeoVictoria (Ponto de Ontem e 3 Dias)

A rotina de sincronização ativa consome o endpoint `/Punch/ListByUsersDates` (POST) da API do GeoVictoria.

### Fluxo de Execução
1. **Identificação de CPFs**:
   * O sistema busca no banco local os colaboradores que possuem CPF cadastrado.
   * Se for uma **sincronização de loja (3 dias)**, busca apenas os colaboradores alocados naquela loja (`loja_gestao`).
   * Se for uma **sincronização geral (ontem)**, busca de todas as filiais.
2. **Divisão em Lotes (Batching)**:
   * Para evitar limites de requisição da API do GeoVictoria, a lista de CPFs é dividida em lotes de no máximo **100 CPFs** por requisição.
3. **Payload da API**:
   O sistema faz um POST para `https://customerapi.geovictoria.com/api/v1/AttendanceBook/PunchesByShifts` com o formato:
   ```json
   {
       "StartDate": "YYYYMMDD000000",
       "EndDate": "YYYYMMDD235959",
       "UserIds": "CPF1,CPF2,CPF3..."
   }
   ```
4. **Filtros e Atribuição de Lojas**:
   * Filtra registros onde `ShiftPunchType` é `"Entrada"`.
   * **Regra de Loja (TOTVS)**: Se o colaborador for localizado no banco, a presença é vinculada diretamente à **loja que ele está alocado no sistema** (`colab.loja_gestao` ou `colab.loja`), ignorando o local físico onde a batida ocorreu. O local do GeoVictoria (`GroupDescription`) só é usado como fallback caso o colaborador não seja cadastrado.
5. **Regra de Precedência**:
   * Se a batida correspondente a essa data já existir no banco local com `origem_report = True` (vinda de planilha manual), ela **não é sobrescrita** pela API.

---

## 2. Importação do Relatório de Marcas (Planilha Excel)

A rotina lê o arquivo Excel exportado do GeoVictoria na Central de Importações.

### Fluxo de Execução
1. **Leitura de Colunas**:
   * Busca as colunas: `Rut` (CPF), `Apellidos` (RE), `Marcación` (Local Físico da Batida), `Data`, `Hora` e `Tipo`.
2. **Filtro de Entrada**:
   * Filtra apenas linhas com `Tipo == 'Ingreso'`.
3. **Mapeamento de Loja Física Real**:
   * Resolve a loja cruzando o valor da coluna **`Marcación`** contra o campo `nome_geovictoria` no cadastro de lojas (usando normalização de texto sem acentos/maiúsculas).
4. **Substituição e Gravação**:
   * Identifica o colaborador pelo CPF ou RE.
   * Apaga qualquer batida normal (da API) existente na mesma data para o colaborador.
   * Salva o novo registro no banco local com `origem_report = True`.

---

## 3. Como a Aba de Headcount Consome esses Dados

Na página de **Auditoria de Headcount**, calculamos a coluna **"Presenças Ontem"** (ontem).

### Lógica da Consulta
O backend utiliza uma única query otimizada para buscar todos os registros de ontem na tabela de presenças agrupados por loja:

```python
# lojas/views/headcount.py
presencas_ontem_dados = (
    PresencaRelogio.objects.filter(data=ontem)
    .values("loja_id")
    .annotate(count=Count("cpf_original", distinct=True))
)
```

1. **Agrupamento por `loja_id`**: Conta a quantidade de pessoas diferentes (`cpf_original` distintos) que registraram entrada na data de ontem.
2. **Exibição na Tela**:
   * O sistema exibe o número calculado no campo `presencas_ultimo_dia` para cada loja.
   * O timestamp do último sync bem-sucedido (individual ou geral) é exibido na coluna **"Última Sincronização"**.
