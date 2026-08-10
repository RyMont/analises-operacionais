import { useEffect, useState } from 'react';
import { 
  Loader2, 
  AlertCircle, 
  Plus, 
  FileText, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Play,
  Settings,
  ChevronLeft,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import api, { getBackendPort } from '../api/client';
import { toast } from 'sonner';
import { formatDate, obterInfoFolhas, obterFolhaCalendarioReal, converterFolhaParaNumero } from '../utils/formatters';
import NovoTesteModal from '../components/Testes/NovoTesteModal';
import AcaoTesteModal from '../components/Testes/AcaoTesteModal';
import SearchableSelect from '../components/ui/searchable-select';

export interface HistoricoAcao {
  id: string;
  acao: 'ativar' | 'pagar_premio' | 'promover' | 'cancelar' | 'registrar_resposta' | 'pagar_premio_cancelar';
  acao_display: string;
  mes_referencia: number;
  observacao: string;
  solicitado_por: string;
  realizado_por: string;
  data_acao: string;
  created_at: string;
  resposta_supervisor?: 'pagar_premio' | 'promover' | 'cancelar' | 'pagar_premio_cancelar';
}

export interface TestePromocaoItem {
  id: string;
  colaborador: string;
  colaborador_nome: string;
  colaborador_re: string;
  colaborador_cargo: string;
  colaborador_admissao: string;
  colaborador_status_gestao: string;
  loja_nome: string;
  supervisor_nome: string;
  coordenador_nome: string;
  data_inicio: string;
  cargo_teste: string | null;
  status: 'pendente' | 'ativo' | 'promovido' | 'cancelado';
  status_display: string;
  anexo: string | null;
  criado_por: string;
  created_at: string;
  updated_at: string;
  historico_acoes: HistoricoAcao[];
}


/**
 * Página de Controle de Testes de Promoção.
 * 
 * Por que existe: Permite o acompanhamento mensal de novos colaboradores em fase de teste,
 * gerindo as tomadas de decisões de prorrogação (pagamento de prêmio), promoção ou cancelamento
 * com regras rigorosas por tempo de teste (mês 1, mês 2, mês 3 ou mês 4).
 */
export default function TestesPromocao() {
  const [testes, setTestes] = useState<TestePromocaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Filtros
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [statusFiltroAplicado, setStatusFiltroAplicado] = useState('');
  const [cobrancaFiltro, setCobrancaFiltro] = useState<'todos' | 'falta_resposta' | 'em_dia'>('todos');
  const [cobrancaFiltroAplicado, setCobrancaFiltroAplicado] = useState<'todos' | 'falta_resposta' | 'em_dia'>('todos');
  const [supervisorFiltro, setSupervisorFiltro] = useState('');
  const [supervisorFiltroAplicado, setSupervisorFiltroAplicado] = useState('');

  // Por que existe: Permite filtrar os testes ativos pela etapa em que se encontram (Aguardando Resposta ou Aguardando Ação).
  const [etapaFiltro, setEtapaFiltro] = useState('');
  const [etapaFiltroAplicado, setEtapaFiltroAplicado] = useState('');

  // Por que existe: Permite filtrar os testes pela ação específica que o supervisor respondeu/solicitou (Pagar Prêmio, Promover, Cancelar).
  const [acaoPendenteFiltro, setAcaoPendenteFiltro] = useState('');
  const [acaoPendenteFiltroAplicado, setAcaoPendenteFiltroAplicado] = useState('');

  // Por que existe: Permite filtrar os testes pela folha do ciclo ativo em que se encontram.
  const [folhaFiltro, setFolhaFiltro] = useState('');
  const [folhaFiltroAplicado, setFolhaFiltroAplicado] = useState('');

  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Modais
  const [showNovoModal, setShowNovoModal] = useState(false);
  const [showAcaoModal, setShowAcaoModal] = useState(false);
  const [selectedTeste, setSelectedTeste] = useState<TestePromocaoItem | null>(null);

  // Por que existe: Carrega a lista completa de testes da API quando o componente é montado
  // ou quando uma nova ação/cadastro é finalizado (disparando fetchTrigger).
  useEffect(() => {
    fetchTestes();
  }, [fetchTrigger]);

  // Por que existe: Reinicia a página ativa para a primeira toda vez que um filtro de busca aplicada é alterado,
  // evitando que o usuário fique em uma página inexistente para a nova busca.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    buscaAplicada,
    statusFiltroAplicado,
    cobrancaFiltroAplicado,
    supervisorFiltroAplicado,
    etapaFiltroAplicado,
    acaoPendenteFiltroAplicado,
    folhaFiltroAplicado
  ]);

  const fetchTestes = async () => {
    setLoading(true);
    try {
      // Requisita a lista completa de testes enviando no_page=true para que a paginação
      // ocorra de forma local no frontend após aplicados todos os filtros.
      const response = await api.get('/colaboradores/testes/', { params: { no_page: 'true' } });
      
      const dados = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setTestes(dados);
    } catch (err) {
      console.error('Erro ao carregar testes de promoção:', err);
      toast.error('Não foi possível carregar a lista de testes de promoção.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBuscaAplicada(busca);
    setStatusFiltroAplicado(statusFiltro);
    setCobrancaFiltroAplicado(cobrancaFiltro);
    setSupervisorFiltroAplicado(supervisorFiltro);
    setEtapaFiltroAplicado(etapaFiltro);
    setAcaoPendenteFiltroAplicado(acaoPendenteFiltro);
    setFolhaFiltroAplicado(folhaFiltro);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setBusca('');
    setBuscaAplicada('');
    setStatusFiltro('');
    setStatusFiltroAplicado('');
    setCobrancaFiltro('todos');
    setCobrancaFiltroAplicado('todos');
    setSupervisorFiltro('');
    setSupervisorFiltroAplicado('');
    setEtapaFiltro('');
    setEtapaFiltroAplicado('');
    setAcaoPendenteFiltro('');
    setAcaoPendenteFiltroAplicado('');
    setFolhaFiltro('');
    setFolhaFiltroAplicado('');
    setCurrentPage(1);
  };

  const handleOpenAcao = (teste: TestePromocaoItem) => {
    setSelectedTeste(teste);
    setShowAcaoModal(true);
  };

  const handleSaveSuccess = () => {
    setShowNovoModal(false);
    setShowAcaoModal(false);
    setFetchTrigger(prev => prev + 1);
  };

  const handleViewAnexo = (teste: TestePromocaoItem) => {
    if (!teste.anexo) {
      toast.error('Nenhum anexo folha de teste disponível.');
      return;
    }
    // Abre o download do anexo em nova aba
    const url = `http://${window.location.hostname}:${getBackendPort()}/colaboradores/testes/${teste.id}/download/`;
    window.open(url, '_blank');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="h-3.5 w-3.5" />
            Pendente
          </span>
        );
      case 'ativo':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Play className="h-3.5 w-3.5" />
            Ativo
          </span>
        );
      case 'promovido':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Promovido
          </span>
        );
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            <XCircle className="h-3.5 w-3.5" />
            Cancelado
          </span>
        );
      default:
        return null;
    }
  };

  // Por que existe: Obtém a folha de pagamento atual em que o teste se encontra para fins de filtragem.
  const obterFolhaAtualTeste = (teste: TestePromocaoItem): string | null => {
    if (teste.status === 'promovido' || teste.status === 'cancelado') {
      return null;
    }
    const premios = teste.historico_acoes.filter(
      a => a.acao === 'pagar_premio' || a.acao === 'pagar_premio_cancelar'
    ).length;
    const mesAtualNum = teste.status === 'pendente' ? 1 : premios + 1;
    const folhas = obterInfoFolhas(teste.data_inicio);
    const folhaAtual = folhas.find(f => f.mesRef === mesAtualNum);
    return folhaAtual ? folhaAtual.nomeFolha : null;
  };

  const getMesAtual = (teste: TestePromocaoItem) => {
    if (teste.status === 'promovido' || teste.status === 'cancelado') {
      return 'Finalizado';
    }
    if (teste.status === 'pendente') {
      return 'Aguardando Ativação';
    }
    const premios = teste.historico_acoes.filter(a => a.acao === 'pagar_premio' || a.acao === 'pagar_premio_cancelar').length;
    const mesAtualNum = premios + 1;
    
    // Calcula as folhas associadas
    const folhas = obterInfoFolhas(teste.data_inicio);
    const folhaAtual = folhas.find(f => f.mesRef === mesAtualNum);

    const acaoResposta = teste.historico_acoes.find(
      a => a.acao === 'registrar_resposta' && a.mes_referencia === mesAtualNum
    );
    const subEtapa = acaoResposta ? 'Aguardando Ação' : 'Aguardando Resposta';
    
    let decisaoTexto = '';
    if (acaoResposta?.resposta_supervisor) {
      const resp = acaoResposta.resposta_supervisor;
      decisaoTexto = resp === 'pagar_premio' ? ' (Pagar Prêmio)' : 
                     resp === 'promover' ? ' (Promover)' : 
                     resp === 'pagar_premio_cancelar' ? ' (Pagar Prêmio e Cancelar)' : ' (Cancelar)';
    }
    
    return `Mês ${mesAtualNum} - ${subEtapa}${decisaoTexto} (Folha ${folhaAtual?.nomeFolha || '-'})`;
  };

  const folhasDisponiveis = Array.from(
    new Set(
      testes
        .map(obterFolhaAtualTeste)
        .filter((folha): folha is string => Boolean(folha))
    )
  ).sort((a, b) => converterFolhaParaNumero(a) - converterFolhaParaNumero(b));

  // Por que existe: Obtém a lista completa de todos os supervisores cadastrados nos testes.
  // Mantemos a lista de supervisores independente de outros filtros para evitar que
  // a escolha do supervisor seja apagada automaticamente ao alternar outros filtros (como a cobrança).
  const supervisoresDisponiveis = Array.from(
    new Set(
      testes
        .map((teste) => teste.supervisor_nome)
        .filter((nome): nome is string => Boolean(nome && nome.trim() && nome !== '-'))
    )
  ).sort((a, b) => a.localeCompare(b));

  // Filtra todos os testes com base no termo de busca (Nome ou RE), status selecionado, cobrança, supervisor e folha.
  // Por que existe: Centraliza a filtragem global no frontend, garantindo que os filtros
  // atuem sobre o total de registros do banco e não apenas na página exibida.
  const testesFiltrados = testes.filter((teste) => {
    // 1. Filtro de busca por texto (Nome ou RE)
    if (buscaAplicada.trim()) {
      const termo = buscaAplicada.toLowerCase();
      const nomeMatch = teste.colaborador_nome?.toLowerCase().includes(termo);
      const reMatch = teste.colaborador_re?.toLowerCase().includes(termo);
      if (!nomeMatch && !reMatch) return false;
    }

    // 2. Filtro por status
    if (statusFiltroAplicado && teste.status !== statusFiltroAplicado) {
      return false;
    }

    // 3. Filtro por status de cobrança (aplicável apenas a testes 'ativos')
    if (cobrancaFiltroAplicado !== 'todos') {
      if (teste.status !== 'ativo') return false;

      const folhas = obterInfoFolhas(teste.data_inicio);
      const premios = teste.historico_acoes.filter(a => a.acao === 'pagar_premio' || a.acao === 'pagar_premio_cancelar').length;
      const mesAtualNum = premios + 1;
      const folhaTeste = folhas.find(f => f.mesRef === mesAtualNum);

      if (!folhaTeste) return false;

      const numFolhaTeste = converterFolhaParaNumero(folhaTeste.nomeFolha);
      const numFolhaHoje = converterFolhaParaNumero(obterFolhaCalendarioReal());

      const jaRespondeu = teste.historico_acoes.some(a => a.acao === 'registrar_resposta' && a.mes_referencia === mesAtualNum);

      if (cobrancaFiltroAplicado === 'falta_resposta') {
        return numFolhaTeste <= numFolhaHoje && !jaRespondeu;
      }
      if (cobrancaFiltroAplicado === 'em_dia') {
        return numFolhaTeste > numFolhaHoje || jaRespondeu;
      }
    }

    // 4. Filtro por supervisor
    if (supervisorFiltroAplicado && teste.supervisor_nome !== supervisorFiltroAplicado) {
      return false;
    }

    // 5. Filtro por Etapa do Fluxo (Aguardando Resposta ou Aguardando Ação)
    if (etapaFiltroAplicado) {
      if (teste.status !== 'ativo') return false;

      const premios = teste.historico_acoes.filter(a => a.acao === 'pagar_premio' || a.acao === 'pagar_premio_cancelar').length;
      const mesAtualNum = premios + 1;
      const jaRespondeu = teste.historico_acoes.some(a => a.acao === 'registrar_resposta' && a.mes_referencia === mesAtualNum);

      if (etapaFiltroAplicado === 'aguardando_resposta' && jaRespondeu) {
        return false;
      }
      if (etapaFiltroAplicado === 'aguardando_acao' && !jaRespondeu) {
        return false;
      }
    }

    // 6. Filtro por Ação Aguardando (Pagar Prêmio, Promover, Cancelar)
    if (acaoPendenteFiltroAplicado) {
      if (teste.status !== 'ativo') return false;

      const premios = teste.historico_acoes.filter(a => a.acao === 'pagar_premio' || a.acao === 'pagar_premio_cancelar').length;
      const mesAtualNum = premios + 1;
      const acaoResposta = teste.historico_acoes.find(
        a => a.acao === 'registrar_resposta' && a.mes_referencia === mesAtualNum
      );

      if (!acaoResposta) return false;

      const resp = acaoResposta.resposta_supervisor;
      if (acaoPendenteFiltroAplicado === 'pagar_premio') {
        if (resp !== 'pagar_premio' && resp !== 'pagar_premio_cancelar') {
          return false;
        }
      } else if (acaoPendenteFiltroAplicado === 'cancelar') {
        if (resp !== 'cancelar' && resp !== 'pagar_premio_cancelar') {
          return false;
        }
      } else {
        if (resp !== acaoPendenteFiltroAplicado) {
          return false;
        }
      }
    }

    // 7. Filtro por folha
    if (folhaFiltroAplicado) {
      const folhaTeste = obterFolhaAtualTeste(teste);
      if (folhaTeste !== folhaFiltroAplicado) {
        return false;
      }
    }

    return true;
  });

  // Fatia a lista filtrada para exibir apenas os registros correspondentes à página atual.
  const testesPaginados = testesFiltrados.slice((currentPage - 1) * 10, currentPage * 10);

  // Calcula o total de páginas com base no número de registros que passaram pelos filtros.
  const totalPages = Math.ceil(testesFiltrados.length / 10) || 1;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Controle de Testes de Promoção</h1>
          <p className="text-sm text-neutral-500">Gestão mensal e ciclos operacionais de promoção de equipe</p>
        </div>
        <button
          onClick={() => setShowNovoModal(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 shadow-xs transition-all shadow-sm cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nova Solicitação
        </button>
      </div>

      {/* Painel de Filtros */}
      <form onSubmit={handleSearchSubmit} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Busca por Nome/RE */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider">Buscar Colaborador</label>
            <input
              type="text"
              placeholder="Digite o nome ou RE..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full px-4 py-2 text-sm bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-neutral-200 focus:outline-hidden"
            />
          </div>

          {/* Filtro Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider">Status</label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todos' },
                { value: 'pendente', label: 'Pendente de Aprovação' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'promovido', label: 'Promovido' },
                { value: 'cancelado', label: 'Cancelado' },
              ]}
              value={statusFiltro}
              onChange={setStatusFiltro}
              placeholder="Todos"
            />
          </div>

          {/* Filtro de Cobrança */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider block">Cobrança (Ativos)</label>
            <SearchableSelect
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'falta_resposta', label: 'Falta Resposta (Atual/Atrasados)' },
                { value: 'em_dia', label: 'Em Dia (Futuros)' },
              ]}
              value={cobrancaFiltro}
              onChange={(val) => setCobrancaFiltro(val as any)}
              placeholder="Todos"
            />
          </div>

          {/* Filtro por Supervisor */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider block">Supervisor</label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todos' },
                ...supervisoresDisponiveis.map((sup) => ({ value: sup, label: sup })),
              ]}
              value={supervisorFiltro}
              onChange={setSupervisorFiltro}
              placeholder="Todos"
            />
          </div>

          {/* Filtro Etapa do Fluxo */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider block">Etapa do Fluxo</label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todos' },
                { value: 'aguardando_resposta', label: 'Aguardando Resposta' },
                { value: 'aguardando_acao', label: 'Aguardando Ação' },
              ]}
              value={etapaFiltro}
              onChange={setEtapaFiltro}
              placeholder="Todos"
            />
          </div>

          {/* Filtro Ação Aguardando */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider block">Ação Aguardando</label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todos' },
                { value: 'pagar_premio', label: 'Pagar Prêmio' },
                { value: 'promover', label: 'Promover' },
                { value: 'cancelar', label: 'Cancelar' },
                { value: 'pagar_premio_cancelar', label: 'Pagar Prêmio e Cancelar' },
              ]}
              value={acaoPendenteFiltro}
              onChange={setAcaoPendenteFiltro}
              placeholder="Todos"
            />
          </div>

          {/* Filtro Folha do Teste */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider block">Folha do Teste</label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todas' },
                ...folhasDisponiveis.map((folha) => ({ value: folha, label: folha })),
              ]}
              value={folhaFiltro}
              onChange={setFolhaFiltro}
              placeholder="Todas"
            />
          </div>
        </div>

        {/* Botões de Filtro */}
        <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-850">
          <button
            type="button"
            onClick={handleClearFilters}
            className="py-2 px-4 text-sm font-semibold border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-500 rounded-lg transition-colors cursor-pointer"
          >
            Limpar Filtros
          </button>
          <button
            type="submit"
            className="py-2 px-6 text-sm font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-850 dark:hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
          >
            Filtrar
          </button>
        </div>
      </form>

      {/* Tabela de Dados */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-neutral-500">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-950 dark:text-white" />
            <span className="text-sm font-medium">Buscando testes de promoção...</span>
          </div>
        ) : testesFiltrados.length === 0 ? (
          <div className="text-center py-20 border-dashed border border-neutral-200 dark:border-neutral-850 rounded-2xl m-4">
            <AlertCircle className="h-10 w-10 text-neutral-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-neutral-750 dark:text-neutral-200">Nenhum teste de promoção encontrado.</p>
            <p className="text-xs text-neutral-400 mt-1">Experimente ajustar os filtros ou cadastrar uma nova solicitação.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-450 uppercase tracking-wider">
                  <th className="py-4 px-6">Colaborador</th>
                  <th className="py-4 px-6">Loja / Supervisão</th>
                  <th className="py-4 px-6">Data de Início</th>
                  <th className="py-4 px-6">Mês Atual</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-center">Folha Teste</th>
                  <th className="py-4 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-sm">
                {testesPaginados.map((teste) => (
                  <tr key={teste.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/10 transition-colors">
                    {/* Colaborador */}
                    <td className="py-4 px-6">
                      <div className="font-semibold text-neutral-900 dark:text-white">{teste.colaborador_nome}</div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-300">RE {teste.colaborador_re} • {teste.colaborador_cargo}</div>
                      {teste.cargo_teste && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                          Em teste para: {teste.cargo_teste}
                        </div>
                      )}
                    </td>

                    {/* Loja / Supervisor / Coordenador */}
                    <td className="py-4 px-6">
                      <div className="font-medium text-neutral-800 dark:text-neutral-200">{teste.loja_nome}</div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-300 mt-0.5">Sup: {teste.supervisor_nome}</div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-300">Coord: {teste.coordenador_nome || '-'}</div>
                    </td>

                    {/* Data de Início */}
                    <td className="py-4 px-6 text-neutral-600 dark:text-neutral-300">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-neutral-400" />
                        {formatDate(teste.data_inicio)}
                      </div>
                    </td>

                    {/* Mês Atual */}
                    <td className="py-4 px-6 font-semibold text-neutral-700 dark:text-neutral-300">
                      {getMesAtual(teste)}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1 items-start">
                        {getStatusBadge(teste.status)}
                        {teste.status === 'ativo' && (() => {
                          const folhas = obterInfoFolhas(teste.data_inicio);
                          const premios = teste.historico_acoes.filter(a => a.acao === 'pagar_premio' || a.acao === 'pagar_premio_cancelar').length;
                          const mesAtualNum = premios + 1;
                          const folhaTeste = folhas.find(f => f.mesRef === mesAtualNum);
                          if (!folhaTeste) return null;

                          const numFolhaTeste = converterFolhaParaNumero(folhaTeste.nomeFolha);
                          const numFolhaHoje = converterFolhaParaNumero(obterFolhaCalendarioReal());

                          const acaoResposta = teste.historico_acoes.find(
                            a => a.acao === 'registrar_resposta' && a.mes_referencia === mesAtualNum
                          );
                          const jaRespondeu = !!acaoResposta;
                          const faltaResposta = numFolhaTeste <= numFolhaHoje && !jaRespondeu;

                          if (faltaResposta) {
                            return (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/15 uppercase tracking-wider animate-pulse">
                                Falta Resposta
                              </span>
                            );
                          } else if (jaRespondeu) {
                            const resp = acaoResposta?.resposta_supervisor;
                            const respDisplay = resp === 'pagar_premio' ? 'Pagar Prêmio' :
                                                resp === 'promover' ? 'Promover' :
                                                resp === 'pagar_premio_cancelar' ? 'Pagar Prêmio e Cancelar' :
                                                resp === 'cancelar' ? 'Cancelar' : '';
                            return (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/15 uppercase tracking-wider whitespace-nowrap">
                                  Aguardando Ação
                                </span>
                                {respDisplay && (
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider border whitespace-nowrap ${
                                    resp === 'pagar_premio'
                                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/15'
                                      : resp === 'promover'
                                      ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/15'
                                      : resp === 'pagar_premio_cancelar'
                                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-455 border-rose-500/15'
                                      : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/15'
                                  }`}>
                                    Ação: {respDisplay}
                                  </span>
                                )}
                              </div>
                            );
                          } else {
                            return (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-neutral-100 dark:bg-neutral-850 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800 uppercase tracking-wider">
                                Em Dia
                              </span>
                            );
                          }
                        })()}
                      </div>
                    </td>

                    {/* Download Anexo */}
                    <td className="py-4 px-6 text-center">
                      {teste.anexo ? (
                        <button
                          onClick={() => handleViewAnexo(teste)}
                          title="Visualizar Folha de Teste"
                          className="inline-flex items-center justify-center p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                        >
                          <FileText className="h-4.5 w-4.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-400">-</span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="py-4 px-6 text-right">
                      {teste.status === 'pendente' && (
                        <button
                          onClick={() => handleOpenAcao(teste)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 transition-colors cursor-pointer"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Aprovar
                        </button>
                      )}
                      {teste.status === 'ativo' && (
                        <button
                          onClick={() => handleOpenAcao(teste)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-neutral-300 dark:border-neutral-750 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        >
                          <Settings className="h-3.5 w-3.5" />
                          Controlar
                        </button>
                      )}
                      {(teste.status === 'promovido' || teste.status === 'cancelado') && (
                        <button
                          onClick={() => handleOpenAcao(teste)}
                          className="text-xs font-semibold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                        >
                          Ver Histórico
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
            <span className="text-xs text-neutral-500">
              Mostrando <span className="font-semibold text-neutral-800 dark:text-neutral-200">{(currentPage - 1) * 10 + 1}</span> a{' '}
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {Math.min(currentPage * 10, testesFiltrados.length)}
              </span>{' '}
              de <span className="font-semibold text-neutral-800 dark:text-neutral-200">{testesFiltrados.length}</span> resultados
              {testesFiltrados.length !== testes.length && (
                <> (filtrados de um total de <span className="font-semibold text-neutral-800 dark:text-neutral-200">{testes.length}</span>)</>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 px-2">
                Pág. {currentPage} de {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal - Cadastro */}
      {showNovoModal && (
        <NovoTesteModal
          onClose={() => setShowNovoModal(false)}
          onSaveSuccess={handleSaveSuccess}
        />
      )}

      {/* Modal - Tomada de Decisão */}
      {showAcaoModal && selectedTeste && (
        <AcaoTesteModal
          teste={selectedTeste}
          onClose={() => setShowAcaoModal(false)}
          onSaveSuccess={handleSaveSuccess}
        />
      )}
    </div>
  );
}
