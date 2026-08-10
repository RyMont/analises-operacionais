import { useEffect, useState, useRef } from 'react';
import { 
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  CloudLightning,
  CheckCircle2
} from 'lucide-react';
import api, { getBackendPort } from '../api/client';
import { toast } from 'sonner';
import { Progress } from '../components/ui/progress';
import TerminosTable, { type TerminoItem } from '../components/Terminos/TerminosTable';
import DecisaoTerminoModal from '../components/Terminos/DecisaoTerminoModal';
import TerminosFilter from '../components/Terminos/TerminosFilter';

interface SyncProgressResponse {
  progress: number;
  message: string;
  status: 'completed' | 'running' | 'error' | 'pending';
}

/**
 * Página de Controle de Términos de Experiência.
 * 
 * Por que existe: Permite que a equipe de gestão de pessoas monitore a proximidade 
 * do encerramento dos contratos de experiência dos novos auxiliares (Fase 1 de 45 dias 
 * e Fase 2 de 90 dias). Facilita o registro rápido das decisões de RH delegando a exibição
 * da listagem, barra de filtros inteligentes e formulário de decisão para subcomponentes dedicados.
 */
export default function Terminos() {
  // Não há mais necessidade de armazenar estados anteriores em referências adicionais
  // para evitar problemas no fluxo de eventos de colagem (Ctrl-V) e digitação.

  // Estados de listagem e paginação
  const [terminos, setTerminos] = useState<TerminoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const lastQueryId = useRef(0);
  const isFirstRender = useRef(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount] = useState(0);

  // Estados dos Filtros
  const [busca, setBusca] = useState('');
  const [reFiltro, setReFiltro] = useState('');
  const [nomeFiltro, setNomeFiltro] = useState('');
  const [coordenador, setCoordenador] = useState('');
  const [statusGestao, setStatusGestao] = useState('');
  const [ordenacao, setOrdenacao] = useState('data');
  const [dataFiltro, setDataFiltro] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [etapaFiltro, setEtapaFiltro] = useState('');
  const [acaoFiltro, setAcaoFiltro] = useState('');
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Estados dos Modais
  const [showAcaoModal, setShowAcaoModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TerminoItem | null>(null);

  // Estados de Sincronização GeoVictoria (Relógio Ponto)
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /**
   * Busca a lista de prazos de término aplicando todos os filtros ativos.
   * 
   * Por que existe: Centraliza o envio dos parâmetros de filtro (etapa, coordenador, data, etc.)
   * para a API de término dos contratos de experiência, permitindo forçar o reset para a primeira página.
   */
  const fetchTerminos = async (resetPage = false) => {
    setLoading(true);
    setErrorMsg(null);
    const queryId = ++lastQueryId.current;
    const targetPage = resetPage ? 1 : currentPage;
    if (resetPage) {
      setCurrentPage(1);
    }

    const requestParams = {
      page: targetPage,
      search: busca || undefined,
      re: reFiltro || undefined,
      nome: nomeFiltro || undefined,
      coordenador: coordenador || undefined,
      status_gestao: statusGestao || undefined,
      ordenar: ordenacao || undefined,
      data_filtro: dataFiltro || undefined,
      data_fim: dataFim || undefined,
      etapa: etapaFiltro || undefined,
      acao: acaoFiltro || undefined,
    };

    try {
      const response = await api.get('/colaboradores/terminos/', {
        params: requestParams
      });

      if (queryId !== lastQueryId.current) return;

      if (response.data && response.data.results) {
        setTerminos(response.data.results);
        setCount(response.data.count);
        setTotalPages(Math.ceil(response.data.count / 10) || 1);
        if (response.data.sincronizado_em) {
          setSincronizadoEm(response.data.sincronizado_em);
        }
      } else {
        setTerminos(response.data || []);
        setCount(response.data ? response.data.length : 0);
        setTotalPages(1);
        if (response.data?.sincronizado_em) {
          setSincronizadoEm(response.data.sincronizado_em);
        }
      }
    } catch (err) {
      if (queryId !== lastQueryId.current) return;
      console.error('Erro ao buscar términos:', err);
      setErrorMsg('Não foi possível carregar os prazos de término.');
    } finally {
      if (queryId === lastQueryId.current) {
        setLoading(false);
      }
    }
  };

  // Por que existe: Recarrega a busca a partir da página inicial sempre que a ordenação
  // ou o gatilho de busca explícito (fetchTrigger) sofrer alterações por parte do usuário.
  // Todos os filtros de seleção e data só são aplicados ao clicar em Buscar.
  useEffect(() => {
    fetchTerminos(true);
  }, [
    ordenacao,
    fetchTrigger
  ]);

  // Por que existe: Recarrega os dados preservando o filtro atual quando o usuário navegar entre as páginas.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchTerminos();
  }, [currentPage]);

  // Trata o início da sincronização com GeoVictoria em tempo real (Polling)
  const handleStartSyncGeoVictoria = async () => {
    setSyncLoading(true);
    setSyncProgress(0);
    setSyncMessage('Iniciando sincronização...');
    setShowProgressBar(true);
    setErrorMsg(null);

    try {
      const params: any = {};
      if (busca) params.search = busca;
      if (reFiltro) params.re = reFiltro;
      if (nomeFiltro) params.nome = nomeFiltro;
      if (coordenador) params.coordenador = coordenador;
      if (statusGestao) params.status_gestao = statusGestao;
      if (dataFiltro) params.data_filtro = dataFiltro;
      if (dataFim) params.data_fim = dataFim;

      const response = await api.post('/colaboradores/sync-geovictoria/', null, { params });
      
      if (response.data.status === 'started') {
        const intervalId = setInterval(async () => {
          try {
            const progressRes = await api.get<SyncProgressResponse>('/colaboradores/sync-geovictoria-progress/');
            const data = progressRes.data;
            
            setSyncProgress(data.progress);
            setSyncMessage(data.message);

            if (data.status === 'completed') {
              clearInterval(intervalId);
              setSyncLoading(false);
              setSyncMessage('Concluído com sucesso!');
              toast.success('Sincronização de faltas e atestados do GeoVictoria concluída!');
              setTimeout(() => {
                setShowProgressBar(false);
                setFetchTrigger(prev => prev + 1);
              }, 1200);
            } else if (data.status === 'error') {
              clearInterval(intervalId);
              setSyncLoading(false);
              setErrorMsg('Erro reportado durante a sincronização de pontos.');
              toast.error('Erro na sincronização de pontos.');
              setTimeout(() => setShowProgressBar(false), 2000);
            }
          } catch (pollErr) {
            console.error('Erro no polling do progresso:', pollErr);
            clearInterval(intervalId);
            setSyncLoading(false);
            setShowProgressBar(false);
          }
        }, 1000);
      } else {
        setSyncLoading(false);
        setShowProgressBar(false);
      }
    } catch (err) {
      console.error('Erro ao disparar sync da GeoVictoria:', err);
      setSyncLoading(false);
      setShowProgressBar(false);
      setErrorMsg('Não foi possível se conectar à fila de sincronização.');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFetchTrigger(prev => prev + 1);
  };

  const handleClearFilters = () => {
    setBusca('');
    setReFiltro('');
    setNomeFiltro('');
    setCoordenador('');
    setStatusGestao('');
    setOrdenacao('data');
    setDataFiltro('');
    setDataFim('');
    setEtapaFiltro('');
    setAcaoFiltro('');

    setFetchTrigger(prev => prev + 1);
  };

  // Abre modal para registrar uma decisão de RH
  const handleOpenAcao = (item: TerminoItem) => {
    setSelectedItem(item);
    setErrorMsg(null);
    setShowAcaoModal(true);
  };

  const handleSaveSuccess = () => {
    setShowAcaoModal(false);
    setFetchTrigger(prev => prev + 1);
  };

  // Trata a exportação dos dados em lote para arquivo Excel (.xlsx)
  const handleExportExcel = () => {
    const params = new URLSearchParams();
    if (busca) params.append('search', busca);
    if (reFiltro) params.append('re', reFiltro);
    if (nomeFiltro) params.append('nome', nomeFiltro);
    if (coordenador) params.append('coordenador', coordenador);
    if (statusGestao) params.append('status_gestao', statusGestao);
    if (dataFiltro) params.append('data_filtro', dataFiltro);
    if (dataFim) params.append('data_fim', dataFim);
    if (etapaFiltro) params.append('etapa', etapaFiltro);
    if (acaoFiltro) params.append('acao', acaoFiltro);
    
    // Por que existe: Utiliza o hostname dinâmico do navegador para garantir que a requisição de exportação funcione em qualquer máquina que esteja acessando o frontend.
    const url = `http://${window.location.hostname}:${getBackendPort()}/colaboradores/terminos/exportar/?${params.toString()}`;
    window.open(url, '_blank');
  };

  // Calcula e formata a última atualização de relógio com base no retorno da API ou nos itens carregados
  const getUltimaAtualizacaoCache = () => {
    if (sincronizadoEm) return sincronizadoEm;
    if (!terminos.length) return null;
    const datas = terminos
      .map(item => item.colaborador.geovictoria_atualizado_em)
      .filter(Boolean) as string[];
    
    if (!datas.length) return null;
    const maxData = datas.sort().reverse()[0];
    if (maxData.includes('/')) return maxData;
    const [year, month, day] = maxData.split('-');
    return `${day}/${month}/${year}`;
  };

  const cacheDate = getUltimaAtualizacaoCache();

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Términos de Experiência</h1>
          <p className="text-sm text-neutral-500">Acompanhamento de vencimentos contratuais</p>
        </div>
        <button
          onClick={handleExportExcel}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-green-700 bg-green-900/10 hover:bg-green-900/20 text-green-500 rounded-lg text-sm font-semibold transition-all shadow-sm"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar para Excel
        </button>
      </div>

      {/* Seção Sincronização & Ordenação */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-sm">
        <button
          onClick={handleStartSyncGeoVictoria}
          disabled={syncLoading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 shadow-xs transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CloudLightning className="h-4 w-4" />
          )}
          Sincronizar GeoVictoria
        </button>

        <div className="text-xs text-neutral-500 flex items-center gap-1.5">
          {cacheDate ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Pontos sincronizados em: <span className="font-bold text-neutral-900 dark:text-neutral-100">{cacheDate}</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Sem dados de sincronização coletados no lote atual.
            </>
          )}
        </div>
      </div>

      {/* Barra de Progresso da Sincronização */}
      {showProgressBar && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs p-5 shadow-sm space-y-2 animate-fade-in">
          <Progress value={syncProgress} className="w-full flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs w-full">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">{syncMessage}</span>
            </div>
          </Progress>
        </div>
      )}

      {/* Painel de Filtros de Busca */}
      <TerminosFilter
        reFiltro={reFiltro}
        setReFiltro={setReFiltro}
        nomeFiltro={nomeFiltro}
        setNomeFiltro={setNomeFiltro}
        coordenador={coordenador}
        setCoordenador={setCoordenador}
        statusGestao={statusGestao}
        setStatusGestao={setStatusGestao}
        dataFiltro={dataFiltro}
        setDataFiltro={setDataFiltro}
        dataFim={dataFim}
        setDataFim={setDataFim}
        etapaFiltro={etapaFiltro}
        setEtapaFiltro={setEtapaFiltro}
        acaoFiltro={acaoFiltro}
        setAcaoFiltro={setAcaoFiltro}
        onSubmit={handleSearchSubmit}
        onClear={handleClearFilters}
        fetchTrigger={fetchTrigger}
      />

      {/* Erro de comunicação de listagem */}
      {errorMsg && !showAcaoModal && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm flex gap-3 items-center">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Listagem em Tabela */}
      <TerminosTable
        terminos={terminos}
        loading={loading}
        currentPage={currentPage}
        totalPages={totalPages}
        count={count}
        setCurrentPage={setCurrentPage}
        onOpenAcao={handleOpenAcao}
        ordenacao={ordenacao}
        setOrdenacao={setOrdenacao}
      />

      {/* Modal de Registro de Decisão */}
      {showAcaoModal && selectedItem && (
        <DecisaoTerminoModal
          item={selectedItem}
          onClose={() => setShowAcaoModal(false)}
          onSaveSuccess={handleSaveSuccess}
        />
      )}
    </div>
  );
}
