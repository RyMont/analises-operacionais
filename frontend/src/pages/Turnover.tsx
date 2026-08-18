import { useEffect, useState, useRef, useMemo } from 'react';
import { 
  AlertCircle, 
  UserX, 
  TrendingDown, 
  Search, 
  ArrowLeft, 
  ArrowRight, 
  UserCheck, 
  Percent, 
  Store, 
  RotateCcw, 
  ArrowUpDown, 
  Filter, 
  Activity 
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import api from '../api/client';
import SearchableSelect from '../components/ui/searchable-select';

interface ColaboradorDemitido {
  id: number;
  nome: string;
  re: string;
  cargo: string;
  data_demissao: string | null;
  motivo_demissao: string | null;
  status: string;
  loja_gestao_nome: string;
  centro_custo: string;
  loja_gestao_coordenador: string;
  loja_gestao_supervisor: string;
}

interface LojaTurnoverData {
  id?: string | number;
  loja: string;
  coordenador?: string;
  supervisor?: string;
  uf?: string;
  quantidade: number;
  taxa_turnover?: number;
  quadro: number;
  demissoes: number;
  admissoes?: number;
}

interface FiltroOpcoes {
  lojas: { id: string; nome_referencia: string }[];
  coordenadores: string[];
  supervisores: string[];
  ufs: string[];
  motivos: string[];
  competencias: string[];
}

const CORES_CHART = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b'];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const title = data.coordenador || data.loja;
    return (
      <div className="bg-neutral-900 text-white p-3 rounded-lg border border-neutral-850 text-xs shadow-md space-y-1">
        <p className="font-bold border-b border-neutral-800 pb-1 mb-1 text-neutral-200">
          {title}
        </p>
        <p className="text-violet-400 font-semibold">
          Taxa de Turnover: <span className="font-bold text-white">{data.quantidade}%</span>
        </p>
        <p className="text-neutral-400">
          Quadro Total: <span className="font-bold text-neutral-200">{data.quadro}</span>
        </p>
        <p className="text-neutral-400">
          Total Demissões: <span className="font-bold text-neutral-200">{data.demissoes}</span>
        </p>
      </div>
    );
  }
  return null;
};

const LojaCustomTooltip = ({ active, payload, metrica }: { active?: boolean; payload?: any[]; metrica?: 'taxa' | 'demissoes' }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const taxa = data.taxa_turnover ?? data.quantidade ?? 0;
    return (
      <div className="bg-neutral-900/95 text-white p-3.5 rounded-xl border border-neutral-800 text-xs shadow-xl space-y-2 backdrop-blur-md min-w-[210px]">
        <div className="border-b border-neutral-800 pb-1.5">
          <p className="font-black text-sm text-neutral-100">{data.loja}</p>
          <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-0.5">
            {data.uf && data.uf !== 'N/A' && (
              <span className="bg-neutral-800 px-1.5 py-0.5 rounded-xs font-semibold text-neutral-300">UF: {data.uf}</span>
            )}
            {data.coordenador && <span className="truncate max-w-[140px] text-neutral-350">{data.coordenador}</span>}
          </div>
        </div>

        <div className="space-y-1.5 text-[11px]">
          <div className={`flex items-center justify-between ${metrica === 'taxa' ? 'bg-violet-950/40 px-1.5 py-0.5 rounded-sm border border-violet-800/30' : ''}`}>
            <span className="text-neutral-400">Taxa de Turnover:</span>
            <span className={`font-black text-xs ${taxa >= 20 ? 'text-rose-400' : taxa >= 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {taxa.toFixed(1)}%
            </span>
          </div>
          <div className={`flex items-center justify-between ${metrica === 'demissoes' ? 'bg-rose-950/40 px-1.5 py-0.5 rounded-sm border border-rose-800/30' : ''}`}>
            <span className="text-neutral-400">Demissões:</span>
            <span className="font-bold text-neutral-100">{data.demissoes}</span>
          </div>
          {data.admissoes !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Admissões:</span>
              <span className="font-bold text-neutral-100">{data.admissoes}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Quadro Planejado:</span>
            <span className="font-bold text-neutral-200">{data.quadro}</span>
          </div>
          {data.supervisor && data.supervisor !== 'Sem Supervisor' && (
            <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 border-t border-neutral-800/60">
              <span>Supervisor:</span>
              <span className="text-neutral-300 font-medium truncate max-w-[130px]">{data.supervisor}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const getBarColor = (entry: LojaTurnoverData, metrica: 'taxa' | 'demissoes') => {
  if (metrica === 'demissoes') {
    if (entry.demissoes >= 5) return '#f43f5e';
    if (entry.demissoes >= 2) return '#f59e0b';
    if (entry.demissoes > 0) return '#6366f1';
    return '#10b981';
  }
  const taxa = entry.taxa_turnover ?? entry.quantidade ?? 0;
  if (taxa >= 25) return '#f43f5e'; // Vermelho / Rose para crítico
  if (taxa >= 15) return '#f59e0b'; // Âmbar para moderado alto
  if (taxa >= 5) return '#6366f1';  // Índigo para moderado
  if (taxa > 0) return '#8b5cf6';  // Violeta para baixo
  return '#10b981';                 // Esmeralda para zero demissões
};

/**
 * Tela de Análise de Turnover.
 * 
 * Por que existe: Oferece um painel completo para visualização, análise e filtro
 * dos índices de turnover (desligamentos) da equipe, detalhando motivos de demissão,
 * evolução mensal, distribuição geográfica, gráfico vertical de todas as lojas e tabela paginada.
 */
export default function Turnover() {

  // Estados de dados da API
  const [colaboradores, setColaboradores] = useState<ColaboradorDemitido[]>([]);
  const [totalDemissoes, setTotalDemissoes] = useState(0);
  const [totalAdmitidos, setTotalAdmitidos] = useState(0);
  const [taxaTurnover, setTaxaTurnover] = useState(0);
  const [saldo, setSaldo] = useState(0);
  const [graficos, setGraficos] = useState({
    motivo: [] as { motivo: string; quantidade: number }[],
    mensal: [] as { mes: string; admissoes: number; demissoes: number }[],
    coordenador: [] as { coordenador: string; quantidade: number }[],
    lojas: [] as LojaTurnoverData[],
    cargos: [] as { cargo: string; quantidade: number }[]
  });

  // Estados dos filtros globais do painel
  const [filtroLoja, setFiltroLoja] = useState('');
  const [filtroCoordenador, setFiltroCoordenador] = useState('');
  const [filtroSupervisor, setFiltroSupervisor] = useState('');
  const [filtroUf, setFiltroUf] = useState('');
  const [filtroMotivo, setFiltroMotivo] = useState('');
  const [filtroCompetencia, setFiltroCompetencia] = useState('');
  const [buscaText, setBuscaText] = useState('');
  
  // Opções carregadas dos filtros globais
  const [filtroOpcoes, setFiltroOpcoes] = useState<FiltroOpcoes>({
    lojas: [],
    coordenadores: [],
    supervisores: [],
    ufs: [],
    motivos: [],
    competencias: []
  });

  // Estados de Filtros Exclusivos da Área do Gráfico de Lojas
  const [lojaBuscaArea, setLojaBuscaArea] = useState('');
  const [lojaCoordArea, setLojaCoordArea] = useState('');
  const [lojaSuperArea, setLojaSuperArea] = useState('');
  const [lojaUfArea, setLojaUfArea] = useState('');
  const [lojaStatusArea, setLojaStatusArea] = useState<'todas' | 'com_turnover' | 'top10' | 'top20' | 'top50' | 'critico' | 'sem_turnover'>('todas');
  const [lojaOrdenacaoArea, setLojaOrdenacaoArea] = useState<'turnover_desc' | 'turnover_asc' | 'demissoes_desc' | 'nome_asc' | 'nome_desc'>('turnover_desc');
  const [lojaMetricaArea, setLojaMetricaArea] = useState<'taxa' | 'demissoes'>('taxa');

  // Paginação e UI
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const lastQueryId = useRef(0);

  // Carrega opções de filtros
  useEffect(() => {
    const fetchFiltros = async () => {
      try {
        setLoadingFilters(true);
        const response = await api.get('/colaboradores/turnover/filtro-opcoes/');
        setFiltroOpcoes(response.data);
        if (response.data && response.data.competencias && response.data.competencias.length > 0) {
          setFiltroCompetencia(response.data.competencias[0]);
        }
      } catch (err) {
        console.error('Erro ao buscar opções de filtros:', err);
        setErrorMsg('Erro ao obter os filtros dinâmicos de turnover.');
      } finally {
        setLoadingFilters(false);
      }
    };
    fetchFiltros();
  }, []);

  // Carrega dados paginados e gráficos
  useEffect(() => {
    if (loadingFilters) return;

    const fetchTurnoverData = async () => {
      setLoadingData(true);
      setErrorMsg(null);
      const queryId = ++lastQueryId.current;
      
      try {
        const params = new URLSearchParams();
        params.append('page', String(currentPage));
        
        if (filtroLoja) params.append('loja', filtroLoja);
        if (filtroCoordenador) params.append('coordenador', filtroCoordenador);
        if (filtroSupervisor) params.append('supervisor', filtroSupervisor);
        if (filtroUf) params.append('uf', filtroUf);
        if (filtroMotivo) params.append('motivo', filtroMotivo);
        if (filtroCompetencia) params.append('mes_ano', filtroCompetencia);
        if (buscaText) params.append('search', buscaText);

        const response = await api.get(`/colaboradores/turnover/?${params.toString()}`);
        
        if (queryId !== lastQueryId.current) return;

        if (response.data) {
          const results = response.data.results || {};
          setColaboradores(results.resultados || []);
          setTotalDemissoes(results.quantidade_total || 0);
          setTotalAdmitidos(results.quantidade_admitidos || 0);
          setTaxaTurnover(results.taxa_turnover || 0);
          setSaldo(results.saldo || 0);
          setGraficos(results.graficos || { motivo: [], mensal: [], coordenador: [], lojas: [], cargos: [] });
          
          const count = response.data.count || 0;
          setTotalPages(Math.ceil(count / 10) || 1);
        }
      } catch (err) {
        if (queryId !== lastQueryId.current) return;
        console.error('Erro ao buscar dados de turnover:', err);
        setErrorMsg('Não foi possível carregar a análise de turnover.');
      } finally {
        if (queryId === lastQueryId.current) {
          setLoadingData(false);
        }
      }
    };

    fetchTurnoverData();
  }, [currentPage, fetchTrigger, loadingFilters]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    setFetchTrigger(prev => prev + 1);
  };

  const handleLimparFiltros = () => {
    setFiltroLoja('');
    setFiltroCoordenador('');
    setFiltroSupervisor('');
    setFiltroUf('');
    setFiltroMotivo('');
    setFiltroCompetencia(filtroOpcoes.competencias[0] || '');
    setBuscaText('');
    setCurrentPage(1);
    setFetchTrigger(prev => prev + 1);
  };

  // Formata data ISO para string legível
  const formatarData = (dataStr: string | null) => {
    if (!dataStr) return '-';
    try {
      const partes = dataStr.split('-');
      if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
      }
      return dataStr;
    } catch {
      return dataStr;
    }
  };

  // Opções exclusivas extraídas da lista completa de lojas da área
  const areaCoordOpcoes = useMemo(() => {
    const coords = new Set<string>();
    graficos.lojas.forEach(l => {
      if (l.coordenador) coords.add(l.coordenador);
    });
    return Array.from(coords).sort();
  }, [graficos.lojas]);

  const areaSuperOpcoes = useMemo(() => {
    const supers = new Set<string>();
    graficos.lojas.forEach(l => {
      if (l.supervisor) supers.add(l.supervisor);
    });
    return Array.from(supers).sort();
  }, [graficos.lojas]);

  const areaUfOpcoes = useMemo(() => {
    const ufs = new Set<string>();
    graficos.lojas.forEach(l => {
      if (l.uf && l.uf !== 'N/A') ufs.add(l.uf);
    });
    return Array.from(ufs).sort();
  }, [graficos.lojas]);

  // Filtragem e ordenação dinâmica exclusiva da área de lojas
  const lojasFiltradasGrafico = useMemo(() => {
    let result = [...graficos.lojas];

    // Busca rápida por nome/número de loja
    if (lojaBuscaArea.trim()) {
      const q = lojaBuscaArea.toLowerCase().trim();
      result = result.filter(l => l.loja.toLowerCase().includes(q));
    }

    // Coordenador exclusivo
    if (lojaCoordArea) {
      result = result.filter(l => l.coordenador === lojaCoordArea);
    }

    // Supervisor exclusivo
    if (lojaSuperArea) {
      result = result.filter(l => l.supervisor === lojaSuperArea);
    }

    // UF exclusiva
    if (lojaUfArea) {
      result = result.filter(l => l.uf === lojaUfArea);
    }

    // Status / Faixa
    if (lojaStatusArea === 'com_turnover') {
      result = result.filter(l => l.demissoes > 0);
    } else if (lojaStatusArea === 'sem_turnover') {
      result = result.filter(l => l.demissoes === 0);
    } else if (lojaStatusArea === 'critico') {
      result = result.filter(l => (l.taxa_turnover ?? l.quantidade) >= 20);
    }

    // Ordenação
    result.sort((a, b) => {
      const taxaA = a.taxa_turnover ?? a.quantidade;
      const taxaB = b.taxa_turnover ?? b.quantidade;
      if (lojaOrdenacaoArea === 'turnover_desc') {
        return taxaB - taxaA || b.demissoes - a.demissoes;
      }
      if (lojaOrdenacaoArea === 'turnover_asc') {
        return taxaA - taxaB || a.demissoes - b.demissoes;
      }
      if (lojaOrdenacaoArea === 'demissoes_desc') {
        return b.demissoes - a.demissoes || taxaB - taxaA;
      }
      if (lojaOrdenacaoArea === 'nome_asc') {
        return a.loja.localeCompare(b.loja, undefined, { numeric: true });
      }
      if (lojaOrdenacaoArea === 'nome_desc') {
        return b.loja.localeCompare(a.loja, undefined, { numeric: true });
      }
      return 0;
    });

    // Limites de Top N se selecionados
    if (lojaStatusArea === 'top10') {
      result = result.slice(0, 10);
    } else if (lojaStatusArea === 'top20') {
      result = result.slice(0, 20);
    } else if (lojaStatusArea === 'top50') {
      result = result.slice(0, 50);
    }

    return result;
  }, [graficos.lojas, lojaBuscaArea, lojaCoordArea, lojaSuperArea, lojaUfArea, lojaStatusArea, lojaOrdenacaoArea]);

  // Estatísticas agregadas das lojas visíveis no gráfico
  const statsAreaLojas = useMemo(() => {
    const total = lojasFiltradasGrafico.length;
    const totalDem = lojasFiltradasGrafico.reduce((acc, l) => acc + l.demissoes, 0);
    const totalQuad = lojasFiltradasGrafico.reduce((acc, l) => acc + l.quadro, 0);
    const media = totalQuad > 0 ? (totalDem / totalQuad) * 100 : 0;
    const maiorTaxa = lojasFiltradasGrafico.length > 0 
      ? Math.max(...lojasFiltradasGrafico.map(l => l.taxa_turnover ?? l.quantidade))
      : 0;

    return { total, totalDem, totalQuad, media, maiorTaxa };
  }, [lojasFiltradasGrafico]);

  const temFiltroAreaAtivo = Boolean(
    lojaBuscaArea ||
    lojaCoordArea ||
    lojaSuperArea ||
    lojaUfArea ||
    lojaStatusArea !== 'todas' ||
    lojaOrdenacaoArea !== 'turnover_desc' ||
    lojaMetricaArea !== 'taxa'
  );

  const handleLimparFiltrosArea = () => {
    setLojaBuscaArea('');
    setLojaCoordArea('');
    setLojaSuperArea('');
    setLojaUfArea('');
    setLojaStatusArea('todas');
    setLojaOrdenacaoArea('turnover_desc');
    setLojaMetricaArea('taxa');
  };

  // Largura calculada dinamicamente para garantir que cada barra vertical e rótulo fique nítido
  const larguraMinimaGrafico = Math.max(800, lojasFiltradasGrafico.length * 36);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-rose-500" />
          Análise de Turnover
        </h1>
        <p className="text-sm text-neutral-500 font-medium">Métricas, motivos de demissão e análise comportamental de desligamentos da equipe</p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm flex gap-3 items-center">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Formulário de Filtros Globais */}
      <form onSubmit={handleSearchSubmit} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <h2 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
            Filtros do Painel
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* Competência (Mês/Ano) */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Mês de Demissão</label>
            {loadingFilters ? (
              <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
            ) : (
              <SearchableSelect
                options={[
                  { value: "", label: "Todas as Datas" },
                  ...filtroOpcoes.competencias.map(c => {
                    const [ano, mes] = c.split('-');
                    return { value: c, label: `${mes}/${ano}` };
                  })
                ]}
                value={filtroCompetencia}
                onChange={setFiltroCompetencia}
                placeholder="Todos os meses..."
                multiple={true}
              />
            )}
          </div>

          {/* Loja Física */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Loja Física</label>
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
                placeholder="Todas as lojas..."
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
                  ...filtroOpcoes.coordenadores.map(c => ({ value: c, label: c === 'null' ? '(Sem Coordenador)' : c }))
                ]}
                value={filtroCoordenador}
                onChange={setFiltroCoordenador}
                placeholder="Todos..."
                multiple={true}
              />
            )}
          </div>

          {/* Supervisor */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Supervisor</label>
            {loadingFilters ? (
              <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
            ) : (
              <SearchableSelect
                options={[
                  { value: "", label: "Todos os Supervisores" },
                  ...filtroOpcoes.supervisores.map(s => ({ value: s, label: s === 'null' ? '(Sem Supervisor)' : s }))
                ]}
                value={filtroSupervisor}
                onChange={setFiltroSupervisor}
                placeholder="Todos..."
                multiple={true}
              />
            )}
          </div>

          {/* UF */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">UF</label>
            {loadingFilters ? (
              <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
            ) : (
              <SearchableSelect
                options={[
                  { value: "", label: "Todas as UFs" },
                  ...filtroOpcoes.ufs.map(u => ({ value: u, label: u === 'null' ? '(N/A)' : u }))
                ]}
                value={filtroUf}
                onChange={setFiltroUf}
                placeholder="Todas..."
                multiple={true}
              />
            )}
          </div>

          {/* Motivo de Demissão */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Motivo</label>
            {loadingFilters ? (
              <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
            ) : (
              <SearchableSelect
                options={[
                  { value: "", label: "Todos os Motivos" },
                  ...filtroOpcoes.motivos.map(m => ({ value: m, label: m === 'null' ? 'Não Informado' : m }))
                ]}
                value={filtroMotivo}
                onChange={setFiltroMotivo}
                placeholder="Todos os motivos..."
                multiple={true}
              />
            )}
          </div>
        </div>

        {/* Busca por Texto e Botões */}
        <div className="flex flex-col sm:flex-row gap-4 pt-2 border-t border-neutral-100 dark:border-neutral-800 justify-between items-center">
          <div className="w-full sm:max-w-md relative">
            <Search className="h-4 w-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar por nome ou RE..."
              value={buscaText}
              onChange={(e) => setBuscaText(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 rounded-full text-neutral-700 dark:text-neutral-300 focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-all font-medium"
            />
          </div>

          <div className="flex gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleLimparFiltros}
              className="px-5 py-2.5 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-full text-xs font-bold text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
            >
              Limpar Filtros
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 shadow-xs transition-opacity cursor-pointer"
            >
              Aplicar Filtros
            </button>
          </div>
        </div>
      </form>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Demissões */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-xs shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
            <UserX className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total de Demissões</p>
            <p className="text-3xl font-black text-neutral-900 dark:text-neutral-50 mt-1">
              {loadingData ? '...' : totalDemissoes}
            </p>
            <p className="text-[10px] text-neutral-400 mt-1">Colaboradores desligados</p>
          </div>
        </div>

        {/* Card 2: Admissões */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-xs shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total de Admissões</p>
            <p className="text-3xl font-black text-neutral-900 dark:text-neutral-50 mt-1">
              {loadingData ? '...' : totalAdmitidos}
            </p>
            <p className="text-[10px] text-neutral-400 mt-1">Colaboradores admitidos</p>
          </div>
        </div>

        {/* Card 3: Taxa de Turnover */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-xs shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0">
            <Percent className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Taxa de Turnover</p>
            <p className="text-3xl font-black text-neutral-900 dark:text-neutral-50 mt-1">
              {loadingData ? '...' : `${taxaTurnover.toFixed(1)}%`}
            </p>
            <p className="text-[10px] font-semibold mt-1 flex items-center gap-1">
              {saldo > 0 ? (
                <span className="text-emerald-500">+{saldo} vagas (Saldo Positivo)</span>
              ) : saldo < 0 ? (
                <span className="text-rose-500">{saldo} vagas (Saldo Negativo)</span>
              ) : (
                <span className="text-neutral-500">Saldo Neutro</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Gráficos em Grid Resumido */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Gráfico 1: Evolução Mensal */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-xs shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">Admissões vs Demissões</h3>
            <p className="text-[11px] text-neutral-450">Comparativo temporal de contratações e desligamentos</p>
          </div>
          <div className="h-72 w-full">
            {loadingData ? (
              <div className="w-full h-full bg-neutral-50 dark:bg-neutral-850 animate-pulse rounded-xl" />
            ) : graficos.mensal.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-neutral-450 text-xs">Sem dados históricos no período</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={graficos.mensal} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-neutral-800" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: '#171717', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }} />
                  <Line type="monotone" dataKey="admissoes" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8 }} name="Admissões" />
                  <Line type="monotone" dataKey="demissoes" stroke="#f43f5e" strokeWidth={3} activeDot={{ r: 8 }} name="Demissões" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Gráfico 2: Motivos de Demissão */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-xs shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">Motivos dos Desligamentos</h3>
            <p className="text-[11px] text-neutral-450">Distribuição percentual por motivo mapeado</p>
          </div>
          <div className="h-72 w-full flex flex-col sm:flex-row items-center justify-center">
            {loadingData ? (
              <div className="w-full h-full bg-neutral-50 dark:bg-neutral-850 animate-pulse rounded-xl" />
            ) : graficos.motivo.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-neutral-450 text-xs">Sem motivos mapeados no período</div>
            ) : (
              <>
                <div className="h-52 w-52 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={graficos.motivo}
                        dataKey="quantidade"
                        nameKey="motivo"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        {graficos.motivo.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CORES_CHART[index % CORES_CHART.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#171717', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }} formatter={(value) => [`${value} demissões`, 'Quantidade']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 overflow-y-auto max-h-52 w-full px-2 text-xs">
                  {graficos.motivo.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between border-b border-neutral-50 dark:border-neutral-850/50 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: CORES_CHART[index % CORES_CHART.length] }} />
                        <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[120px]">{entry.motivo}</span>
                      </div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-50">{entry.quantidade}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Gráfico 3: Turnover por Coordenador */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-xs shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">Taxa por Coordenador</h3>
            <p className="text-[11px] text-neutral-450">Índice percentual (Demissões / Quadro) por equipe</p>
          </div>
          <div className="h-72 w-full">
            {loadingData ? (
              <div className="w-full h-full bg-neutral-50 dark:bg-neutral-850 animate-pulse rounded-xl" />
            ) : graficos.coordenador.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-neutral-450 text-xs">Sem coordenadores no período</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={graficos.coordenador} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-neutral-800" />
                  <XAxis dataKey="coordenador" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="quantidade" fill="#a855f7" radius={[4, 4, 0, 0]} name="Taxa de Turnover" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* SEÇÃO PRINCIPAL: Gráfico de Barras Verticais de Todas as Lojas com Filtros Exclusivos */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-xs shadow-sm space-y-5">
        
        {/* Cabeçalho da Seção */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  Taxa de Turnover por Loja Física
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                    {statsAreaLojas.total} de {graficos.lojas.length} lojas
                  </span>
                </h3>
                <p className="text-xs text-neutral-450">
                  Visão comparativa de rotatividade e desligamentos em todas as lojas da rede
                </p>
              </div>
            </div>
          </div>

          {/* Badges de Métricas Rápidas da Seleção */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/60 dark:border-neutral-800/80 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-neutral-500 text-[11px]">Média da Seleção:</span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">{statsAreaLojas.media.toFixed(1)}%</span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/60 dark:border-neutral-800/80 flex items-center gap-2">
              <UserX className="h-3.5 w-3.5 text-rose-500" />
              <span className="text-neutral-500 text-[11px]">Total Demissões:</span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">{statsAreaLojas.totalDem}</span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/60 dark:border-neutral-800/80 flex items-center gap-2">
              <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-neutral-500 text-[11px]">Pico Máximo:</span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">{statsAreaLojas.maiorTaxa.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Barra de Filtros Exclusivos desta Área */}
        <div className="p-4 bg-neutral-50/60 dark:bg-neutral-850/40 border border-neutral-200/60 dark:border-neutral-800/70 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-700 dark:text-neutral-300">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-violet-500" />
              <span>Filtros Exclusivos do Gráfico de Lojas</span>
            </div>
            {temFiltroAreaAtivo && (
              <button
                type="button"
                onClick={handleLimparFiltrosArea}
                className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 flex items-center gap-1 hover:underline cursor-pointer transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Limpar Filtros da Área
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            
            {/* Busca Rápida por Loja */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-neutral-500 uppercase">Buscar Loja</label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Nome ou código..."
                  value={lojaBuscaArea}
                  onChange={(e) => setLojaBuscaArea(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-200 focus:outline-hidden focus:ring-1 focus:ring-primary font-medium"
                />
              </div>
            </div>

            {/* Coordenador Exclusivo */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-neutral-500 uppercase">Coordenador</label>
              <select
                value={lojaCoordArea}
                onChange={(e) => setLojaCoordArea(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-200 focus:outline-hidden focus:ring-1 focus:ring-primary font-medium cursor-pointer"
              >
                <option value="">Todos os Coordenadores</option>
                {areaCoordOpcoes.map((coord, idx) => (
                  <option key={idx} value={coord}>{coord}</option>
                ))}
              </select>
            </div>

            {/* Supervisor Exclusivo */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-neutral-500 uppercase">Supervisor</label>
              <select
                value={lojaSuperArea}
                onChange={(e) => setLojaSuperArea(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-200 focus:outline-hidden focus:ring-1 focus:ring-primary font-medium cursor-pointer"
              >
                <option value="">Todos os Supervisores</option>
                {areaSuperOpcoes.map((sup, idx) => (
                  <option key={idx} value={sup}>{sup}</option>
                ))}
              </select>
            </div>

            {/* UF Exclusiva */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-neutral-500 uppercase">UF</label>
              <select
                value={lojaUfArea}
                onChange={(e) => setLojaUfArea(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-200 focus:outline-hidden focus:ring-1 focus:ring-primary font-medium cursor-pointer"
              >
                <option value="">Todas as UFs</option>
                {areaUfOpcoes.map((uf, idx) => (
                  <option key={idx} value={uf}>{uf}</option>
                ))}
              </select>
            </div>

            {/* Exibição / Faixa de Status */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-neutral-500 uppercase">Visualização</label>
              <select
                value={lojaStatusArea}
                onChange={(e) => setLojaStatusArea(e.target.value as any)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-200 focus:outline-hidden focus:ring-1 focus:ring-primary font-medium cursor-pointer"
              >
                <option value="todas">Todas as Lojas (Rede Completa)</option>
                <option value="com_turnover">Com Turnover (&gt; 0%)</option>
                <option value="top10">Top 10 Lojas</option>
                <option value="top20">Top 20 Lojas</option>
                <option value="top50">Top 50 Lojas</option>
                <option value="critico">Turnover Crítico (≥ 20%)</option>
                <option value="sem_turnover">Sem Desligamentos (0%)</option>
              </select>
            </div>

            {/* Ordenação */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-neutral-500 uppercase flex items-center gap-1">
                <ArrowUpDown className="h-2.5 w-2.5" /> Ordenar Por
              </label>
              <select
                value={lojaOrdenacaoArea}
                onChange={(e) => setLojaOrdenacaoArea(e.target.value as any)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-200 focus:outline-hidden focus:ring-1 focus:ring-primary font-medium cursor-pointer"
              >
                <option value="turnover_desc">Maior Turnover (%)</option>
                <option value="turnover_asc">Menor Turnover (%)</option>
                <option value="demissoes_desc">Mais Demissões</option>
                <option value="nome_asc">Nome da Loja (A-Z)</option>
                <option value="nome_desc">Nome da Loja (Z-A)</option>
              </select>
            </div>

          </div>

          {/* Alternador de Métrica e Legenda */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50">
            {/* Alternador de Métrica */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] font-bold text-neutral-500 uppercase">Métrica do Gráfico:</span>
              <div className="flex bg-neutral-200/60 dark:bg-neutral-800 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setLojaMetricaArea('taxa');
                    setLojaOrdenacaoArea('turnover_desc');
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    lojaMetricaArea === 'taxa'
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  Taxa de Turnover (%)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLojaMetricaArea('demissoes');
                    setLojaOrdenacaoArea('demissoes_desc');
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    lojaMetricaArea === 'demissoes'
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  Qtd. de Demissões
                </button>
              </div>
            </div>

            {/* Legenda de Cores */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#f43f5e]" />
                <span>≥ 25% (Crítico)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#f59e0b]" />
                <span>15% - 24% (Atenção)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#6366f1]" />
                <span>5% - 14% (Moderado)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#10b981]" />
                <span>0% (Sem Demissões)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico de Barras Verticais Responsivo com Rolagem Horizontal Fluida */}
        <div className="w-full">
          {loadingData ? (
            <div className="w-full h-88 bg-neutral-50 dark:bg-neutral-850 animate-pulse rounded-xl" />
          ) : lojasFiltradasGrafico.length === 0 ? (
            <div className="w-full h-88 flex flex-col items-center justify-center text-neutral-450 text-xs space-y-2 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
              <Store className="h-8 w-8 text-neutral-300 dark:text-neutral-700" />
              <span>Nenhuma loja encontrada com os filtros selecionados para esta área.</span>
              {temFiltroAreaAtivo && (
                <button
                  type="button"
                  onClick={handleLimparFiltrosArea}
                  className="px-4 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-full font-bold text-xs hover:bg-neutral-200 cursor-pointer"
                >
                  Restaurar Filtros da Área
                </button>
              )}
            </div>
          ) : (
            <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
              <div style={{ minWidth: `${larguraMinimaGrafico}px`, height: '360px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={lojasFiltradasGrafico} 
                    margin={{ top: 20, right: 20, left: -10, bottom: 65 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-neutral-800/80" />
                    <XAxis
                      dataKey="loja"
                      tick={{ fontSize: 9, fill: '#94a3b8' }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={65}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickFormatter={(v) => lojaMetricaArea === 'taxa' ? `${v}%` : `${v}`}
                    />
                    <Tooltip content={<LojaCustomTooltip metrica={lojaMetricaArea} />} />
                    {lojaMetricaArea === 'taxa' && statsAreaLojas.media > 0 && (
                      <ReferenceLine
                        y={statsAreaLojas.media}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{
                          value: `Média: ${statsAreaLojas.media.toFixed(1)}%`,
                          fill: '#f59e0b',
                          fontSize: 10,
                          position: 'top',
                          fontWeight: 600
                        }}
                      />
                    )}
                    <Bar
                      dataKey={lojaMetricaArea === 'taxa' ? 'quantidade' : 'demissoes'}
                      radius={[4, 4, 0, 0]}
                      name={lojaMetricaArea === 'taxa' ? 'Taxa de Turnover (%)' : 'Demissões'}
                    >
                      {lojasFiltradasGrafico.map((entry, index) => (
                        <Cell
                          key={`loja-bar-${index}`}
                          fill={getBarColor(entry, lojaMetricaArea)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Tabela Detalhada */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs shadow-sm">
        <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-850/20">
          <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">Lista Detalhada de Demissões</h3>
          <p className="text-xs text-neutral-450">Histórico de colaboradores desligados com o respectivo motivo de demissão mapeado</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 bg-neutral-50/50 dark:bg-neutral-850/50 font-bold uppercase tracking-wider">
                <th className="p-4 w-20">RE</th>
                <th className="p-4">Colaborador</th>
                <th className="p-4">Cargo</th>
                <th className="p-4">Loja / CC</th>
                <th className="p-4">Coordenador</th>
                <th className="p-4 w-32 text-center">Data Demissão</th>
                <th className="p-4 w-44">Motivo de Demissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-350">
              {loadingData ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="p-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xs w-8" /></td>
                    <td className="p-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xs w-36" /></td>
                    <td className="p-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xs w-24" /></td>
                    <td className="p-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xs w-32" /></td>
                    <td className="p-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xs w-28" /></td>
                    <td className="p-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xs w-20 mx-auto" /></td>
                    <td className="p-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xs w-24" /></td>
                  </tr>
                ))
              ) : colaboradores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-neutral-450 text-xs">
                    Nenhum colaborador demitido localizado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                colaboradores.map((colab) => (
                  <tr key={colab.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/10 transition-colors">
                    <td className="p-4 font-bold text-neutral-900 dark:text-neutral-100">{colab.re}</td>
                    <td className="p-4 font-semibold text-neutral-850 dark:text-neutral-200">{colab.nome}</td>
                    <td className="p-4">{colab.cargo}</td>
                    <td className="p-4">
                      <span className="font-semibold block">{colab.loja_gestao_nome || '-'}</span>
                      <span className="text-[10px] text-neutral-400 font-medium">{colab.centro_custo || '-'}</span>
                    </td>
                    <td className="p-4">{colab.loja_gestao_coordenador || '-'}</td>
                    <td className="p-4 text-center font-bold text-rose-500/90">{formatarData(colab.data_demissao)}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 dark:bg-neutral-850 text-neutral-600 dark:text-neutral-350 border border-neutral-200/55 dark:border-neutral-800/80">
                        {colab.motivo_demissao || 'Não Informado'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginador */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/20 dark:bg-neutral-850/5">
            <p className="text-xs text-neutral-500 font-medium">
              Mostrando página <span className="font-bold">{currentPage}</span> de <span className="font-bold">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1 || loadingData}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-2 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages || loadingData}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="p-2 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
