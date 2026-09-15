import { AlertCircle, AlertTriangle, FileCheck2, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '../ui/pagination';
import { getStatusBadge } from '../../utils/badges';

export interface Colaborador {
  id: string;
  re: string;
  nome: string;
  cpf: string;
  cargo: string;
  centro_custo: string;
  data_admissao: string;
  data_demissao: string | null;
  status: string;
  termino_1: string | null;
  termino_2: string | null;
  funcao_gestao: string | null;
  status_gestao: string | null;
  loja_nome: string | null;
  loja_gestao_nome: string | null;
  loja_geo_nome: string | null;
  loja_coordenador?: string | null;
  loja_supervisor?: string | null;
  loja_gestao_coordenador?: string | null;
  loja_gestao_supervisor?: string | null;
  coordenador?: string | null;
  supervisor?: string | null;
  is_divergente: boolean;
  funcao_divergente: boolean;
  loja_gestao_divergente: boolean;
  loja_geo_divergente: boolean;
}

interface ColaboradoresTableProps {
  activeTab: 'ativos' | 'demitidos';
  colaboradores: Colaborador[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  count: number;
  setCurrentPage: (page: number) => void;
  onOpenDetail: (colab: Colaborador) => void;
  onExportarExcel?: () => void;
  isExporting?: boolean;
}

/**
 * Tabela de listagem dos colaboradores ativos ou demitidos.
 * 
 * Por que existe: Exibe a lista de profissionais cruzando os status do TOTVS, 
 * da planilha de Gestão de Pessoas e do relógio de ponto (GeoVictoria).
 * Apresenta coordenador, supervisor, badges de alerta se houver divergências,
 * botão de exportar planilha Excel (.xlsx) e gerencia a paginação.
 */
export default function ColaboradoresTable({
  activeTab,
  colaboradores,
  loading,
  currentPage,
  totalPages,
  count,
  setCurrentPage,
  onOpenDetail,
  onExportarExcel,
  isExporting = false,
}: ColaboradoresTableProps) {

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-sm overflow-hidden">
      {/* Barra de título e botão de exportação da tabela */}
      <div className="p-4 sm:px-6 sm:py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-850/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
            {activeTab === 'ativos' ? 'Base de Colaboradores Ativos' : 'Base de Colaboradores Demitidos'}
          </h3>
          <p className="text-xs text-neutral-500">
            Total nesta seleção: <span className="font-bold text-neutral-900 dark:text-neutral-100">{count}</span> colaboradores
          </p>
        </div>
        {onExportarExcel && (
          <button
            type="button"
            onClick={onExportarExcel}
            disabled={loading || count === 0 || isExporting}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 border border-emerald-600/30 dark:border-emerald-500/30 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="Exportar colaboradores filtrados para Excel (.xlsx)"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>{isExporting ? 'Exportando...' : 'Exportar para Excel'}</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-850 text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              <th className="py-4 px-6">Matrícula (RE)</th>
              <th className="py-4 px-6">Colaborador</th>
              <th className="py-4 px-6">Função (TOTVS / Gestão)</th>
              <th className="py-4 px-6">Lotação (TOTVS / Gestão / Geo)</th>
              <th className="py-4 px-6">Coordenador</th>
              <th className="py-4 px-6">Supervisor</th>
              <th className="py-4 px-6">Status (TOTVS / Gestão)</th>
              <th className="py-4 px-6 text-right">Auditoria</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-sm">
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="py-4 px-6">
                    <Skeleton className="h-5 w-12" />
                  </td>
                  <td className="py-4 px-6">
                    <Skeleton className="h-5 w-40 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </td>
                  <td className="py-4 px-6">
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-20" />
                  </td>
                  <td className="py-4 px-6 space-y-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </td>
                  <td className="py-4 px-6 space-y-1">
                    <Skeleton className="h-4 w-28 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="py-4 px-6 space-y-1">
                    <Skeleton className="h-4 w-28 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="py-4 px-6 space-y-1">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </td>
                  <td className="py-4 px-6 text-right">
                    <Skeleton className="h-6 w-24 ml-auto" />
                  </td>
                </tr>
              ))
            ) : colaboradores.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-neutral-400">
                  Nenhum colaborador encontrado com esta configuração de filtros.
                </td>
              </tr>
            ) : (
              colaboradores.map((colab) => (
                <tr
                  key={colab.id}
                  onClick={() => onOpenDetail(colab)}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-colors cursor-pointer"
                >
                  <td className="py-4 px-6 font-mono text-neutral-600 dark:text-neutral-400">
                    {colab.re}
                  </td>
                  <td className="py-4 px-6 min-w-0">
                    <div
                      className="font-semibold text-neutral-900 dark:text-neutral-100 truncate block"
                      title={colab.nome}
                    >
                      {colab.nome}
                    </div>
                    <div className="text-[10px] text-neutral-600 dark:text-neutral-400 font-mono">
                      CPF: {colab.cpf || '-'}
                    </div>
                  </td>
                  <td className="py-4 px-6 space-y-1">
                    <div className="text-xs font-medium text-neutral-850 dark:text-neutral-200">
                      {colab.cargo}
                    </div>
                    {activeTab === 'ativos' && (
                      <div className="text-[10px] text-neutral-550 dark:text-neutral-300">
                        <span className="font-semibold text-neutral-500 dark:text-neutral-450">
                          Gestão:
                        </span>{' '}
                        {colab.funcao_gestao || 'Em branco'}
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-6 space-y-1">
                    <div className="text-xs text-neutral-700 dark:text-neutral-300">
                      <span className="font-semibold text-neutral-500 dark:text-neutral-450">
                        TOTVS:
                      </span>{' '}
                      {colab.loja_nome || colab.centro_custo}
                    </div>
                    {activeTab === 'ativos' && (
                      <>
                        <div className="text-xs text-neutral-700 dark:text-neutral-300">
                          <span className="font-semibold text-neutral-500 dark:text-neutral-450">
                            Gestão:
                          </span>{' '}
                          {colab.loja_gestao_nome || 'Em branco'}
                        </div>
                        <div className="text-xs text-neutral-700 dark:text-neutral-300">
                          <span className="font-semibold text-neutral-500 dark:text-neutral-450">
                            Geo:
                          </span>{' '}
                          {colab.loja_geo_nome || 'Em branco'}
                        </div>
                      </>
                    )}
                  </td>
                  {/* Coordenador */}
                  <td className="py-4 px-6 space-y-1">
                    <div className="text-xs font-medium text-neutral-850 dark:text-neutral-200">
                      {colab.coordenador || colab.loja_coordenador || colab.loja_gestao_coordenador || '-'}
                    </div>
                    {activeTab === 'ativos' && colab.loja_gestao_coordenador && colab.loja_coordenador && colab.loja_gestao_coordenador !== colab.loja_coordenador && (
                      <div className="text-[10px] text-neutral-550 dark:text-neutral-400">
                        <span className="font-semibold text-neutral-500 dark:text-neutral-450">Gestão:</span>{' '}
                        {colab.loja_gestao_coordenador}
                      </div>
                    )}
                  </td>
                  {/* Supervisor */}
                  <td className="py-4 px-6 space-y-1">
                    <div className="text-xs font-medium text-neutral-850 dark:text-neutral-200">
                      {colab.supervisor || colab.loja_supervisor || colab.loja_gestao_supervisor || '-'}
                    </div>
                    {activeTab === 'ativos' && colab.loja_gestao_supervisor && colab.loja_supervisor && colab.loja_gestao_supervisor !== colab.loja_supervisor && (
                      <div className="text-[10px] text-neutral-550 dark:text-neutral-400">
                        <span className="font-semibold text-neutral-500 dark:text-neutral-450">Gestão:</span>{' '}
                        {colab.loja_gestao_supervisor}
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-6 space-y-1.5">
                    <div>{getStatusBadge(colab.status)}</div>
                    {colab.status_gestao && (
                      <div className="text-[10px] text-neutral-550 dark:text-neutral-300 font-medium">
                        <span className="font-semibold text-neutral-500 dark:text-neutral-450">
                          Gestão:
                        </span>{' '}
                        <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                          {colab.status_gestao}
                        </span>
                      </div>
                    )}
                  </td>
                  <td
                    className="py-4 px-6 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col gap-1 items-end">
                      {activeTab === 'ativos' && (
                        <>
                          {colab.funcao_divergente && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              <AlertTriangle className="h-3 w-3" />
                              Função Divergente
                            </span>
                          )}
                          {colab.loja_gestao_divergente && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                              <AlertCircle className="h-3 w-3" />
                              Gestão diferente
                            </span>
                          )}
                          {colab.loja_geo_divergente && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                              <AlertCircle className="h-3 w-3" />
                              Geo diferente
                            </span>
                          )}
                          {!colab.loja_gestao_divergente &&
                            !colab.loja_geo_divergente &&
                            !colab.funcao_divergente && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-600 border border-green-500/20">
                                <FileCheck2 className="h-3 w-3" />
                                Conciliado
                              </span>
                            )}
                        </>
                      )}
                      {activeTab === 'demitidos' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-600 border border-neutral-200">
                          Ficha Demitida
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {!loading && totalPages > 1 && (
        <div className="py-4 px-6 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            Mostrando {colaboradores.length} de {count} colaboradores
          </span>
          <Pagination className="w-auto mx-0">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                  }}
                  text="Anterior"
                  className={
                    currentPage === 1
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 px-3">
                  Página {currentPage} de {totalPages}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < totalPages)
                      setCurrentPage(currentPage + 1);
                  }}
                  text="Próxima"
                  className={
                    currentPage === totalPages
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
