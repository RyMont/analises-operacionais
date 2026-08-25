from django.urls import path
from lojas.views import configuracoes
from . import views
from . import views_agenda
from . import views_testes

app_name = 'colaboradores'

urlpatterns = [
    path('', views.colaborador_list, name='list'),
    path('<int:pk>/', views.colaborador_detail_update_api, name='colaborador_detail_update'),
    path('atribuir-cargo/', views.colaborador_atribuir_cargo_api, name='colaborador_atribuir_cargo'),
    path('demitidos/', views.demitido_list, name='demitidos_list'),
    path('filtro-opcoes/', views.colaborador_filtro_opcoes, name='filtro_opcoes'),
    path('status-gestao-opcoes/', views.status_gestao_opcoes, name='status_gestao_opcoes'),
    path('turnover/', views.turnover_list_api, name='turnover_list_api'),
    path('turnover/filtro-opcoes/', views.turnover_filtro_opcoes_api, name='turnover_filtro_opcoes_api'),
    path('terminos/', views.terminos_list, name='terminos_list'),
    path('terminos/exportar/', views.exportar_terminos_excel, name='terminos_export'),
    path('geovictoria/resumo/<int:colaborador_id>/', views.colaborador_geovictoria_summary, name='geovictoria_summary'),
    path('geovictoria/detalhes/<int:colaborador_id>/', views.colaborador_geovictoria_details, name='geovictoria_details'),
    path('importar/', configuracoes.colaborador_import_async, name='importar'),
    path('importar-gestao/', configuracoes.gestao_import_async, name='importar_gestao'),
    path('importar-marcas/', configuracoes.punches_report_import_async, name='importar_marcas'),
    path('importar-turnover/', configuracoes.turnover_import_async, name='importar_turnover'),
    path('sync-lojas-geovictoria/', views.sync_lojas_geovictoria, name='sync_lojas_geovictoria'),
    path('sync-lojas-geovictoria-progress/', views.sync_lojas_geovictoria_progress, name='sync_lojas_geovictoria_progress'),
    path('sync-lojas-geovictoria/pendencias/<str:tipo>/', views.exportar_pendencias_lojas_geovictoria, name='sync_lojas_geovictoria_pendencias'),
    path('sync-geovictoria/', views.sync_geovictoria, name='sync_geovictoria'),
    path('sync-geovictoria-progress/', views.sync_geovictoria_progress, name='sync_geovictoria_progress'),
    path('agendamentos/', views_agenda.agendamento_list_create, name='agendamento_list_create'),
    path('agendamentos/<int:pk>/excluir/', views_agenda.agendamento_delete, name='agendamento_delete'),
    path('agendamentos/colaboradores-ativos/', views_agenda.colaborador_ativos_completo, name='colaborador_ativos_completo'),
    path('agendamentos/historico-limpeza/', views_agenda.historico_limpeza_vidros, name='historico_limpeza_vidros'),
    path('testes/', views_testes.testes_list, name='testes_list'),
    path('testes/cargos/', views_testes.cargos_unicos_list, name='cargos_unicos_list'),
    path('testes/<int:pk>/ausencias/', views_testes.colaborador_ausencias_summary, name='colaborador_ausencias_summary'),
    path('testes/colaborador/<int:colaborador_id>/ausencias/', views_testes.colaborador_ausencias_avulso, name='colaborador_ausencias_avulso'),
    path('testes/<int:pk>/aprovar/', views_testes.teste_aprovar, name='teste_aprovar'),
    path('testes/<int:pk>/alterar-data-inicio/', views_testes.teste_alterar_data_inicio, name='teste_alterar_data_inicio'),
    path('testes/<int:pk>/registrar-acao/', views_testes.teste_registrar_acao, name='teste_registrar_acao'),
    path('testes/<int:pk>/download/', views_testes.teste_anexo_download, name='teste_anexo_download'),
    path('ausencias/analise/', views.ausencias_analise_api, name='ausencias_analise_api'),
    path('ausencias/analise/filtro-opcoes/', views.ausencias_analise_filtro_opcoes_api, name='ausencias_analise_filtro_opcoes_api'),
    path('ausencias/analise/exportar/', views.exportar_ausencias_excel, name='ausencias_analise_export'),
]


