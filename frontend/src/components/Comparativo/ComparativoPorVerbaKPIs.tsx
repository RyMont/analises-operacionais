import { DollarSign, Layers, Users, Receipt, Award } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface VerbaKPIsData {
  total_realizado: number;
  total_verbas: number;
  total_colaboradores: number;
  total_lancamentos: number;
  maior_verba?: {
    codigo: string;
    descricao: string;
    valor: number;
    percentual: number;
  } | null;
}

interface ComparativoPorVerbaKPIsProps {
  kpis: VerbaKPIsData;
  loading: boolean;
}

/**
 * Componente que exibe os cartões de KPIs da análise de custos por verba do Raio-X.
 */
export default function ComparativoPorVerbaKPIs({ kpis, loading }: ComparativoPorVerbaKPIsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Total Realizado */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider">Custo Total em Verbas</span>
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <DollarSign className="h-4 w-4" />
          </div>
        </div>
        <div>
          {loading ? (
            <div className="h-7 w-28 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md" />
          ) : (
            <span className="text-xl font-extrabold text-neutral-900 dark:text-neutral-50 font-mono tracking-tight">
              {formatCurrency(kpis.total_realizado)}
            </span>
          )}
          <p className="text-[11px] text-neutral-400 mt-0.5">Soma das rubricas no período</p>
        </div>
      </div>

      {/* 2. Total de Rubricas Distintas */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider">Rubricas Distintas</span>
          <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400">
            <Layers className="h-4 w-4" />
          </div>
        </div>
        <div>
          {loading ? (
            <div className="h-7 w-16 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md" />
          ) : (
            <span className="text-xl font-extrabold text-neutral-900 dark:text-neutral-50 font-mono tracking-tight">
              {kpis.total_verbas.toLocaleString('pt-BR')}
            </span>
          )}
          <p className="text-[11px] text-neutral-400 mt-0.5">Tipos de verbas identificadas</p>
        </div>
      </div>

      {/* 3. Colaboradores Impactados */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider">Colaboradores</span>
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <Users className="h-4 w-4" />
          </div>
        </div>
        <div>
          {loading ? (
            <div className="h-7 w-20 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md" />
          ) : (
            <span className="text-xl font-extrabold text-neutral-900 dark:text-neutral-50 font-mono tracking-tight">
              {kpis.total_colaboradores.toLocaleString('pt-BR')}
            </span>
          )}
          <p className="text-[11px] text-neutral-400 mt-0.5">Total com ao menos uma verba</p>
        </div>
      </div>

      {/* 4. Total de Lançamentos */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider">Total Lançamentos</span>
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Receipt className="h-4 w-4" />
          </div>
        </div>
        <div>
          {loading ? (
            <div className="h-7 w-24 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md" />
          ) : (
            <span className="text-xl font-extrabold text-neutral-900 dark:text-neutral-50 font-mono tracking-tight">
              {kpis.total_lancamentos.toLocaleString('pt-BR')}
            </span>
          )}
          <p className="text-[11px] text-neutral-400 mt-0.5">Ocorrências na folha</p>
        </div>
      </div>

      {/* 5. Maior Rubrica */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider">Maior Impacto</span>
          <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
            <Award className="h-4 w-4" />
          </div>
        </div>
        <div>
          {loading ? (
            <div className="h-7 w-28 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-md" />
          ) : kpis.maior_verba ? (
            <>
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-neutral-900 dark:text-neutral-50 truncate" title={kpis.maior_verba.descricao}>
                  {kpis.maior_verba.codigo} — {kpis.maior_verba.descricao}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 font-mono">
                {formatCurrency(kpis.maior_verba.valor)} ({kpis.maior_verba.percentual}%)
              </p>
            </>
          ) : (
            <span className="text-sm text-neutral-400">-</span>
          )}
        </div>
      </div>
    </div>
  );
}
