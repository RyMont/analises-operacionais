import { useEffect, useState, useRef } from 'react';
import { 
  Users, 
  Search, 
  AlertCircle, 
  HelpCircle,
  Layers, 
  Briefcase,
  CheckCircle2,
  TrendingUp,
  Calendar,
  X,
  RefreshCw,
  Clock,
  UserCheck
} from 'lucide-react';
import api from '../api/client';
import { toast } from 'sonner';
import { useOnClickOutside } from '../hooks/useOnClickOutside';

interface HeadcountRow {
  loja_id: string;
  nome_referencia: string;
  centro_de_custo: string;
  cliente: string;
  is_atacadao: boolean;
  quadro_planejado: number;
  headcount_real: number;
  desvio: number;
  presencas_ultimo_dia: number;
  aderencia: number;
  geovictoria_sincronizado_em: string | null;
}

/**
 * Página de Análise de Headcount por Loja (Versão Paginada para Lojas Ativas).
 * 
 * Por que existe: Permite auditar de forma individualizada o quadro orçado (Quadro Estimado do cadastro da loja)
 * contra a alocação real de colaboradores na planilha de Gestão de Pessoas.
 * Filtra apenas lojas ativas, opera em tempo real (sem filtros de data) e suporta paginação para alta performance.
 */
export default function Headcount() {
  const [data, setData] = useState<HeadcountRow[]>([]);
  const [kpis, setKpis] = useState({
    total_planejado: 0,
    total_real: 0,
    total_excedentes: 0,
    total_lojas: 0
  });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados de Paginação e Busca
  const [busca, setBusca] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [ordenacao, setOrdenacao] = useState<'default' | 'presencas_desc' | 'presencas_asc' | 'desvio_desc' | 'desvio_asc' | 'aderencia_desc' | 'aderencia_asc'>('default');

  // Estados do Modal de Calendário de Presenças GeoVictoria
  interface ColaboradorPresenca {
    punch_id: string;
    cpf: string;
    nome: string;
    re: string;
    cargo: string;
    horario_entrada: string;
  }
  const [selectedLoja, setSelectedLoja] = useState<{ id: string; nome: string } | null>(null);
  const [anoMes, setAnoMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [calendarioDados, setCalendarioDados] = useState<{ [dataStr: string]: number }>({});
  const [loadingCalendario, setLoadingCalendario] = useState(false);
  const [errorCalendario, setErrorCalendario] = useState<string | null>(null);
  const [selectedDia, setSelectedDia] = useState<string | null>(null);
  const [colaboradoresDia, setColaboradoresDia] = useState<ColaboradorPresenca[]>([]);
  const [loadingColaboradores, setLoadingColaboradores] = useState(false);
  const [syncingRecente, setSyncingRecente] = useState(false);
  const [syncingLojas, setSyncingLojas] = useState<Record<string, boolean>>({});
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, () => setSelectedLoja(null));

  const formatarDataSincronizacao = (isoString: string | null) => {
    if (!isoString) return 'Nunca sincronizado';
    try {
      const dataObj = new Date(isoString);
      return dataObj.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Erro ao formatar data';
    }
  };

  // Busca as quantidades agregadas do calendário
  const fetchCalendario = async (lojaId: string, mesAno: string) => {
    setLoadingCalendario(true);
    setErrorCalendario(null);
    try {
      const response = await api.get(`/lojas/api/presencas/calendario/${lojaId}/`, {
        params: { ano_mes: mesAno }
      });
      setCalendarioDados(response.data || {});
    } catch (err) {
      console.error('Erro ao buscar calendário:', err);
      setErrorCalendario('Não foi possível carregar os dados de presenças.');
    } finally {
      setLoadingCalendario(false);
    }
  };

  // Busca a listagem detalhada de colaboradores do dia clicado
  const fetchColaboradoresDia = async (lojaId: string, dataStr: string) => {
    setLoadingColaboradores(true);
    try {
      const response = await api.get(`/lojas/api/presencas/dia/${lojaId}/`, {
        params: { data: dataStr }
      });
      setColaboradoresDia(response.data || []);
    } catch (err) {
      console.error('Erro ao buscar colaboradores do dia:', err);
    } finally {
      setLoadingColaboradores(false);
    }
  };

  // Dispara a sincronização geral de ontem para todas as filiais
  const handleSyncGeral = async () => {
    setSyncingRecente(true);
    const toastId = toast.loading('Sincronizando batidas de ontem para todas as lojas...');
    
    // Inicia o polling do progresso
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/lojas/api/presencas/sincronizar-progresso/');
        if (res.data && res.data.page > 0) {
          const totalStr = res.data.total_pages > 0 ? ` de ${res.data.total_pages}` : '';
          toast.loading(`Sincronizando geral: Lendo página ${res.data.page}${totalStr}...`, { id: toastId });
        }
      } catch (err) {
        console.error('Erro ao consultar progresso:', err);
      }
    }, 800);

    try {
      await api.post('/lojas/api/presencas/sincronizar-geral/');
      clearInterval(interval);
      toast.success('Sincronização geral concluída com sucesso!', { id: toastId });
      fetchHeadcount();
    } catch (err) {
      clearInterval(interval);
      console.error('Erro ao disparar sincronização recente:', err);
      toast.error('Falha ao sincronizar batidas recentes da GeoVictoria.', { id: toastId });
    } finally {
      setSyncingRecente(false);
    }
  };

  // Dispara a sincronização individual de uma loja nos últimos 3 dias
  const handleSyncLoja = async (lojaId: string) => {
    setSyncingLojas(prev => ({ ...prev, [lojaId]: true }));
    const toastId = toast.loading('Sincronizando batidas dos últimos 3 dias para esta loja...');
    
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/lojas/api/presencas/sincronizar-progresso/');
        if (res.data && res.data.page > 0) {
          const totalStr = res.data.total_pages > 0 ? ` de ${res.data.total_pages}` : '';
          toast.loading(`Sincronizando loja: Lendo página ${res.data.page}${totalStr}...`, { id: toastId });
        }
      } catch (err) {
        console.error('Erro ao consultar progresso:', err);
      }
    }, 800);

    try {
      await api.post(`/lojas/api/presencas/sincronizar-loja/${lojaId}/`);
      clearInterval(interval);
      toast.success('Sincronização da loja concluída com sucesso!', { id: toastId });
      fetchHeadcount();
    } catch (err) {
      clearInterval(interval);
      console.error('Erro ao disparar sincronização da loja:', err);
      toast.error('Falha ao sincronizar batidas recentes desta loja.', { id: toastId });
    } finally {
      setSyncingLojas(prev => ({ ...prev, [lojaId]: false }));
    }
  };

  // Carrega os dados do calendário sempre que o modal é aberto ou o mês selecionado muda
  useEffect(() => {
    if (selectedLoja) {
      fetchCalendario(selectedLoja.id, anoMes);
      setSelectedDia(null);
      setColaboradoresDia([]);
    }
  }, [selectedLoja, anoMes]);

  // Carrega os detalhes do dia quando o usuário clica em um dia
  useEffect(() => {
    if (selectedLoja && selectedDia) {
      fetchColaboradoresDia(selectedLoja.id, selectedDia);
    }
  }, [selectedDia]);

  // Função auxiliar para calcular e gerar a grade de dias do mês
  const obterDiasDoMes = (mesAnoStr: string) => {
    const [ano, mes] = mesAnoStr.split('-').map(Number);
    const dataInicial = new Date(ano, mes - 1, 1);
    const dataFinal = new Date(ano, mes, 0); // Dia 0 é o último dia do mês anterior

    const totalDias = dataFinal.getDate();
    const diaInicioSemana = dataInicial.getDay(); // 0 = Domingo, 1 = Segunda, etc.

    const diasArr = [];
    // Preenche com nulos os espaços anteriores ao primeiro dia do mês
    for (let i = 0; i < diaInicioSemana; i++) {
      diasArr.push(null);
    }
    // Dias reais
    for (let d = 1; d <= totalDias; d++) {
      const dataStr = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      diasArr.push({ dia: d, dataStr });
    }
    return diasArr;
  };



  // Carrega os dados agregados de headcount com paginação e busca
  const fetchHeadcount = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await api.get('/lojas/headcount/', {
        params: { 
          page: currentPage, 
          busca: busca,
          ordenacao: ordenacao === 'default' ? '' : ordenacao
        }
      });
      if (response.data) {
        const payload = response.data.results || {};
        setData(payload.resultados || []);
        setKpis(payload.kpis || { total_planejado: 0, total_real: 0, total_excedentes: 0, total_lojas: 0 });
        
        const totalCount = response.data.count || 0;
        setTotalPages(Math.ceil(totalCount / 20) || 1);
      } else {
        setData([]);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Erro ao buscar headcount de lojas:', err);
      setErrorMsg('Não foi possível carregar os dados de headcount das filiais.');
    } finally {
      setLoading(false);
    }
  };

  // Dispara a consulta quando a página, busca ou ordenação mudarem
  useEffect(() => {
    fetchHeadcount();
  }, [currentPage, busca, ordenacao]);

  const handleToggleOrdenacao = () => {
    setOrdenacao(prev => {
      if (prev === 'default' || !prev.startsWith('presencas')) return 'presencas_desc';
      if (prev === 'presencas_desc') return 'presencas_asc';
      return 'default';
    });
    setCurrentPage(1);
  };

  const handleToggleOrdenacaoDesvio = () => {
    setOrdenacao(prev => {
      if (prev === 'default' || !prev.startsWith('desvio')) return 'desvio_desc';
      if (prev === 'desvio_desc') return 'desvio_asc';
      return 'default';
    });
    setCurrentPage(1);
  };

  const handleToggleOrdenacaoAderencia = () => {
    setOrdenacao(prev => {
      if (prev === 'default' || !prev.startsWith('aderencia')) return 'aderencia_desc';
      if (prev === 'aderencia_desc') return 'aderencia_asc';
      return 'default';
    });
    setCurrentPage(1);
  };

  const handleOpenLoja = (loja: { id: string; nome: string }) => {
    const d = new Date();
    setAnoMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedLoja(loja);
  };



  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Auditoria de Headcount de Lojas Ativas</h1>
        <p className="text-sm text-neutral-500 font-medium">Comparação individual do Quadro Estimado da loja física vs. alocados na Gestão de Pessoas</p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm flex gap-3 items-center">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Barra de Busca e Filtros */}
      <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-col gap-1 w-full md:max-w-xl">
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Buscar Loja / Cliente / CC</span>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Digite o nome da loja, cliente ou centro de custo..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setCurrentPage(1); // Reseta para a primeira página ao buscar
              }}
              className="w-full pl-9 pr-4 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 text-neutral-800 dark:text-neutral-100 rounded-xl text-xs placeholder:text-neutral-400 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={handleSyncGeral}
            disabled={syncingRecente}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-active text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
            title="Sincroniza as batidas de entrada de todas as filiais do dia anterior (ontem)"
          >
            <RefreshCw className={`h-4 w-4 ${syncingRecente ? 'animate-spin' : ''}`} />
            {syncingRecente ? 'Sincronizando Ontem...' : 'Sincronizar Ponto de Ontem'}
          </button>
        </div>
      </div>

      {/* Cards de KPIs Consolidados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Quantidade Lojas */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Lojas Ativas</span>
            <span className="text-2xl font-extrabold font-mono text-neutral-950 dark:text-neutral-50 block">
              {loading ? '...' : kpis.total_lojas}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
            <Layers className="h-5 w-5" />
          </div>
        </div>

        {/* Quadro Planejado */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Ativos Totvs Total</span>
            <span className="text-2xl font-extrabold font-mono text-neutral-950 dark:text-neutral-50 block">
              {loading ? '...' : kpis.total_planejado}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
            <Briefcase className="h-5 w-5" />
          </div>
        </div>

        {/* Headcount Real */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Quadro Gestão Total</span>
            <span className="text-2xl font-extrabold font-mono text-neutral-950 dark:text-neutral-50 block">
              {loading ? '...' : kpis.total_real}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
            <Users className="h-5 w-5" />
          </div>
        </div>

        {/* Total Excedentes */}
        <div className={`border rounded-2xl p-5 shadow-sm flex items-center justify-between transition-colors ${
          kpis.total_excedentes > 0 
            ? 'bg-violet-500/5 border-violet-500/20 text-violet-750' 
            : 'bg-green-500/5 border-green-500/20 text-green-700'
        }`}>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Total de Excedentes</span>
            <span className="text-2xl font-extrabold font-mono block">
              {loading ? '...' : (kpis.total_excedentes > 0 ? `+${kpis.total_excedentes}` : kpis.total_excedentes)}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-neutral-850 shadow-2xs">
            {kpis.total_excedentes > 0 ? (
              <TrendingUp className="h-5 w-5 text-violet-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
          </div>
        </div>
      </div>

      {/* Regra de Negócio Informação */}
      <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-850 bg-neutral-50 dark:bg-neutral-900/50 flex gap-3 items-start text-xs text-neutral-500 leading-relaxed">
        <HelpCircle className="h-4.5 w-4.5 text-neutral-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-neutral-800 dark:text-neutral-300 block mb-0.5">Critérios de Elegibilidade:</span>
          <span>Considera colaboradores com os status <strong>ATIVO</strong> e <strong>AVISO</strong>. No caso específico de lojas do grupo <strong>ATACADÃO</strong>, o status <strong>FÉRIAS</strong> também soma no real. Os limites planejados vêm diretamente do campo Quadro cadastrado na Loja física.</span>
        </div>
      </div>

      {/* Tabela de Lojas */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-400 font-bold uppercase tracking-wider">
                <th className="py-4 px-6">Loja</th>
                <th className="py-4 px-4">Cliente</th>
                <th className="py-4 px-4">Centro de Custo</th>
                <th className="py-4 px-4 text-center">Ativos Totvs</th>
                <th className="py-4 px-4 text-center">Quadro Gestão</th>
                <th 
                  onClick={handleToggleOrdenacaoDesvio}
                  className="py-4 px-4 text-center cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-855 transition-colors group"
                  title="Clique para ordenar por desvio"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Desvio</span>
                    {ordenacao === 'desvio_desc' ? (
                      <span className="text-primary font-bold">↓</span>
                    ) : ordenacao === 'desvio_asc' ? (
                      <span className="text-primary font-bold">↑</span>
                    ) : (
                      <span className="text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-400">⇅</span>
                    )}
                  </div>
                </th>
                <th 
                  onClick={handleToggleOrdenacao}
                  className="py-4 px-4 text-center cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-855 transition-colors group"
                  title="Clique para ordenar por presenças de ontem"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Presenças Ontem</span>
                    {ordenacao === 'presencas_desc' ? (
                      <span className="text-primary font-bold">↓</span>
                    ) : ordenacao === 'presencas_asc' ? (
                      <span className="text-primary font-bold">↑</span>
                    ) : (
                      <span className="text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-400">⇅</span>
                    )}
                  </div>
                </th>
                <th 
                  onClick={handleToggleOrdenacaoAderencia}
                  className="py-4 px-4 text-center cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-855 transition-colors group"
                  title="Clique para ordenar por presença em relação ao quadro"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Presença/Quadro (%)</span>
                    {ordenacao === 'aderencia_desc' ? (
                      <span className="text-primary font-bold">↓</span>
                    ) : ordenacao === 'aderencia_asc' ? (
                      <span className="text-primary font-bold">↑</span>
                    ) : (
                      <span className="text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-400">⇅</span>
                    )}
                  </div>
                </th>
                <th className="py-4 px-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-850">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-6"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-40" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-24" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-16" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-8 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-8 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-8 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-8 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-8 mx-auto" /></td>
                    <td className="py-4 px-6"><div className="h-6 bg-neutral-100 dark:bg-neutral-800 rounded w-24 mx-auto" /></td>
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-neutral-400 italic">
                    Nenhuma loja ativa encontrada para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.loja_id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/20 transition-colors">
                    <td className="py-4 px-6 font-bold text-neutral-850 dark:text-neutral-200">
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => handleOpenLoja({ id: row.loja_id, nome: row.nome_referencia })}
                          className="text-left font-bold text-primary hover:underline hover:text-primary-active focus:outline-none transition-colors"
                          title="Clique para ver o calendário de presenças reais"
                        >
                          {row.nome_referencia}
                        </button>
                        {row.is_atacadao && (
                          <span className="inline-flex self-start px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20">
                            Férias Contam
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-neutral-600 dark:text-neutral-400 font-medium">{row.cliente}</td>
                    <td className="py-4 px-4 text-neutral-500 font-mono">{row.centro_de_custo}</td>
                    <td className="py-4 px-4 text-center font-bold text-neutral-900 dark:text-neutral-100">{row.quadro_planejado}</td>
                    <td className="py-4 px-4 text-center font-bold text-neutral-900 dark:text-neutral-100">{row.headcount_real}</td>
                    <td className="py-4 px-4 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        row.desvio > 0 
                          ? 'bg-violet-500/10 text-violet-750 border border-violet-500/20' 
                          : row.desvio < 0 
                          ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20' 
                          : 'bg-green-550/10 text-green-700 border border-green-500/20'
                      }`}>
                        {row.desvio > 0 ? `+${row.desvio}` : row.desvio}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-neutral-900 dark:text-neutral-100">
                      {row.presencas_ultimo_dia}
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-neutral-900 dark:text-neutral-100">
                      {row.quadro_planejado > 0 ? `${row.aderencia}%` : '-'}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <button
                        onClick={() => handleSyncLoja(row.loja_id)}
                        disabled={syncingLojas[row.loja_id]}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-850 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-[10px] font-bold rounded-lg transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed border border-neutral-200 dark:border-neutral-800 shadow-xs"
                        title="Sincronizar batidas dos últimos 3 dias desta loja"
                      >
                        <RefreshCw className={`h-3 w-3 ${syncingLojas[row.loja_id] ? 'animate-spin' : ''}`} />
                        Sincronizar 3d
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-850 text-xs font-semibold text-neutral-700 dark:text-neutral-300 disabled:opacity-55 hover:bg-neutral-50 dark:hover:bg-neutral-850 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            Anterior
          </button>
          <span className="text-xs text-neutral-500 font-medium">
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-850 text-xs font-semibold text-neutral-700 dark:text-neutral-300 disabled:opacity-55 hover:bg-neutral-50 dark:hover:bg-neutral-850 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            Próximo
          </button>
        </div>
      )}

      {/* Modal do Calendário de Presenças GeoVictoria */}
      {selectedLoja && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto transition-opacity duration-200">
          <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl flex flex-col gap-6 relative max-h-[90vh]">
            
            {/* Cabeçalho do Modal */}
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-6 w-6 text-primary" />
                <div>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50">
                    Histórico de Presenças Reais — GeoVictoria
                  </h2>
                  <p className="text-xs text-neutral-500 font-medium">
                    Loja: <span className="text-neutral-800 dark:text-neutral-300 font-bold">{selectedLoja.nome}</span>
                  </p>
                </div>
              </div>
              
              <button
                onClick={() => setSelectedLoja(null)}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sub-Cabeçalho com Controles */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-neutral-450 uppercase">Mês de Referência:</span>
                <input
                  type="month"
                  value={anoMes}
                  onChange={(e) => setAnoMes(e.target.value)}
                  className="bg-neutral-55 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 text-neutral-800 dark:text-neutral-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary font-bold"
                />
              </div>

              {selectedLoja && (() => {
                const lojaInfo = data.find(row => row.loja_id === selectedLoja.id);
                return lojaInfo ? (
                  <div className="text-[11px] text-neutral-500 font-medium flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-neutral-400" />
                    <span>Última Sincronização:</span>
                    <span className="font-bold text-neutral-700 dark:text-neutral-300">
                      {formatarDataSincronizacao(lojaInfo.geovictoria_sincronizado_em)}
                    </span>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Corpo do Modal em Duas Colunas */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pr-1">
              
              {/* Calendário (Col 1 a 7) */}
              <div className="lg:col-span-7 flex flex-col gap-4 border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block border-b border-neutral-100 dark:border-neutral-850 pb-1.5">
                  Calendário Mensal
                </span>

                {loadingCalendario ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-8 w-8 text-neutral-400 animate-spin" />
                    <span className="text-xs text-neutral-550 italic">Carregando dados do relógio...</span>
                  </div>
                ) : errorCalendario ? (
                  <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-650 rounded-lg text-xs flex gap-2 items-center">
                    <AlertCircle className="h-4.5 w-4.5" />
                    <span>{errorCalendario}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Dias da Semana */}
                    <div className="grid grid-cols-7 gap-1 text-center font-bold text-neutral-400 text-[10px] uppercase">
                      <div>Dom</div>
                      <div>Seg</div>
                      <div>Ter</div>
                      <div>Qua</div>
                      <div>Qui</div>
                      <div>Sex</div>
                      <div>Sáb</div>
                    </div>

                    {/* Grade de Dias */}
                    <div className="grid grid-cols-7 gap-1.5">
                      {obterDiasDoMes(anoMes).map((item, idx) => {
                        if (!item) {
                          return <div key={`empty-${idx}`} className="aspect-square bg-neutral-50/20 dark:bg-neutral-900/10 rounded-lg" />;
                        }

                        const presencas = calendarioDados[item.dataStr] || 0;
                        const isSelected = selectedDia === item.dataStr;
                        const temPresencas = presencas > 0;

                        return (
                          <button
                            key={item.dataStr}
                            onClick={() => setSelectedDia(item.dataStr)}
                            className={`aspect-square p-1.5 flex flex-col justify-between border rounded-xl hover:border-primary transition-all text-left relative ${
                              isSelected 
                                ? 'bg-primary/10 border-primary ring-2 ring-primary/20' 
                                : temPresencas
                                ? 'bg-green-500/5 dark:bg-green-500/10 border-green-500/20 hover:bg-green-500/10'
                                : 'bg-neutral-50/50 dark:bg-neutral-950/30 border-neutral-150 dark:border-neutral-850 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                            }`}
                          >
                            <span className={`text-xs font-bold ${
                              isSelected ? 'text-primary' : 'text-neutral-700 dark:text-neutral-300'
                            }`}>
                              {item.dia}
                            </span>
                            {temPresencas && (
                              <span className="px-1 py-0.5 rounded-md text-[9px] font-extrabold bg-green-500/10 text-green-700 dark:text-green-400 self-end">
                                {presencas}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Detalhes do Dia Selecionado (Col 8 a 12) */}
              <div className="lg:col-span-5 flex flex-col gap-4 border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl max-h-[50vh] lg:max-h-none overflow-y-auto">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block border-b border-neutral-100 dark:border-neutral-850 pb-1.5">
                  Detalhamento de Entrada
                </span>

                {!selectedDia ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center gap-3 text-neutral-400 dark:text-neutral-500 italic">
                    <UserCheck className="h-10 w-10 text-neutral-300 dark:text-neutral-700" />
                    <span className="text-xs">Selecione um dia no calendário para visualizar as presenças físicas detalhadas.</span>
                  </div>
                ) : loadingColaboradores ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-6 w-6 text-neutral-400 animate-spin" />
                    <span className="text-xs text-neutral-550 italic">Buscando batidas do dia...</span>
                  </div>
                ) : colaboradoresDia.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center gap-2 text-neutral-400 italic">
                    <Clock className="h-8 w-8 text-neutral-300 dark:text-neutral-800" />
                    <span className="text-xs">Nenhuma presença física registrada nesta filial no dia {selectedDia.split('-').reverse().join('/')}.</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-950 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
                      <span className="text-[10px] font-bold uppercase text-neutral-450">Dia Selecionado:</span>
                      <span className="text-xs font-extrabold text-neutral-800 dark:text-neutral-200">
                        {selectedDia.split('-').reverse().join('/')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-neutral-400 px-1 border-b border-neutral-100 dark:border-neutral-850 pb-1">
                      <span>Colaborador</span>
                      <span>Horário</span>
                    </div>

                    <div className="divide-y divide-neutral-100 dark:divide-neutral-850 max-h-[35vh] lg:max-h-[50vh] overflow-y-auto pr-1">
                      {colaboradoresDia.map((colab) => (
                        <div key={colab.punch_id} className="py-2 flex items-center justify-between text-xs gap-3">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="font-bold text-neutral-800 dark:text-neutral-200 truncate">{colab.nome}</span>
                            <div className="flex gap-2 text-[10px] text-neutral-500 font-medium">
                              <span>RE: {colab.re}</span>
                              <span>•</span>
                              <span className="truncate">{colab.cargo}</span>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 shrink-0">
                            {colab.horario_entrada}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}

