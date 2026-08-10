import { useEffect, useState, useRef } from 'react';
import { Loader2, Users2, UserX2, Layers, AlertCircle } from 'lucide-react';
import api, { getBackendPort } from '../api/client';
import { Progress, ProgressValue } from '../components/ui/progress';
import ColaboradoresFilter from '../components/Colaboradores/ColaboradoresFilter';
import ColaboradoresTable, { type Colaborador } from '../components/Colaboradores/ColaboradoresTable';
import DetalhesColaboradorModal from '../components/Colaboradores/DetalhesColaboradorModal';

/**
 * Página principal de Controle e Auditoria de Colaboradores.
 * 
 * Por que existe: Consolida os dados e orquestra a comunicação com o backend
 * para listar colaboradores, gerenciar sincronizações de lojas com a GeoVictoria
 * e aplicar filtros dinâmicos de auditoria. Delega a exibição e os formulários de
 * filtro para subcomponentes menores, mantendo o arquivo de página limpo e sustentável.
 */
export default function Colaboradores() {
  const [activeTab, setActiveTab] = useState<'ativos' | 'demitidos'>('ativos');

  // Estados da listagem de colaboradores e paginação
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const lastQueryId = useRef(0);
  const isFirstRender = useRef(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount] = useState(0);

  // Estados dos Filtros
  const [reBusca, setReBusca] = useState('');
  const [cpfBusca, setCpfBusca] = useState('');
  const [nomeBusca, setNomeBusca] = useState('');
  const [cargoFiltro, setCargoFiltro] = useState('');
  const [lojaFiltro, setLojaFiltro] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [statusGestaoFiltro, setStatusGestaoFiltro] = useState('');
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Estados dos Chips de auditoria rápida
  const [statusDivergenteQuery, setStatusDivergenteQuery] = useState('');
  const [funcaoDivergenteQuery, setFuncaoDivergenteQuery] = useState('');
  const [divergenteQuery, setDivergenteQuery] = useState('');
  const [soTotvsQuery, setSoTotvsQuery] = useState('');

  // Modal de visualização da ficha detalhada
  const [selectedColab, setSelectedColab] = useState<Colaborador | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados de sincronização com a GeoVictoria
  const [syncingLojas, setSyncingLojas] = useState(false);
  const [syncLojasProgress, setSyncLojasProgress] = useState<number | null>(null);
  const [syncLojasMessage, setSyncLojasMessage] = useState('');
  const [syncLojasStatus, setSyncLojasStatus] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');

  // Busca a lista de colaboradores aplicando todos os filtros ativos
  const fetchColaboradores = async (resetPage = false) => {
    setLoading(true);
    setErrorMsg(null);
    const queryId = ++lastQueryId.current;
    const targetPage = resetPage ? 1 : currentPage;
    if (resetPage) {
      setCurrentPage(1);
    }

    const endpoint = activeTab === 'ativos' ? '/colaboradores/' : '/colaboradores/demitidos/';

    try {
      const response = await api.get(endpoint, {
        params: {
          page: targetPage,
          re: reBusca || undefined,
          cpf: cpfBusca || undefined,
          nome: nomeBusca || undefined,
          cargo: cargoFiltro || undefined,
          loja: lojaFiltro || undefined,
          status: activeTab === 'ativos' ? (statusFiltro || undefined) : undefined,
          status_gestao: statusGestaoFiltro || undefined,
          status_divergente: statusDivergenteQuery || undefined,
          funcao_divergente: activeTab === 'ativos' ? (funcaoDivergenteQuery || undefined) : undefined,
          divergente: activeTab === 'ativos' ? (divergenteQuery || undefined) : undefined,
          so_totvs: activeTab === 'ativos' ? (soTotvsQuery || undefined) : undefined,
        }
      });

      if (queryId !== lastQueryId.current) return;

      if (response.data && response.data.results) {
        setColaboradores(response.data.results);
        setCount(response.data.count);
        setTotalPages(Math.ceil(response.data.count / 10) || 1);
      } else {
        setColaboradores(response.data || []);
        setCount(response.data ? response.data.length : 0);
        setTotalPages(1);
      }
    } catch (err) {
      if (queryId !== lastQueryId.current) return;
      console.error('Erro ao buscar colaboradores:', err);
      setErrorMsg('Erro ao conectar ao servidor de dados dos colaboradores.');
    } finally {
      if (queryId === lastQueryId.current) {
        setLoading(false);
      }
    }
  };

  // Por que existe: Recarrega a listagem a partir da página inicial sempre que abas, 
  // chips rápidos de auditoria ou o gatilho de busca explícito (fetchTrigger) sofrerem alterações.
  // Filtros em seletores dropdown adicionais só são aplicados ao clicar em Buscar.
  useEffect(() => {
    fetchColaboradores(true);
  }, [
    activeTab,
    statusDivergenteQuery,
    funcaoDivergenteQuery,
    divergenteQuery,
    soTotvsQuery,
    fetchTrigger
  ]);

  // Efeito reativo para recarregar se mudar de página
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchColaboradores();
  }, [currentPage]);

  // Monitoramento periódico do progresso da sincronização de lojas em background
  const watchSyncLojasProgress = () => {
    const intervalId = window.setInterval(async () => {
      try {
        const response = await api.get('/colaboradores/sync-lojas-geovictoria-progress/');
        if (response.data) {
          const { progress, message, status: statusVal } = response.data;
          
          if (statusVal === 'not_found') {
            window.clearInterval(intervalId);
            setSyncingLojas(false);
            return;
          }

          setSyncLojasProgress(progress);
          setSyncLojasMessage(message);
          setSyncLojasStatus(statusVal);

          if (statusVal === 'completed' || statusVal === 'error') {
            window.clearInterval(intervalId);
            setSyncingLojas(false);
            fetchColaboradores();
            setFetchTrigger(prev => prev + 1);
          }
        }
      } catch (err) {
        console.error('Erro ao consultar progresso do sync:', err);
        window.clearInterval(intervalId);
        setSyncingLojas(false);
        setSyncLojasStatus('error');
        setSyncLojasMessage('Erro ao consultar o progresso da sincronização.');
      }
    }, 1500);
  };

  // Dispara a sincronização de lojas da GeoVictoria no backend
  const handleSyncLojas = async () => {
    setSyncingLojas(true);
    setSyncLojasStatus('processing');
    setSyncLojasProgress(0);
    setSyncLojasMessage('Iniciando sincronização de lojas...');

    try {
      const response = await api.post('/colaboradores/sync-lojas-geovictoria/', {
        loja: lojaFiltro || "",
        re: reBusca || "",
        cpf: cpfBusca || "",
        nome: nomeBusca || "",
        cargo: cargoFiltro || "",
        status: statusFiltro || "",
        status_gestao: statusGestaoFiltro || "",
        divergente: divergenteQuery || "",
        funcao_divergente: funcaoDivergenteQuery || "",
        so_totvs: soTotvsQuery || "",
        status_divergente: statusDivergenteQuery || ""
      });

      if (response.data && response.data.status === 'started') {
        setSyncLojasProgress(1);
        setSyncLojasMessage(response.data.message || 'Sincronização iniciada.');
        watchSyncLojasProgress();
      } else {
        throw new Error(response.data.error || 'Não foi possível iniciar a sincronização.');
      }
    } catch (err: any) {
      console.error('Erro ao iniciar sincronização de lojas:', err);
      setSyncLojasStatus('error');
      setSyncLojasMessage(err.response?.data?.error || err.message || 'Erro ao iniciar a sincronização.');
      setSyncingLojas(false);
    }
  };

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFetchTrigger(prev => prev + 1);
  };

  const handleClearFilters = () => {
    setReBusca('');
    setCpfBusca('');
    setNomeBusca('');
    setCargoFiltro('');
    setLojaFiltro('');
    setStatusFiltro('');
    setStatusGestaoFiltro('');
    
    // Reseta chips de auditoria
    setStatusDivergenteQuery('');
    setFuncaoDivergenteQuery('');
    setDivergenteQuery('');
    setSoTotvsQuery('');
    
    setFetchTrigger(prev => prev + 1);
  };

  const handleOpenDetail = (colab: Colaborador) => {
    setSelectedColab(colab);
    setShowDetailModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Auditoria de Colaboradores</h1>
        <p className="text-sm text-neutral-500">Gestão e acompanhamento das bases do TOTVS vs. Planilhas internas</p>
      </div>

      {/* Navegação por Abas (Tabs) */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 flex gap-4">
        <button
          onClick={() => {
            setActiveTab('ativos');
            // Ao mudar de aba, reseta os chips rápidos
            setStatusDivergenteQuery('');
            setFuncaoDivergenteQuery('');
            setDivergenteQuery('');
            setSoTotvsQuery('');
          }}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'ativos'
              ? 'border-primary text-primary'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Users2 className="h-4 w-4" />
          Colaboradores Ativos
        </button>
        <button
          onClick={() => {
            setActiveTab('demitidos');
            // Ao mudar de aba, reseta os chips rápidos
            setStatusDivergenteQuery('');
            setFuncaoDivergenteQuery('');
            setDivergenteQuery('');
            setSoTotvsQuery('');
          }}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'demitidos'
              ? 'border-primary text-primary'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <UserX2 className="h-4 w-4" />
          Demitidos
        </button>
      </div>

      {/* Componente de Filtro e Auditoria Rápida */}
      <ColaboradoresFilter
        activeTab={activeTab}
        reBusca={reBusca}
        setReBusca={setReBusca}
        cpfBusca={cpfBusca}
        setCpfBusca={setCpfBusca}
        nomeBusca={nomeBusca}
        setNomeBusca={setNomeBusca}
        cargoFiltro={cargoFiltro}
        setCargoFiltro={setCargoFiltro}
        lojaFiltro={lojaFiltro}
        setLojaFiltro={setLojaFiltro}
        statusFiltro={statusFiltro}
        setStatusFiltro={setStatusFiltro}
        statusGestaoFiltro={statusGestaoFiltro}
        setStatusGestaoFiltro={setStatusGestaoFiltro}
        statusDivergenteQuery={statusDivergenteQuery}
        setStatusDivergenteQuery={setStatusDivergenteQuery}
        funcaoDivergenteQuery={funcaoDivergenteQuery}
        setFuncaoDivergenteQuery={setFuncaoDivergenteQuery}
        divergenteQuery={divergenteQuery}
        setDivergenteQuery={setDivergenteQuery}
        soTotvsQuery={soTotvsQuery}
        setSoTotvsQuery={setSoTotvsQuery}
        onSubmit={handleFilterSubmit}
        onClear={handleClearFilters}
        fetchTrigger={fetchTrigger}
      />

      {/* Painel de Sincronização de Lojas (GeoVictoria) */}
      {activeTab === 'ativos' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-neutral-850 dark:text-neutral-200 flex items-center gap-2">
                <Layers className="h-4 w-4 text-neutral-500" />
                Sincronização de Lojas — GeoVictoria
              </h3>
              <p className="text-xs text-neutral-500">
                Atualiza a Loja GeoVictoria dos colaboradores ativos usando RE e centro de custo da API do relógio de ponto.
              </p>
            </div>
            
            <button
              type="button"
              disabled={syncingLojas}
              onClick={handleSyncLojas}
              className={`px-5 py-2.5 rounded-full text-xs font-bold border transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                syncingLojas
                  ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed dark:bg-neutral-800 dark:text-neutral-500 dark:border-neutral-700'
                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-150 dark:hover:bg-neutral-800'
              }`}
            >
              {syncingLojas ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Layers className="h-3.5 w-3.5" />
              )}
              Sincronizar lojas GeoVictoria
            </button>
          </div>

          {syncLojasStatus !== 'idle' && (
            <div className="pt-3 space-y-2 border-t border-neutral-100 dark:border-neutral-850">
              <Progress value={syncLojasProgress || 0} className="w-full flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs w-full">
                  <span className="font-semibold text-neutral-600 dark:text-neutral-450">
                    {syncLojasMessage}
                  </span>
                  <ProgressValue className="font-bold text-neutral-850 dark:text-neutral-200" />
                </div>
              </Progress>

              {syncLojasStatus === 'completed' && (
                <div className="text-xs pt-1.5 flex gap-2">
                  <span className="text-neutral-500">Ação pós-sync:</span>
                  <a 
                    // Por que existe: Direciona o download do CSV para o endereço correto da máquina host (seja localhost ou o IP local) para não quebrar em outras máquinas.
                    href={`http://${window.location.hostname}:${getBackendPort()}/colaboradores/sync-lojas-geovictoria/pendencias/todas/`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-neutral-900 hover:underline dark:text-neutral-100"
                  >
                    Baixar relatório de pendências da sincronização (CSV)
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Exibição de Erros */}
      {errorMsg && !showDetailModal && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm flex gap-3 items-center">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabela de Colaboradores */}
      <ColaboradoresTable
        activeTab={activeTab}
        colaboradores={colaboradores}
        loading={loading}
        currentPage={currentPage}
        totalPages={totalPages}
        count={count}
        setCurrentPage={setCurrentPage}
        onOpenDetail={handleOpenDetail}
      />

      {/* Modal Ficha do Colaborador (Detalhes completos) */}
      {showDetailModal && selectedColab && (
        <DetalhesColaboradorModal
          colab={selectedColab}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </div>
  );
}
