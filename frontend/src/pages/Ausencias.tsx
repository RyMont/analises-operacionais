import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
  CalendarX, 
  Search, 
  AlertTriangle, 
  TrendingUp, 
  User, 
  MapPin, 
  CalendarDays, 
  ChevronDown, 
  ChevronUp, 
  Loader2, 
  SlidersHorizontal,
  CheckCircle2,
  AlertOctagon,
  FileText
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../api/client';
import SearchableSelect from '../components/ui/searchable-select';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';

interface OcorrenciaDetalhe {
  data: string;
  descricao: string;
}

interface ColaboradorAusencia {
  id: number;
  re: string;
  nome: string;
  data_admissao: string | null;
  loja_nome: string;
  coordenador_nome: string;
  sub_regiao: string;
  status_gestao: string;
  faltas: number;
  atestados: number;
  soma: number;
  suspensoes: number;
  quantidade: number;
  acima_da_media: boolean;
  top_30_percent: boolean;
  detalhes: OcorrenciaDetalhe[];
}

interface FiltroOpcoes {
  lojas: { id: string; nome_referencia: string }[];
  coordenadores: string[];
  regioes: string[];
  status_gestao: string[];
}

interface StatsAusencias {
  total_colaboradores_ativos: number;
  total_ausencias: number;
  media_geral: number;
  colaboradores_acima_media: number;
  colaboradores_acima_media_percent: number;
  colaboradores_top_30: number;
  limite_top_30?: number;
  colaboradores_suspensos?: number;
}

export default function Ausencias() {
  // Abas: 'faltas', 'atestados', 'soma', 'suspensoes'
  const [activeTab, setActiveTab] = useState<'faltas' | 'atestados' | 'soma' | 'suspensoes'>('faltas');

  // Filtros de busca
  const [filtroLoja, setFiltroLoja] = useState('');
  const [filtroCoordenador, setFiltroCoordenador] = useState('');
  const [filtroRegiao, setFiltroRegiao] = useState('');
  const [filtroStatusGestao, setFiltroStatusGestao] = useState('');
  const [buscaText, setBuscaText] = useState('');
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Filtro rápido de tabela para Faltas, Atestados e Soma: 'todos' | 'acima_media' | 'top_30'
  const [filtroTabela, setFiltroTabela] = useState<'todos' | 'acima_media' | 'top_30'>('todos');

  // Opções dinâmicas carregadas da API
  const [filtroOpcoes, setFiltroOpcoes] = useState<FiltroOpcoes>({
    lojas: [],
    coordenadores: [],
    regioes: [],
    status_gestao: []
  });

  // Dados retornados da API
  const [dadosAusencias, setDadosAusencias] = useState<ColaboradorAusencia[]>([]);
  const [stats, setStats] = useState<StatsAusencias | null>(null);

  // Estados de Controle de UI
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Paginação no Frontend
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const lastQueryId = useRef(0);

  // Carrega opções de filtros dinâmicos na montagem
  useEffect(() => {
    const fetchFiltros = async () => {
      try {
        setLoadingFilters(true);
        const response = await api.get('/colaboradores/ausencias/analise/filtro-opcoes/');
        setFiltroOpcoes(response.data);
      } catch (err) {
        console.error('Erro ao buscar filtros:', err);
        setErrorMsg('Erro ao obter os filtros dinâmicos de ausências.');
      } finally {
        setLoadingFilters(false);
      }
    };
    fetchFiltros();
  }, []);

  // Carrega dados agregados/detalhados conforme abas e filtros mudam
  useEffect(() => {
    if (loadingFilters) return;

    const fetchDadosAnalise = async () => {
      setLoadingData(true);
      setErrorMsg(null);
      const queryId = ++lastQueryId.current;

      try {
        const params = new URLSearchParams();
        params.append('aba', activeTab);
        params.append('data_inicio', dataInicio);
        params.append('data_fim', dataFim);
        if (filtroLoja) params.append('loja', filtroLoja);
        if (filtroCoordenador) params.append('coordenador', filtroCoordenador);
        if (filtroRegiao) params.append('regiao', filtroRegiao);
        if (filtroStatusGestao) params.append('status_gestao', filtroStatusGestao);
        if (buscaText.trim()) params.append('search', buscaText.trim());

        const response = await api.get(`/colaboradores/ausencias/analise/?${params.toString()}`);
        
        if (queryId === lastQueryId.current) {
          setDadosAusencias(response.data.results || []);
          setStats(response.data.stats || null);
          setExpandedRows({});
          setCurrentPage(1);
        }
      } catch (err) {
        console.error('Erro ao buscar dados de análise de ausências:', err);
        if (queryId === lastQueryId.current) {
          setErrorMsg('Não foi possível carregar os dados da análise.');
        }
      } finally {
        if (queryId === lastQueryId.current) {
          setLoadingData(false);
        }
      }
    };

    fetchDadosAnalise();
  }, [activeTab, fetchTrigger, loadingFilters]);

  // Submete busca
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFetchTrigger(prev => prev + 1);
  };

  // Limpa filtros
  const handleLimparFiltros = () => {
    setFiltroLoja('');
    setFiltroCoordenador('');
    setFiltroRegiao('');
    setFiltroStatusGestao('');
    setBuscaText('');
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setDataInicio(d.toISOString().split('T')[0]);
    setDataFim(new Date().toISOString().split('T')[0]);
    setFiltroTabela('todos');
    setFetchTrigger(prev => prev + 1);
  };

  // Exportar visualização atual para Excel
  const handleExportarExcel = () => {
    const params = new URLSearchParams();
    params.append('aba', activeTab);
    params.append('data_inicio', dataInicio);
    params.append('data_fim', dataFim);
    if (filtroLoja) params.append('loja', filtroLoja);
    if (filtroCoordenador) params.append('coordenador', filtroCoordenador);
    if (filtroRegiao) params.append('regiao', filtroRegiao);
    if (filtroStatusGestao) params.append('status_gestao', filtroStatusGestao);
    if (buscaText.trim()) params.append('search', buscaText.trim());
    if (activeTab !== 'suspensoes') {
      params.append('filtro_tabela', filtroTabela);
    }

    const url = `http://${window.location.hostname}:8001/colaboradores/ausencias/analise/exportar/?${params.toString()}`;
    window.open(url, '_blank');
  };

  // Linhas filtradas com base no filtro rápido da tabela (Exibir: Todos | Acima da Média | Top 30%)
  const tabelaDadosFiltrados = useMemo(() => {
    if (activeTab === 'suspensoes') return dadosAusencias;

    return dadosAusencias.filter(item => {
      if (filtroTabela === 'acima_media') return item.acima_da_media;
      if (filtroTabela === 'top_30') return item.top_30_percent;
      return true;
    });
  }, [dadosAusencias, filtroTabela, activeTab]);

  // Paginação
  const paginatedData = useMemo(() => {
    const offset = (currentPage - 1) * itemsPerPage;
    return tabelaDadosFiltrados.slice(offset, offset + itemsPerPage);
  }, [tabelaDadosFiltrados, currentPage]);

  const totalPages = Math.ceil(tabelaDadosFiltrados.length / itemsPerPage) || 1;

  // Alternar expansão de linha
  const toggleRow = (id: string | number) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const formatarData = (dataStr: string) => {
    if (!dataStr) return '-';
    const partes = dataStr.split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataStr;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
          <CalendarX className="h-6 w-6 text-rose-500" />
          Análise de Ausências
        </h1>
        <p className="text-sm text-neutral-500 font-medium">
          Métricas consolidadas de faltas, atestados médicos e suspensões dos colaboradores de campo
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm flex gap-3 items-center">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Formulário de Filtros */}
      <form onSubmit={handleSearchSubmit} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-850 pb-3">
          <h2 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-neutral-400" />
            Filtros Globais
          </h2>
        </div>

        {/* Linha 1: Dropdowns principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Loja */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Loja</label>
            {loadingFilters ? (
              <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
            ) : (
              <SearchableSelect
                options={[
                  { value: "", label: "Todas as Lojas" },
                  ...filtroOpcoes.lojas.map(l => ({ value: l.id, label: l.nome_referencia }))
                ]}
                value={filtroLoja}
                onChange={setFiltroLoja}
                placeholder="Selecionar Lojas..."
                multiple={true}
              />
            )}
          </div>

          {/* Coordenador */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Coordenador</label>
            {loadingFilters ? (
              <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
            ) : (
              <SearchableSelect
                options={[
                  { value: "", label: "Todos os Coordenadores" },
                  ...filtroOpcoes.coordenadores.map(c => ({ value: c, label: c }))
                ]}
                value={filtroCoordenador}
                onChange={setFiltroCoordenador}
                placeholder="Selecionar Coordenador..."
                multiple={true}
              />
            )}
          </div>

          {/* Região (UF) */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Região (UF)</label>
            {loadingFilters ? (
              <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
            ) : (
              <SearchableSelect
                options={[
                  { value: "", label: "Todas as Regiões" },
                  ...filtroOpcoes.regioes.map(r => ({ value: r, label: r }))
                ]}
                value={filtroRegiao}
                onChange={setFiltroRegiao}
                placeholder="Selecionar Região..."
                multiple={true}
              />
            )}
          </div>

          {/* Status Gestão */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Status Gestão</label>
            {loadingFilters ? (
              <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
            ) : (
              <SearchableSelect
                options={[
                  { value: "", label: "Todos os Status" },
                  ...(filtroOpcoes.status_gestao || []).map(s => ({ value: s, label: s }))
                ]}
                value={filtroStatusGestao}
                onChange={setFiltroStatusGestao}
                placeholder="Selecionar Status..."
                multiple={true}
              />
            )}
          </div>
        </div>

        {/* Linha 2: Busca Livre e Período */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Busca Textual */}
          <div className="space-y-1.5 md:col-span-1">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Busca Livre</label>
            <div className="relative">
              <input
                type="text"
                value={buscaText}
                onChange={(e) => setBuscaText(e.target.value)}
                placeholder="Nome ou RE..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder-neutral-400"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            </div>
          </div>

          {/* Período (DatePickers customizados lado a lado) */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Período</label>
            <div className="flex gap-2">
              {/* Data Início */}
              <div className="w-1/2">
                <Popover>
                  <PopoverTrigger className="w-full justify-start text-left font-medium h-9 text-neutral-750 dark:text-neutral-100 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-350 dark:hover:border-neutral-700 rounded-lg px-3 text-xs inline-flex items-center hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-all focus:outline-none">
                    <CalendarDays className="mr-2 h-4 w-4 text-neutral-400 dark:text-neutral-500 shrink-0" />
                    {dataInicio ? (
                      format(parseISO(dataInicio), 'dd/MM/yyyy')
                    ) : (
                      <span className="text-neutral-400">Selecione a data</span>
                    )}
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg" align="start">
                    <Calendar
                      mode="single"
                      selected={dataInicio ? parseISO(dataInicio) : undefined}
                      onSelect={(date) => {
                        setDataInicio(date ? format(date, 'yyyy-MM-dd') : '');
                      }}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Data Fim */}
              <div className="w-1/2">
                <Popover>
                  <PopoverTrigger className="w-full justify-start text-left font-medium h-9 text-neutral-750 dark:text-neutral-100 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-350 dark:hover:border-neutral-700 rounded-lg px-3 text-xs inline-flex items-center hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-all focus:outline-none">
                    <CalendarDays className="mr-2 h-4 w-4 text-neutral-400 dark:text-neutral-500 shrink-0" />
                    {dataFim ? (
                      format(parseISO(dataFim), 'dd/MM/yyyy')
                    ) : (
                      <span className="text-neutral-400">Selecione a data</span>
                    )}
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg" align="start">
                    <Calendar
                      mode="single"
                      selected={dataFim ? parseISO(dataFim) : undefined}
                      onSelect={(date) => {
                        setDataFim(date ? format(date, 'yyyy-MM-dd') : '');
                      }}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-100 dark:border-neutral-850 pt-3">
          <button
            type="button"
            onClick={handleLimparFiltros}
            className="px-4 py-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800 transition-colors"
          >
            Limpar Filtros
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-sm transition-colors"
          >
            Filtrar Painel
          </button>
        </div>
      </form>

      {/* Abas */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800">
        <button
          onClick={() => setActiveTab('faltas')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 -mb-[2px] ${
            activeTab === 'faltas'
              ? 'border-violet-600 text-violet-600 dark:text-violet-400 font-extrabold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          Faltas
        </button>
        <button
          onClick={() => setActiveTab('atestados')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 -mb-[2px] ${
            activeTab === 'atestados'
              ? 'border-violet-600 text-violet-600 dark:text-violet-400 font-extrabold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          Atestados
        </button>
        <button
          onClick={() => setActiveTab('soma')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 -mb-[2px] ${
            activeTab === 'soma'
              ? 'border-violet-600 text-violet-600 dark:text-violet-400 font-extrabold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          Faltas + Atestados
        </button>
        <button
          onClick={() => setActiveTab('suspensoes')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 -mb-[2px] ${
            activeTab === 'suspensoes'
              ? 'border-violet-600 text-violet-600 dark:text-violet-400 font-extrabold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          Suspensões
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activeTab !== 'suspensoes' ? (
          <>
            {/* Card 1: Total Ocorrências */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[110px]">
              <div>
                <span className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Total Ocorrências</span>
                <span className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-50 mt-1 block">
                  {loadingData ? <span className="h-8 w-12 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md block mt-1" /> : stats?.total_ausencias ?? 0}
                </span>
              </div>
              <p className="text-[10px] text-neutral-450 mt-2">Ocorrências registradas no período selecionado</p>
            </div>

            {/* Card 2: Média por Colaborador */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[110px]">
              <div>
                <span className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Média do Grupo Ausente</span>
                <span className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-50 mt-1 block">
                  {loadingData ? <span className="h-8 w-12 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md block mt-1" /> : stats?.media_geral ?? 0.0}
                </span>
              </div>
              <p className="text-[10px] text-neutral-450 mt-2">Média calculada sobre colaboradores com ocorrência</p>
            </div>

            {/* Card 3: Colaboradores Acima da Média */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[110px]">
              <div>
                <span className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Acima da Média</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-50">
                    {loadingData ? <span className="h-8 w-12 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md block mt-1" /> : stats?.colaboradores_acima_media ?? 0}
                  </span>
                  {!loadingData && stats && (
                    <span className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/20 px-1.5 py-0.5 rounded-md">
                      {stats.colaboradores_acima_media_percent}%
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-neutral-450 mt-2">Colaboradores com índice acima da média geral</p>
            </div>

            {/* Card 4: Alerta Crítico (Top 30% acima da média) */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[110px]">
              <div>
                <span className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Top 30% das Médias</span>
                <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-500 mt-1 block">
                  {loadingData ? <span className="h-8 w-12 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md block mt-1" /> : stats?.colaboradores_top_30 ?? 0}
                </span>
              </div>
              <p className="text-[10px] text-neutral-450 mt-2">
                Limite Top 30% no período: <span className="font-bold text-neutral-700 dark:text-neutral-300">{(stats?.limite_top_30 ?? 1)}</span> ou mais
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Card 1: Total Suspensões */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[110px]">
              <div>
                <span className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Total Suspensões</span>
                <span className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-50 mt-1 block">
                  {loadingData ? <span className="h-8 w-12 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md block mt-1" /> : stats?.total_ausencias ?? 0}
                </span>
              </div>
              <p className="text-[10px] text-neutral-450 mt-2">Total de suspensões aplicadas no período</p>
            </div>

            {/* Card 2: Colaboradores Suspensos */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[110px]">
              <div>
                <span className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Colaboradores Afetados</span>
                <span className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-50 mt-1 block">
                  {loadingData ? <span className="h-8 w-12 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md block mt-1" /> : stats?.colaboradores_suspensos ?? 0}
                </span>
              </div>
              <p className="text-[10px] text-neutral-450 mt-2">Quantidade de colaboradores suspensos únicos</p>
            </div>

            {/* Card 3 (Vazio para alinhamento) */}
            <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-dashed border-neutral-250 dark:border-neutral-800 p-5 rounded-2xl min-h-[110px]" />
            {/* Card 4 (Vazio para alinhamento) */}
            <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-dashed border-neutral-250 dark:border-neutral-800 p-5 rounded-2xl min-h-[110px]" />
          </>
        )}
      </div>

      {/* Tabela de Registros */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-850/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              Ranking de Ausências
            </h3>
            <p className="text-xs text-neutral-455">
              Mapeamento de colaboradores ordenados decrescentemente pelo volume de ocorrências
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro de Tabela Rápido para Abas de Faltas/Atestados/Soma */}
            {activeTab !== 'suspensoes' && (
              <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => { setFiltroTabela('todos'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                    filtroTabela === 'todos'
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                      : 'text-neutral-550 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                  }`}
                >
                  Todos ({dadosAusencias.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setFiltroTabela('acima_media'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                    filtroTabela === 'acima_media'
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                      : 'text-neutral-550 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                  }`}
                >
                  Acima da Média ({dadosAusencias.filter(x => x.acima_da_media).length})
                </button>
                <button
                  type="button"
                  onClick={() => { setFiltroTabela('top_30'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                    filtroTabela === 'top_30'
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                      : 'text-neutral-550 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                  }`}
                >
                  Top 30% Alerta ({dadosAusencias.filter(x => x.top_30_percent).length})
                </button>
              </div>
            )}

            {/* Botão de Exportar */}
            <button
              type="button"
              onClick={handleExportarExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[10px] font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-sm cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              Exportar para Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loadingData ? (
            <div className="py-12 flex flex-col items-center justify-center text-neutral-400 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <span className="text-xs font-semibold">Carregando listagem...</span>
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 text-xs">
              Nenhum registro de ausência encontrado com os filtros atuais no período.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 bg-neutral-50/50 dark:bg-neutral-850/50 font-bold uppercase tracking-wider">
                  <th className="p-4 w-20">RE</th>
                  <th className="p-4">Colaborador</th>
                  <th className="p-4 w-24">Dt. Admissão</th>
                  <th className="p-4">Loja</th>
                  <th className="p-4">Status Gestão</th>
                  <th className="p-4 text-center w-16">Faltas</th>
                  <th className="p-4 text-center w-16">Atestados</th>
                  <th className="p-4 text-center w-24">Faltas+Atestados</th>
                  <th className="p-4 text-center w-20">Suspensões</th>
                  {activeTab !== 'suspensoes' && (
                    <th className="p-4 w-28">Alertas</th>
                  )}
                  <th className="p-4 w-20 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row) => {
                  const isExpanded = !!expandedRows[row.id];
                  return (
                    <React.Fragment key={row.id}>
                      <tr className="border-b border-neutral-100 dark:border-neutral-850 hover:bg-neutral-50/50 dark:hover:bg-neutral-850/10 transition-colors">
                        <td className="p-4 font-mono font-medium text-neutral-700 dark:text-neutral-350">{row.re}</td>
                        <td className="p-4 font-semibold text-neutral-900 dark:text-neutral-100">{row.nome}</td>
                        <td className="p-4 text-neutral-600 dark:text-neutral-400">{formatarData(row.data_admissao || '')}</td>
                        <td className="p-4 text-neutral-600 dark:text-neutral-400">{row.loja_nome}</td>
                        <td className="p-4 text-neutral-600 dark:text-neutral-400">
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-750 dark:bg-neutral-800 dark:text-neutral-300">
                            {row.status_gestao}
                          </span>
                        </td>
                        <td className="p-4 text-center font-semibold text-neutral-800 dark:text-neutral-200">{row.faltas}</td>
                        <td className="p-4 text-center font-semibold text-neutral-800 dark:text-neutral-200">{row.atestados}</td>
                        <td className="p-4 text-center font-bold text-neutral-850 dark:text-neutral-100">{row.soma}</td>
                        <td className="p-4 text-center font-semibold text-neutral-800 dark:text-neutral-200">{row.suspensoes}</td>
                        {activeTab !== 'suspensoes' && (
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {row.top_30_percent && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200/50 dark:border-red-900/30 animate-pulse">
                                  Top 30%
                                </span>
                              )}
                              {row.acima_da_media && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/20">
                                  &gt; Média
                                </span>
                              )}
                              {!row.acima_da_media && !row.top_30_percent && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-50 dark:bg-emerald-950/15 text-emerald-700 dark:text-emerald-450 border border-emerald-200/30 dark:border-emerald-900/15">
                                  &lt; Média
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="p-4 text-center">
                          <button
                            onClick={() => toggleRow(row.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-violet-600 hover:text-violet-850 dark:text-violet-400 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 rounded transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                Recolher
                                <ChevronUp className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                Detalhes
                                <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                      {/* Linha Expansível contendo o Histórico Detalhado */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={activeTab === 'suspensoes' ? 10 : 11} className="p-0 bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-850">
                            <div className="p-4 md:px-8 space-y-3">
                              <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                                <FileText className="h-4 w-4" />
                                Histórico Detalhado
                              </h4>
                              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden max-w-4xl bg-white dark:bg-neutral-900">
                                <table className="w-full text-left border-collapse text-[11px]">
                                  <thead>
                                    <tr className="border-b border-neutral-250 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-850/50 text-neutral-450 font-bold">
                                      <th className="p-2.5 w-32">Data</th>
                                      <th className="p-2.5">Descrição / Motivo</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.detalhes.map((det, idx) => (
                                      <tr key={idx} className="border-b border-neutral-100 dark:border-neutral-850/50 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                        <td className="p-2.5 font-semibold text-neutral-800 dark:text-neutral-200">{formatarData(det.data)}</td>
                                        <td className="p-2.5 text-neutral-700 dark:text-neutral-300">{det.descricao}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação do Grid */}
        {!loadingData && totalPages > 1 && (
          <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-850/10 flex items-center justify-between">
            <span className="text-[11px] text-neutral-450">
              Mostrando página <span className="font-bold">{currentPage}</span> de <span className="font-bold">{totalPages}</span> ({tabelaDadosFiltrados.length} registros no total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-3 py-1.5 text-[10px] font-bold border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-850 text-neutral-700 dark:text-neutral-300 rounded-md disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all cursor-pointer"
              >
                Anterior
              </button>
              <button
                disabled={currentPage === totalPages}
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="px-3 py-1.5 text-[10px] font-bold border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-850 text-neutral-700 dark:text-neutral-300 rounded-md disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all cursor-pointer"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
