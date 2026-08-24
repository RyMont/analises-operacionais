import { Eye, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface ComparativoLinhaData {
  loja_id: number;
  loja_nome: string;
  supervisor: string;
  coordenador: string;
  uf: string;
  competencia: string;
  competencia_label: string;
  orcado: number;
  realizado: number;
  desvio: number;
}

interface ComparativoTableProps {
  resultados: ComparativoLinhaData[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  setCurrentPage: (page: number) => void;
  onVerDetalhes: (lojaId: number, lojaNome: string, competencia: string, competenciaLabel: string) => void;
  onExportarExcel?: () => void;
}

export default function ComparativoTable({
  resultados,
  loading,
  currentPage,
  totalPages,
  setCurrentPage,
  onVerDetalhes,
  onExportarExcel,
}: ComparativoTableProps) {
  
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs flex flex-col">
      {/* Título e Subtítulo */}
      <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
            Comparativo por Filial Física
          </h3>
          <p className="text-[10px] text-neutral-450 mt-0.5 font-medium">
            Listagem detalhada das metas orçamentárias vs despesas de folha
          </p>
        </div>
        {onExportarExcel && (
          <button
            type="button"
            onClick={onExportarExcel}
            disabled={loading || resultados.length === 0}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 border border-emerald-600/30 dark:border-emerald-500/30 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Exportar dados para Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Exportar para Excel</span>
          </button>
        )}
      </div>

      {/* Tabela de Dados */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-100 dark:border-neutral-800 text-[10px] font-extrabold text-neutral-450 uppercase tracking-wider">
              <th className="py-3 px-5">Filial Física</th>
              <th className="py-3 px-5">Supervisor</th>
              <th className="py-3 px-5">Coordenador</th>
              <th className="py-3 px-5 text-center">UF</th>
              <th className="py-3 px-5 text-right">Orçado (Escopo)</th>
              <th className="py-3 px-5 text-right">Real (Folha)</th>
              <th className="py-3 px-5 text-center">Desvio</th>
              <th className="py-3 px-5 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300">
            {loading && resultados.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-20 text-center text-xs text-neutral-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <span className="animate-spin text-neutral-400">...</span>
                    <span>Carregando dados comparativos...</span>
                  </div>
                </td>
              </tr>
            ) : resultados.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-xs text-neutral-400 italic">
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              resultados.map((item, idx) => {
                const desvioClass = item.desvio > 0 
                  ? 'text-red-650 bg-red-200 dark:bg-red-950/20 dark:text-red-400' 
                  : 'text-emerald-650 bg-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400';
                
                return (
                  <tr key={`${item.loja_id}-${item.competencia}-${idx}`} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/20 transition-colors">
                    <td className="py-3.5 px-5 font-semibold text-neutral-850 dark:text-neutral-200">
                      {item.loja_nome}
                    </td>
                    <td className="py-3.5 px-5 text-neutral-500 font-medium">{item.supervisor}</td>
                    <td className="py-3.5 px-5 text-neutral-500 font-medium">{item.coordenador}</td>
                    <td className="py-3.5 px-5 text-center font-mono">{item.uf}</td>
                    <td className="py-3.5 px-5 text-right font-mono text-neutral-500">{formatCurrency(item.orcado)}</td>
                    <td className="py-3.5 px-5 text-right font-mono text-neutral-850 dark:text-neutral-200">{formatCurrency(item.realizado)}</td>
                    <td className="py-3.5 px-5 text-center font-mono">
                      <span className={`inline-flex items-center px-2 py-0.5 w-24 h-8 justify-center whitespace-nowrap rounded text-[10px] font-bold ${desvioClass}`}>
                        {item.desvio > 0}{formatCurrency(item.desvio)}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <button
                        type="button"
                        onClick={() => onVerDetalhes(item.loja_id, item.loja_nome, item.competencia, item.competencia_label)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:hover:bg-neutral-800 dark:text-neutral-300 transition-colors text-[10px] font-bold cursor-pointer"
                        title="Ver Detalhado por Rubricas"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Detalhar</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de Paginação */}
      {totalPages > 1 && (
        <div className="px-5 py-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-neutral-900/50">
          <span className="text-[10px] font-bold text-neutral-550 uppercase">
            Página {currentPage} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
