import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { BarChart3, PieChart as PieIcon, Building2, FileSpreadsheet, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface TopVerbaItem {
  codigo: string;
  nome: string;
  descricao: string;
  valor: number;
  percentual: number;
  categoria: string;
}

export interface TopLojaItem {
  loja_id: number;
  nome: string;
  uf: string;
  coordenador: string;
  supervisor: string;
  valor: number;
  percentual: number;
  qtd_colaboradores: number;
  qtd_linhas: number;
}

interface CategoriaItem {
  categoria: string;
  valor: number;
  percentual: number;
}

interface ComparativoPorVerbaChartsProps {
  loading: boolean;
  topVerbas: TopVerbaItem[];
  topLojas?: TopLojaItem[];
  categorias: CategoriaItem[];
  verbaNome?: string;
  onSelectVerba?: (codigo: string) => void;
  onExportarLojasExcel?: () => void;
  isExportingLojas?: boolean;
}

const CORES_CATEGORIAS: Record<string, string> = {
  'Salário Base': '#3b82f6',
  'Insalubridade': '#f59e0b',
  'Adicional Noturno': '#8b5cf6',
  'Verbas Extraordinárias': '#f43f5e',
};

const CORES_PADRAO = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1'
];

const CustomTooltipBar = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TopVerbaItem;
    return (
      <div className="bg-neutral-900/95 dark:bg-neutral-950/95 border border-neutral-700/60 dark:border-neutral-800 text-white p-3 rounded-xl text-xs shadow-2xl backdrop-blur-md space-y-1.5 min-w-[180px] z-50">
        <div className="border-b border-neutral-700/60 dark:border-neutral-800 pb-1.5">
          <span className="font-bold text-neutral-100">{data.codigo} — {data.descricao}</span>
          <p className="text-[10px] text-neutral-400 font-medium">{data.categoria}</p>
        </div>
        <div className="flex justify-between items-center gap-3 text-neutral-300">
          <span className="text-neutral-400">Total:</span>
          <span className="font-mono font-bold text-white">{formatCurrency(data.valor)}</span>
        </div>
        <div className="flex justify-between items-center gap-3 text-neutral-300">
          <span className="text-neutral-400">Participação:</span>
          <span className="font-mono font-bold text-emerald-400">{data.percentual}%</span>
        </div>
      </div>
    );
  }
  return null;
};

const CustomTooltipLoja = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TopLojaItem;
    return (
      <div className="bg-neutral-900/95 dark:bg-neutral-950/95 border border-neutral-700/60 dark:border-neutral-800 text-white p-3 rounded-xl text-xs shadow-2xl backdrop-blur-md space-y-1.5 min-w-[200px] z-50">
        <div className="border-b border-neutral-700/60 dark:border-neutral-800 pb-1.5">
          <span className="font-bold text-neutral-100">{data.nome}</span>
          <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-medium mt-0.5">
            <span>UF: {data.uf}</span>
            <span>•</span>
            <span className="truncate">Coord: {data.coordenador}</span>
          </div>
        </div>
        <div className="flex justify-between items-center gap-3 text-neutral-300">
          <span className="text-neutral-400">Total na Seleção:</span>
          <span className="font-mono font-bold text-white">{formatCurrency(data.valor)}</span>
        </div>
        <div className="flex justify-between items-center gap-3 text-neutral-300">
          <span className="text-neutral-400">Participação:</span>
          <span className="font-mono font-bold text-emerald-400">{data.percentual}%</span>
        </div>
        <div className="flex justify-between items-center gap-3 text-neutral-300">
          <span className="text-neutral-400">Colaboradores:</span>
          <span className="font-mono font-bold text-neutral-200">{data.qtd_colaboradores}</span>
        </div>
      </div>
    );
  }
  return null;
};

const CustomTooltipPie = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as CategoriaItem;
    return (
      <div className="bg-neutral-900/95 dark:bg-neutral-950/95 border border-neutral-700/60 dark:border-neutral-800 text-white p-3 rounded-xl text-xs shadow-2xl backdrop-blur-md space-y-1.5 min-w-[170px] z-50">
        <div className="border-b border-neutral-700/60 dark:border-neutral-800 pb-1.5 font-bold text-neutral-100">
          {data.categoria}
        </div>
        <div className="flex justify-between items-center gap-3 text-neutral-300">
          <span className="text-neutral-400">Total:</span>
          <span className="font-mono font-bold text-white">{formatCurrency(data.valor)}</span>
        </div>
        <div className="flex justify-between items-center gap-3 text-neutral-300">
          <span className="text-neutral-400">Participação:</span>
          <span className="font-mono font-bold text-emerald-400">{data.percentual}%</span>
        </div>
      </div>
    );
  }
  return null;
};

/**
 * Componente com gráficos analíticos da aba Por Verba do Raio-X.
 * Posiciona o gráfico de barras de lojas no topo da página, totalmente dinâmico
 * com base nos filtros (verba, loja, coordenador, supervisor, UF, competência).
 */
export default function ComparativoPorVerbaCharts({
  loading,
  topVerbas,
  topLojas = [],
  categorias,
  verbaNome,
  onSelectVerba,
  onExportarLojasExcel,
  isExportingLojas = false,
}: ComparativoPorVerbaChartsProps) {
  const dadosBarrasVerbas = useMemo(() => {
    return [...topVerbas].reverse();
  }, [topVerbas]);

  const tituloLojas = verbaNome
    ? `Distribuição por Loja: ${verbaNome}`
    : 'Distribuição de Custos por Loja Física';

  return (
    <div className="space-y-6">
      {/* 1. Gráfico Principal de Lojas (Vertical, Maior à Esquerda -> Menor à Direita) */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between border-b border-neutral-100 dark:border-neutral-850 pb-3 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
                {tituloLojas}
              </h3>
              <p className="text-[11px] text-neutral-400 font-medium">
                Todas as lojas com ocorrência — maior gasto à esquerda até o menor gasto à direita
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              {topLojas.length} {topLojas.length === 1 ? 'loja encontrada' : 'lojas encontradas'}
            </span>
            {onExportarLojasExcel && (
              <button
                type="button"
                onClick={onExportarLojasExcel}
                disabled={loading || topLojas.length === 0 || isExportingLojas}
                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 border border-emerald-600/30 dark:border-emerald-500/30 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Exportar dados do gráfico de lojas para Excel (.xlsx)"
              >
                {isExportingLojas ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                <span>{isExportingLojas ? 'Exportando...' : 'Exportar para Excel'}</span>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="h-80 w-full bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-xl" />
        ) : topLojas.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-neutral-400 text-xs italic">
            Nenhuma loja física com lançamentos para os filtros aplicados.
          </div>
        ) : (
          <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
            <div style={{ minWidth: `${Math.max(700, topLojas.length * 52)}px`, height: '360px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topLojas}
                  margin={{ top: 20, right: 20, left: 10, bottom: 65 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-neutral-800/80" vertical={false} />
                  <XAxis
                    dataKey="nome"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={75}
                    tickFormatter={(val) => (val.length > 20 ? `${val.substring(0, 18)}...` : val)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={(val) => {
                      if (val >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
                      if (val >= 1000) return `R$ ${(val / 1000).toFixed(0)}k`;
                      return `R$ ${val}`;
                    }}
                  />
                  <Tooltip content={<CustomTooltipLoja />} cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }} />
                  <Bar
                    dataKey="valor"
                    radius={[6, 6, 0, 0]}
                    fill="#2563eb"
                  >
                    {topLojas.map((_, index) => (
                      <Cell
                        key={`loja-cell-${index}`}
                        fill={index === 0 ? '#1d4ed8' : index < 3 ? '#2563eb' : '#3b82f6'}
                        className="transition-opacity hover:opacity-85"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* 2. Gráficos Complementares de Rubricas e Categorias (Exibidos quando há múltiplas verbas) */}
      {topVerbas.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Top 10 Rubricas */}
          <div className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3 mb-4">
              <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Top 10 Rubricas de Maior Custo
              </h3>
              <span className="text-[11px] text-neutral-400">Valores em R$ e % de participação</span>
            </div>

            {loading ? (
              <div className="h-72 w-full bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-xl" />
            ) : topVerbas.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-neutral-400 text-xs italic">
                Nenhuma verba encontrada para os filtros aplicados.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={dadosBarrasVerbas}
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  >
                    <XAxis
                      type="number"
                      tickFormatter={(val) => {
                        if (val >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
                        if (val >= 1000) return `R$ ${(val / 1000).toFixed(0)}k`;
                        return `R$ ${val}`;
                      }}
                      stroke="#888888"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      stroke="#888888"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      width={150}
                      tickFormatter={(val) => (val.length > 20 ? `${val.substring(0, 18)}...` : val)}
                    />
                    <Tooltip content={<CustomTooltipBar />} cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }} />
                    <Bar
                      dataKey="valor"
                      radius={[0, 6, 6, 0]}
                      fill="#3b82f6"
                      className="cursor-pointer transition-opacity hover:opacity-85"
                      onClick={(entry: any) => {
                        if (onSelectVerba && entry && entry.codigo) {
                          onSelectVerba(entry.codigo);
                        }
                      }}
                    >
                      {dadosBarrasVerbas.map((entry) => (
                        <Cell
                          key={`cell-${entry.codigo}`}
                          fill={CORES_CATEGORIAS[entry.categoria] || '#3b82f6'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Distribuição por Categoria */}
          <div className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3 mb-4">
              <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-emerald-500" />
                Distribuição por Categoria
              </h3>
              <span className="text-[11px] text-neutral-400">Classificação contábil</span>
            </div>

            {loading ? (
              <div className="h-72 w-full bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-xl" />
            ) : categorias.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-neutral-400 text-xs italic">
                Nenhuma categoria para exibir.
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4 h-72">
                <div className="h-full w-full sm:w-1/2 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={categorias}
                        dataKey="valor"
                        nameKey="categoria"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {categorias.map((entry, index) => {
                          const cor = CORES_CATEGORIAS[entry.categoria] || CORES_PADRAO[index % CORES_PADRAO.length];
                          return <Cell key={`cat-cell-${index}`} fill={cor} />;
                        })}
                      </Pie>
                      <Tooltip content={<CustomTooltipPie />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="w-full sm:w-1/2 space-y-2.5 overflow-y-auto max-h-56 pr-1">
                  {categorias.map((cat, idx) => {
                    const cor = CORES_CATEGORIAS[cat.categoria] || CORES_PADRAO[idx % CORES_PADRAO.length];
                    return (
                      <div key={cat.categoria} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cor }} />
                          <span className="text-neutral-600 dark:text-neutral-300 truncate">{cat.categoria}</span>
                        </div>
                        <span className="font-mono text-neutral-900 dark:text-neutral-100 font-bold">{cat.percentual}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
