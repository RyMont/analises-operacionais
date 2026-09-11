import { FileSpreadsheet, Loader2, CheckCircle2, Clock, XCircle, HelpCircle } from 'lucide-react';
import { formatCurrency as formatarReal } from '../../utils/formatters';

export interface DiariaData {
  id_diaria: string;
  diarista: string;
  local: string;
  loja_nome?: string;
  coordenador_nome?: string;
  data_servico: string;
  turno: string;
  motivo: string;
  solicitante: string;
  valor: string;
  status: string;
  ultima_atualizacao: string;
  justificativa: string;
  order_type?: string;
}

interface DiariasTableProps {
  diarias: DiariaData[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  setCurrentPage: (page: number) => void;
  onExportarExcel?: () => void;
  isExporting?: boolean;
}


// Retorna o badge estilizado de acordo com o status
const getStatusBadge = (statusStr: string) => {
  const lower = statusStr.toLowerCase();
  if (lower.includes('pago') || lower.includes('finalizado')) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" />
        {statusStr}
      </span>
    );
  }
  if (lower.includes('pendente')) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">
        <Clock className="h-3 w-3" />
        {statusStr}
      </span>
    );
  }
  if (lower.includes('rejeitado') || lower.includes('cancelado')) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20">
        <XCircle className="h-3 w-3" />
        {statusStr}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700">
      <HelpCircle className="h-3 w-3" />
      {statusStr}
    </span>
  );
};

/**
 * Tabela de listagem detalhada de Diárias.
 * 
 * Por que existe: Consolida em formato tabular todas as coberturas lançadas pelas filiais
 * com skeletons de carregamento, paginação e badges coloridos de status de pagamento.
 */
export default function DiariasTable({
  diarias,
  loading,
  currentPage,
  totalPages,
  setCurrentPage,
  onExportarExcel,
  isExporting = false,
}: DiariasTableProps) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-sm overflow-hidden">
      {/* Cabeçalho da Tabela */}
      <div className="p-5 border-b border-neutral-100 dark:border-neutral-850 flex items-center justify-between">
        <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-purple-500" />
          Detalhamento das Diárias
        </h3>
        {onExportarExcel && (
          <button
            type="button"
            onClick={onExportarExcel}
            disabled={loading || diarias.length === 0 || isExporting}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 border border-emerald-600/30 dark:border-emerald-500/30 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Exportar diárias filtradas para Excel (.xlsx)"
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
        {loading && diarias.length === 0 ? (
          <div className="py-20 text-center text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-neutral-950 dark:text-white" />
            <span>Carregando tabela de diárias...</span>
          </div>
        ) : diarias.length === 0 ? (
          <div className="py-20 text-center text-neutral-450 italic text-sm">
            Nenhuma diária localizada para os filtros especificados.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 text-xs font-bold text-neutral-700 uppercase tracking-wider">
                <th className="py-4 px-6">Diarista</th>
                <th className="py-4 px-6">Loja</th>
                <th className="py-4 px-6">Coordenador</th>
                <th className="py-4 px-6">Data</th>
                <th className="py-4 px-6">Motivo</th>
                <th className="py-4 px-6">Solicitante</th>
                <th className="py-4 px-6">Origem</th>
                <th className="py-4 px-6 text-right">Valor</th>
                <th className="py-4 px-6 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {diarias.map((d) => (
                <tr key={d.id_diaria} className="hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-colors">
                  <td className="py-4 px-6 font-semibold text-neutral-900 dark:text-neutral-100">{d.diarista}</td>
                  <td className="py-4 px-6">
                    {d.loja_nome ? (
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">{d.loja_nome}</span>
                    ) : (
                      <span className="text-red-400 italic">Não vinculada</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-neutral-600 dark:text-neutral-400">
                    {d.coordenador_nome || <span className="text-neutral-400 italic">-</span>}
                  </td>
                  <td className="py-4 px-6 text-neutral-600 dark:text-neutral-400">
                    {new Date(d.data_servico).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-4 px-6 text-neutral-600 dark:text-neutral-400">{d.motivo}</td>
                  <td className="py-4 px-6 text-neutral-600 dark:text-neutral-400">{d.solicitante.toUpperCase()}</td>
                  <td className="py-4 px-6">
                    {d.order_type === 'MANUAL' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        MANUAL
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        SISTEMA
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right font-mono font-bold text-neutral-900 dark:text-neutral-100">{formatarReal(parseFloat(d.valor))}</td>
                  <td className="py-4 px-6 text-center">{getStatusBadge(d.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {!loading && totalPages > 1 && (
        <div className="p-4 border-t border-neutral-100 dark:border-neutral-850 flex items-center justify-between text-xs bg-neutral-50 dark:bg-neutral-850/20">
          <button
            type="button"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1 || loading}
            className="px-3 py-1.5 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-neutral-700 dark:text-neutral-300"
          >
            Anterior
          </button>
          <span className="text-neutral-500 font-semibold">
            Página {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages || loading}
            className="px-3 py-1.5 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-neutral-700 dark:text-neutral-300"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
