import { DollarSign, Scale, TrendingUp, Users } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface ComparativoKPIsProps {
  kpis: {
    orcado_total: number;
    realizado_total: number;
    desvio_total: number;
    colaboradores_receberam_total?: number;
    funcionarios_total?: number;
  };
  loadingData: boolean;
}

/**
 * Componente que exibe os cartões de KPIs do painel de Comparativo (Raio-X).
 * 
 * Por que existe: Isola os blocos visuais de métricas consolidadas de
 * orçamento estimado (escopo) vs custo de folha real, a diferença acumulada
 * e a proporção de colaboradores que receberam alguma verba sobre o quadro total.
 */
export default function ComparativoKPIs({ kpis, loadingData }: ComparativoKPIsProps) {
  const isDesvioPositivo = kpis.desvio_total > 0;
  const receberam = kpis.colaboradores_receberam_total ?? 0;
  const totalAtivos = kpis.funcionarios_total ?? 0;
  const percentualAdesao = totalAtivos > 0 ? Math.round((receberam / totalAtivos) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Total Orçado (Escopo) */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-3">
        <div className="flex items-center justify-between text-neutral-450">
          <span className="text-[10px] font-bold uppercase tracking-wider">Custo Orçado (Escopo)</span>
          <DollarSign className="h-4 w-4 text-violet-500" />
        </div>
        <div className="space-y-1">
          <span className="text-xl font-extrabold font-mono text-neutral-900 dark:text-neutral-50 block">
            {loadingData ? '...' : formatCurrency(kpis.orcado_total)}
          </span>
          <span className="text-[10px] text-neutral-500 font-medium block">
            Previsão acumulada dos escopos
          </span>
        </div>
      </div>

      {/* Total Realizado (Folha) */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-3">
        <div className="flex items-center justify-between text-neutral-450">
          <span className="text-[10px] font-bold uppercase tracking-wider">Custo Real (Folha)</span>
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="space-y-1">
          <span className="text-xl font-extrabold font-mono text-neutral-900 dark:text-neutral-50 block">
            {loadingData ? '...' : formatCurrency(kpis.realizado_total)}
          </span>
          <span className="text-[10px] text-neutral-500 font-medium block">
            Soma acumulada de proventos
          </span>
        </div>
      </div>

      {/* Desvio Geral (Custo Real - Orçado) */}
      <div className={`border rounded-2xl p-5 shadow-xs shadow-sm space-y-3 relative overflow-hidden ${
        isDesvioPositivo 
          ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300' 
          : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider">Desvio Acumulado</span>
          <Scale className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <span className="text-xl font-extrabold font-mono block">
            {loadingData ? '...' : (isDesvioPositivo ? '+' : '') + formatCurrency(kpis.desvio_total)}
          </span>
          <span className="text-[10px] font-medium block">
            {isDesvioPositivo 
              ? 'Gasto acima do orçado planejado' 
              : 'Economia gerada em relação ao escopo'
            }
          </span>
        </div>
      </div>

      {/* Total de Colaboradores e Quadro Ativo */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-3">
        <div className="flex items-center justify-between text-neutral-450">
          <span className="text-[10px] font-bold uppercase tracking-wider">Quadro de Colaboradores</span>
          <Users className="h-4 w-4 text-blue-500" />
        </div>
        <div className="space-y-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xl font-extrabold font-mono text-neutral-900 dark:text-neutral-50 block">
              {loadingData ? '...' : receberam.toLocaleString('pt-BR')}
            </span>
            <span className="text-xs font-semibold text-neutral-400 font-mono">
              / {loadingData ? '...' : totalAtivos.toLocaleString('pt-BR')}
            </span>
            {!loadingData && totalAtivos > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30 ml-auto">
                {percentualAdesao}%
              </span>
            )}
          </div>
          <span className="text-[10px] text-neutral-500 font-medium block">
            {loadingData
              ? 'Calculando quadro...'
              : `${receberam.toLocaleString('pt-BR')} receberam verba de ${totalAtivos.toLocaleString('pt-BR')} no período`}
          </span>
        </div>
      </div>
    </div>
  );
}

