import { useEffect, useState, useCallback, useRef } from 'react';
import { 
  AlertCircle, 
  Coins, 
  ClipboardList, 
  DollarSign, 
  Clock, 
  TrendingUp
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
  Bar
} from 'recharts';
import api, { getBackendPort } from '../api/client';
import DiariasFilter from '../components/Diarias/DiariasFilter';
import DiariasTable, { type DiariaData } from '../components/Diarias/DiariasTable';

const CORES_PIE = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6b7280'];

/**
 * Página do Dashboard de Diárias Operacionais (BI).
 * 
 * Por que existe: Centraliza a visualização corporativa e auditoria de diárias
 * solicitadas pelas filiais. Permite o acompanhamento rápido de KPIs financeiros,
 * distribuição gráfica das despesas e delega a filtragem e a listagem detalhada
 * de diárias para subcomponentes isolados.
 */
export default function Diarias() {
  // Estados de dados
  const [diarias, setDiarias] = useState<DiariaData[]>([]);
  const [kpis, setKpis] = useState({
    valor_total: 0,
    quantidade_total: 0,
    preco_medio: 0,
    pendentes: 0
  });
  const [graficos, setGraficos] = useState({
    mensal: [] as { mes: string; faturamento: number }[],
    status: [] as { status: string; quantidade: number; total: number }[],
    turno: [] as { turno: string; quantidade: number; total: number }[],
    motivo: [] as { motivo: string; quantidade: number; total: number }[],
    uf: [] as { uf: string; quantidade: number; total: number }[],
    coordenador: [] as { coordenador: string; quantidade: number; total: number }[],
    lojas: [] as { loja: string; quantidade: number; total: number }[]
  });

  // Estados dos filtros
  const [filtroMesAno, setFiltroMesAno] = useState('');
  const [filtroLoja, setFiltroLoja] = useState('');
  const [filtroDiarista, setFiltroDiarista] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('');
  const [filtroMotivo, setFiltroMotivo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroSupervisor, setFiltroSupervisor] = useState('');
  const [filtroCoordenador, setFiltroCoordenador] = useState('');
  const [filtroUf, setFiltroUf] = useState('');
  const [filtroOrderType, setFiltroOrderType] = useState('');

  // Estados de paginação e UI
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingData, setLoadingData] = useState(true);
  const lastQueryId = useRef(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Função para lidar com erros passados pelos filhos
  const handleFilterError = useCallback((msg: string | null) => {
    setErrorMsg(msg);
  }, []);

  // Carrega as diárias e dados de BI com base nos filtros selecionados
  useEffect(() => {
    const fetchDiarias = async () => {
      setLoadingData(true);
      setErrorMsg(null);
      const queryId = ++lastQueryId.current;
      try {
        const params = new URLSearchParams();
        params.append('page', String(currentPage));
        
        if (filtroMesAno) params.append('mes_ano', filtroMesAno);
        if (filtroLoja) params.append('loja', filtroLoja);
        if (filtroDiarista) params.append('diarista', filtroDiarista);
        if (filtroTurno) params.append('turno', filtroTurno);
        if (filtroMotivo) params.append('motivo', filtroMotivo);
        if (filtroStatus) params.append('status', filtroStatus);
        if (filtroSupervisor) params.append('supervisor', filtroSupervisor);
        if (filtroCoordenador) params.append('coordenador', filtroCoordenador);
        if (filtroUf) params.append('uf', filtroUf);
        if (filtroOrderType) params.append('order_type', filtroOrderType);

        const response = await api.get(`/diarias/?${params.toString()}`);
        
        if (queryId !== lastQueryId.current) return;

        if (response.data) {
          const results = response.data.results || {};
          setDiarias(results.resultados || []);
          setKpis(results.kpis || { valor_total: 0, quantidade_total: 0, preco_medio: 0, pendentes: 0 });
          setGraficos(results.graficos || { mensal: [], status: [], turno: [], motivo: [], uf: [], coordenador: [], lojas: [] });
          
          const count = response.data.count || 0;
          setTotalPages(Math.ceil(count / 20) || 1);
        }
      } catch (err) {
        if (queryId !== lastQueryId.current) return;
        console.error('Erro ao buscar listagem de diárias:', err);
        setErrorMsg('Não foi possível carregar os dados do painel de diárias.');
      } finally {
        if (queryId === lastQueryId.current) {
          setLoadingData(false);
        }
      }
    };

    fetchDiarias();
  }, [
    currentPage,
    fetchTrigger
  ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    setFetchTrigger(prev => prev + 1);
  };

  const handleLimparFiltros = () => {
    setFiltroMesAno('');
    setFiltroLoja('');
    setFiltroDiarista('');
    setFiltroTurno('');
    setFiltroMotivo('');
    setFiltroStatus('');
    setFiltroSupervisor('');
    setFiltroCoordenador('');
    setFiltroUf('');
    setFiltroOrderType('');
    setCurrentPage(1);
    setFetchTrigger(prev => prev + 1);
  };

  const [isExporting, setIsExporting] = useState(false);

  // Exportar todas as diárias filtradas para Excel (.xlsx)
  const handleExportarExcel = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (filtroMesAno) params.append('mes_ano', filtroMesAno);
      if (filtroLoja) params.append('loja', filtroLoja);
      if (filtroDiarista) params.append('diarista', filtroDiarista);
      if (filtroTurno) params.append('turno', filtroTurno);
      if (filtroMotivo) params.append('motivo', filtroMotivo);
      if (filtroStatus) params.append('status', filtroStatus);
      if (filtroSupervisor) params.append('supervisor', filtroSupervisor);
      if (filtroCoordenador) params.append('coordenador', filtroCoordenador);
      if (filtroUf) params.append('uf', filtroUf);
      if (filtroOrderType) params.append('order_type', filtroOrderType);

      const response = await api.get(`/diarias/exportar/?${params.toString()}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const dataHoje = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `diarias_${dataHoje}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Erro ao exportar diárias para Excel:', err);
      // Fallback via URL direta
      const params = new URLSearchParams();
      if (filtroMesAno) params.append('mes_ano', filtroMesAno);
      if (filtroLoja) params.append('loja', filtroLoja);
      if (filtroDiarista) params.append('diarista', filtroDiarista);
      if (filtroTurno) params.append('turno', filtroTurno);
      if (filtroMotivo) params.append('motivo', filtroMotivo);
      if (filtroStatus) params.append('status', filtroStatus);
      if (filtroSupervisor) params.append('supervisor', filtroSupervisor);
      if (filtroCoordenador) params.append('coordenador', filtroCoordenador);
      if (filtroUf) params.append('uf', filtroUf);
      if (filtroOrderType) params.append('order_type', filtroOrderType);
      const url = `http://${window.location.hostname}:${getBackendPort()}/diarias/exportar/?${params.toString()}`;
      window.open(url, '_blank');
    } finally {
      setIsExporting(false);
    }
  };

  const formatarReal = (valor: number) => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Desempenho de Diárias Operacionais</h1>
          <p className="text-sm text-neutral-500 font-medium">Análise completa e conciliação de custos de diaristas nas lojas físicas</p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm flex gap-3 items-center">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filtros de Diárias */}
      <DiariasFilter
        filtroMesAno={filtroMesAno}
        setFiltroMesAno={setFiltroMesAno}
        filtroLoja={filtroLoja}
        setFiltroLoja={setFiltroLoja}
        filtroDiarista={filtroDiarista}
        setFiltroDiarista={setFiltroDiarista}
        filtroTurno={filtroTurno}
        setFiltroTurno={setFiltroTurno}
        filtroMotivo={filtroMotivo}
        setFiltroMotivo={setFiltroMotivo}
        filtroStatus={filtroStatus}
        setFiltroStatus={setFiltroStatus}
        filtroSupervisor={filtroSupervisor}
        setFiltroSupervisor={setFiltroSupervisor}
        filtroCoordenador={filtroCoordenador}
        setFiltroCoordenador={setFiltroCoordenador}
        filtroUf={filtroUf}
        setFiltroUf={setFiltroUf}
        filtroOrderType={filtroOrderType}
        setFiltroOrderType={setFiltroOrderType}
        onSubmit={handleSearchSubmit}
        onClear={handleLimparFiltros}
        onError={handleFilterError}
      />

      {/* Painel Geral: Dashboards e Tabelas */}
      <main className="space-y-6">
        {/* Cards de KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Valor Total */}
          <div className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border border-neutral-900 dark:border-white rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between opacity-70">
              <span className="text-[10px] font-bold uppercase tracking-wider">Custo Acumulado</span>
              <DollarSign className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <span className="text-xl font-extrabold font-mono block">
                {loadingData ? '...' : formatarReal(kpis.valor_total)}
              </span>
              <span className="text-[10px] opacity-75 font-medium block">
                Valor bruto consolidado
              </span>
            </div>
          </div>

          {/* Quantidade Total */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-3">
            <div className="flex items-center justify-between text-neutral-450">
              <span className="text-[10px] font-bold uppercase tracking-wider">Quantidade Diárias</span>
              <ClipboardList className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <span className="text-xl font-extrabold font-mono text-neutral-900 dark:text-neutral-50 block">
                {loadingData ? '...' : kpis.quantidade_total.toLocaleString()}
              </span>
              <span className="text-[10px] text-neutral-500 font-medium block">
                Serviços executados
              </span>
            </div>
          </div>

          {/* Preço Médio */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-3">
            <div className="flex items-center justify-between text-neutral-450">
              <span className="text-[10px] font-bold uppercase tracking-wider">Média por Diária</span>
              <Coins className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <span className="text-xl font-extrabold font-mono text-neutral-900 dark:text-neutral-50 block">
                {loadingData ? '...' : formatarReal(kpis.preco_medio)}
              </span>
              <span className="text-[10px] text-neutral-500 font-medium block">
                Custo médio por diária
              </span>
            </div>
          </div>

          {/* Diárias Pendentes */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-3">
            <div className="flex items-center justify-between text-neutral-450">
              <span className="text-[10px] font-bold uppercase tracking-wider">Diárias Pendentes</span>
              <Clock className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <span className={`text-xl font-extrabold font-mono block ${
                kpis.pendentes > 0 ? 'text-amber-500' : 'text-neutral-900 dark:text-neutral-50'
              }`}>
                {loadingData ? '...' : kpis.pendentes.toLocaleString()}
              </span>
              <span className="text-[10px] text-neutral-500 font-medium block">
                Aguardando aprovações
              </span>
            </div>
          </div>
        </div>

        {/* Gráficos BI */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Gráfico de Linha: Custo Mensal */}
          <div className="md:col-span-8 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                Evolução do Custo Mensal (R$)
              </h3>
              <TrendingUp className="h-4 w-4 text-neutral-400" />
            </div>
            <div className="h-64">
              {loadingData ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                  Carregando evolução...
                </div>
              ) : graficos.mensal.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400 italic">
                  Sem registros para plotar o histórico
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={graficos.mensal} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="mes" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${v}`} />
                    <Tooltip 
                      contentStyle={{ background: '#171717', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }} 
                      formatter={(value: any, name: any) => [formatarReal(Number(value)), name]}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="faturamento" 
                      name="Custo"
                      stroke="#8b5cf6" 
                      strokeWidth={3} 
                      dot={{ r: 4, style: { cursor: 'pointer' } }} 
                      activeDot={{ r: 6, style: { cursor: 'pointer' } }}
                      style={{ cursor: 'pointer' }}
                      onClick={(data: any) => {
                        if (data && data.payload && data.payload.mes) {
                          const [mes, ano] = data.payload.mes.split('/');
                          const val = `${ano}-${mes}`;
                          setFiltroMesAno(prev => prev === val ? '' : val);
                          setCurrentPage(1);
                        }
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="orcamento" 
                      name="Orçamento"
                      stroke="#a3a3a3" 
                      strokeWidth={2} 
                      strokeDasharray="5 5"
                      opacity={0.5}
                      dot={false}
                      activeDot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Gráfico de Rosca: Status */}
          <div className="md:col-span-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm">
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-4">
              Distribuição por Status
            </h3>
            <div className="h-64 flex flex-col justify-between">
              <div className="h-44 relative">
                {loadingData ? (
                  <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                    Carregando...
                  </div>
                ) : graficos.status.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-neutral-400 italic">
                    Sem dados
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={graficos.status}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="quantidade"
                        nameKey="status"
                        style={{ cursor: 'pointer' }}
                        onClick={(data: any) => {
                          if (data && data.status) {
                            setFiltroStatus(prev => prev === data.status ? '' : data.status);
                            setCurrentPage(1);
                          }
                        }}
                      >
                        {graficos.status.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CORES_PIE[index % CORES_PIE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#171717', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }}
                        formatter={(value: any) => [`${value} diárias`, 'Quantidade']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {/* Legenda */}
              <div className="flex flex-wrap gap-2 justify-center pb-1 max-h-16 overflow-y-auto">
                {graficos.status.map((item, index) => (
                  <div key={item.status} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CORES_PIE[index % CORES_PIE.length] }} />
                    <span className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400 truncate max-w-24">
                      {item.status} ({item.quantidade})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Gráficos de Barras: Motivos & Turno */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top 5 Motivos */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm">
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-4">
              Principais Motivos de Diárias (R$)
            </h3>
            <div className="h-60">
              {loadingData ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                  Carregando motivos...
                </div>
              ) : graficos.motivo.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400 italic">
                  Nenhum registro
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={graficos.motivo.slice(0, 5)} layout="vertical" margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                    <XAxis type="number" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis dataKey="motivo" type="category" stroke="#888888" fontSize={9} width={100} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#171717', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }}
                      formatter={(value: any) => [formatarReal(Number(value)), 'Valor']}
                    />
                    <Bar 
                      dataKey="total" 
                      fill="#3b82f6" 
                      radius={[0, 4, 4, 0]} 
                      style={{ cursor: 'pointer' }}
                      onClick={(data: any) => {
                        if (data && data.motivo) {
                          setFiltroMotivo(prev => prev === data.motivo ? '' : data.motivo);
                          setCurrentPage(1);
                        }
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Turnos */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm">
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-4">
              Custo de Diárias por Turno (R$)
            </h3>
            <div className="h-60">
              {loadingData ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                  Carregando turnos...
                </div>
              ) : graficos.turno.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400 italic">
                  Sem registros
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={graficos.turno} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="turno" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${v}`} />
                    <Tooltip
                      contentStyle={{ background: '#171717', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }}
                      formatter={(value: any) => [formatarReal(Number(value)), 'Total']}
                    />
                    <Bar 
                      dataKey="total" 
                      fill="#10b981" 
                      radius={[4, 4, 0, 0]} 
                      style={{ cursor: 'pointer' }}
                      onClick={(data: any) => {
                        if (data && data.turno) {
                          setFiltroTurno(prev => prev === data.turno ? '' : data.turno);
                          setCurrentPage(1);
                        }
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Gráficos de Comparação: UF & Coordenador */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* UFs */}
          <div className="md:col-span-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm">
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-4">
              Comparação de Custo por UF (R$)
            </h3>
            <div className="h-60">
              {loadingData ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                  Carregando UFs...
                </div>
              ) : !graficos.uf || graficos.uf.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400 italic">
                  Sem registros
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={graficos.uf} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="uf" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${v}`} />
                    <Tooltip
                      contentStyle={{ background: '#171717', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }}
                      formatter={(value: any) => [formatarReal(Number(value)), 'Total']}
                    />
                    <Bar 
                      dataKey="total" 
                      fill="#f59e0b" 
                      radius={[4, 4, 0, 0]}
                      style={{ cursor: 'pointer' }}
                      onClick={(data: any) => {
                        if (data && data.uf) {
                          const val = data.uf === 'N/A' ? 'null' : data.uf;
                          setFiltroUf(prev => prev === val ? '' : val);
                          setCurrentPage(1);
                        }
                      }}
                    >
                      {graficos.uf.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CORES_PIE[index % CORES_PIE.length]} style={{ cursor: 'pointer' }} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Coordenadores */}
          <div className="md:col-span-8 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm">
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-4">
              Comparação de Custo por Coordenador (R$)
            </h3>
            <div className="h-60">
              {loadingData ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                  Carregando coordenadores...
                </div>
              ) : !graficos.coordenador || graficos.coordenador.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400 italic">
                  Sem registros
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={graficos.coordenador} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <XAxis type="number" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis dataKey="coordenador" type="category" stroke="#888888" fontSize={9} width={110} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#171717', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }}
                      formatter={(value: any) => [formatarReal(Number(value)), 'Total']}
                    />
                    <Bar 
                      dataKey="total" 
                      fill="#8b5cf6" 
                      radius={[0, 4, 4, 0]} 
                      style={{ cursor: 'pointer' }}
                      onClick={(data: any) => {
                        if (data && data.coordenador) {
                          const val = data.coordenador === 'N/A' ? 'null' : data.coordenador;
                          setFiltroCoordenador(prev => prev === val ? '' : val);
                          setCurrentPage(1);
                        }
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Gráfico Top 10 Lojas com Maiores Gastos */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm">
          <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-4">
            Top 10 Lojas com Maiores Gastos de Diárias (R$)
          </h3>
          <div className="h-64">
            {loadingData ? (
              <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                Carregando lojas...
              </div>
            ) : !graficos.lojas || graficos.lojas.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-neutral-400 italic">
                Nenhuma diária registrada
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={graficos.lojas} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <XAxis dataKey="loja" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${v}`} />
                  <Tooltip
                    contentStyle={{ background: '#171717', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }}
                    formatter={(value: any) => [formatarReal(Number(value)), 'Gasto Total']}
                  />
                  <Bar 
                    dataKey="total" 
                    fill="#10b981" 
                    radius={[4, 4, 0, 0]}
                    style={{ cursor: 'pointer' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tabela de Diárias */}
        <DiariasTable
          diarias={diarias}
          loading={loadingData}
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
          onExportarExcel={handleExportarExcel}
          isExporting={isExporting}
        />
      </main>
    </div>
  );
}
