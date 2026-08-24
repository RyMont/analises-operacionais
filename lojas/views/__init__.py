"""Views do app lojas (importadas por urls como ``from . import views``)."""

from .common import (
    competencia_anterior,
    parse_int_param,
    replicar_do_mes_anterior_se_existir,
)
from .escopos import (
    api_item_escopo_delete,
    api_item_escopo_save,
    escopo_create,
    escopo_delete,
    escopo_duplicar_proximo_mes,
    escopo_list,
    cargo_list,
    cargo_detail_api,
    lojas_sem_escopo,
)
from .configuracoes import importacoes
from .loja_insalubridade import loja_config_insalubridade
from .stores import (
    store_create,
    store_delete,
    store_detail,
    store_list,
    store_update,
    coordenador_list_create,
    supervisor_list_create,
    coordenador_detail_update_delete,
    supervisor_detail_update_delete,
    store_filtro_opcoes,
)

from .comparativo import comparativo_loja
from .comparativo_relatorio import (
    comparativo_relatorio_api,
    comparativo_filtro_opcoes_api,
    comparativo_relatorio_exportar_excel,
)
from .diarias import diarias_list_api, diarias_filtro_opcoes_api
from .premios import premios_list_api, premios_filtro_opcoes_api
from .headcount import headcount_analise_api, headcount_loja_colaboradores_api
from .presencas import (
    loja_presencas_calendario_api,
    loja_presencas_dia_api,
    lojas_presencas_sincronizar_geral_api,
    loja_presencas_sincronizar_individual_api,
    loja_presencas_sincronizar_progresso_api,
)
from .salarios import (
    salario_list_create_api,
    salario_detail_update_delete_api,
)

__all__ = [
    "api_item_escopo_delete",
    "api_item_escopo_save",
    "cargo_list",
    "cargo_detail_api",
    "comparativo_loja",
    "comparativo_relatorio_api",
    "comparativo_filtro_opcoes_api",
    "comparativo_relatorio_exportar_excel",
    "competencia_anterior",
    "escopo_create",
    "escopo_delete",
    "escopo_list",
    "headcount_analise_api",
    "headcount_loja_colaboradores_api",
    "parse_int_param",
    "replicar_do_mes_anterior_se_existir",
    "store_create",
    "store_delete",
    "store_detail",
    "store_list",
    "store_update",
    "escopo_duplicar_proximo_mes",
    "lojas_sem_escopo",
    "loja_config_insalubridade",
    "coordenador_list_create",
    "supervisor_list_create",
    "coordenador_detail_update_delete",
    "supervisor_detail_update_delete",
    "store_filtro_opcoes",
    "diarias_list_api",
    "diarias_filtro_opcoes_api",
    "premios_list_api",
    "premios_filtro_opcoes_api",
    "loja_presencas_calendario_api",
    "loja_presencas_dia_api",
    "lojas_presencas_sincronizar_geral_api",
    "loja_presencas_sincronizar_individual_api",
    "loja_presencas_sincronizar_progresso_api",
    "salario_list_create_api",
    "salario_detail_update_delete_api",
]
