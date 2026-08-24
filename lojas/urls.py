from django.urls import include, path
from . import views  # Isso importa lojas/views/__init__.py
from .views import configuracoes  # Isso importa lojas/views/configuracoes.py

urlpatterns = [
    path("lojas/", views.store_list, name="lista_lojas"),
    path("lojas/filtro-opcoes/", views.store_filtro_opcoes, name="lojas_filtro_opcoes"),
    path("lojas/nova/", views.store_create, name="nova_loja"),
    path("lojas/<int:pk>/", views.store_detail, name="detalhe_loja"),
    path("lojas/<int:pk>/editar/", views.store_update, name="editar_loja"),
    path("lojas/<int:pk>/excluir/", views.store_delete, name="excluir_loja"),
    path(
        "lojas/<int:pk>/insalubridade/",
        views.loja_config_insalubridade,
        name="loja_config_insalubridade",
    ),
    path("escopos/", views.escopo_list, name="lista_escopos"),
    path("escopos/novo/", views.escopo_create, name="novo_escopo"),
    path(
        "escopos/duplicar-proximo-mes/",
        views.escopo_duplicar_proximo_mes,
        name="escopo_duplicar_proximo_mes",
    ),
    path("escopos/<int:pk>/excluir/", views.escopo_delete, name="excluir_escopo"),
    path("escopos/api/item/save/", views.api_item_escopo_save, name="api_item_escopo_save"),
    path("escopos/api/item/<int:pk>/delete/", views.api_item_escopo_delete, name="api_item_escopo_delete"),
    path("escopos/lojas-sem-escopo/", views.lojas_sem_escopo, name="lojas_sem_escopo"),
    path("cargos/", views.cargo_list, name="cargo_list"),
    path("cargos/<int:pk>/", views.cargo_detail_api, name="cargo_detail_api"),
    path("lojas/api/coordenadores/", views.coordenador_list_create, name="coordenador_list_create"),
    path("lojas/api/coordenadores/<int:pk>/", views.coordenador_detail_update_delete, name="coordenador_detail_update_delete"),
    path("lojas/api/supervisores/", views.supervisor_list_create, name="supervisor_list_create"),
    path("lojas/api/supervisores/<int:pk>/", views.supervisor_detail_update_delete, name="supervisor_detail_update_delete"),
    path("lojas/api/salarios/", views.salario_list_create_api, name="salario_list_create_api"),
    path("lojas/api/salarios/<int:pk>/", views.salario_detail_update_delete_api, name="salario_detail_update_delete_api"),
    path("folhas/importar/", configuracoes.folha_import_async, name="importar_folha"),
    
    # ========== HEADCOUNT ==========
    path("lojas/headcount/", views.headcount_analise_api, name="lojas_headcount_analise"),
    path("lojas/headcount/<int:loja_id>/colaboradores/", views.headcount_loja_colaboradores_api, name="headcount_loja_colaboradores"),
    
    # ========== DIÁRIAS (BI & Importador) ==========
    path("diarias/importar/", configuracoes.diaria_import_async, name="importar_diarias"),
    path("diarias/", views.diarias_list_api, name="lista_diarias"),
    path("diarias/filtro-opcoes/", views.diarias_filtro_opcoes_api, name="diarias_filtro_opcoes"),

    # ========== PRÊMIOS (BI & Importador) ==========
    path("premios/importar/", configuracoes.premio_import_async, name="importar_premios"),
    path("premios/", views.premios_list_api, name="lista_premios"),
    path("premios/filtro-opcoes/", views.premios_filtro_opcoes_api, name="premios_filtro_opcoes"),

    # ========== NOVAS URLs (usando configuracoes) ==========
    path("importacoes/", configuracoes.importacoes, name="importacoes"),
    path("colaboradores/importar/", configuracoes.colaborador_import_async, name="colaborador_import"),
    path("colaboradores/importar-gestao/", configuracoes.gestao_import_async, name="gestao_import"),
    path("colaboradores/importar-marcas/", configuracoes.punches_report_import_async, name="punches_report_import"),
    path("import-progress/<str:import_id>/", configuracoes.import_progress, name="import_progress"),
    path("import-status/<str:import_id>/", configuracoes.import_status_api, name="import_status_api"),
    
    path("comparativo/", views.comparativo_loja, name="comparativo_loja"),
    path("comparativo/relatorio/", views.comparativo_relatorio_api, name="comparativo_relatorio_api"),
    path("comparativo/relatorio/exportar/", views.comparativo_relatorio_exportar_excel, name="comparativo_relatorio_exportar"),
    path("comparativo/filtro-opcoes/", views.comparativo_filtro_opcoes_api, name="comparativo_filtro_opcoes"),
    
    # ========== CALENDÁRIO DE PRESENÇAS GEOVICTORIA ==========
    path("lojas/api/presencas/calendario/<int:loja_id>/", views.loja_presencas_calendario_api, name="loja_presencas_calendario"),
    path("lojas/api/presencas/dia/<int:loja_id>/", views.loja_presencas_dia_api, name="loja_presencas_dia"),
    path("lojas/api/presencas/sincronizar-geral/", views.lojas_presencas_sincronizar_geral_api, name="lojas_presencas_sincronizar_geral"),
    path("lojas/api/presencas/sincronizar-loja/<int:loja_id>/", views.loja_presencas_sincronizar_individual_api, name="loja_presencas_sincronizar_loja"),
    path("lojas/api/presencas/sincronizar-progresso/", views.loja_presencas_sincronizar_progresso_api, name="lojas_presencas_sincronizar_progresso"),

    path("select2/", include("django_select2.urls")),
]
