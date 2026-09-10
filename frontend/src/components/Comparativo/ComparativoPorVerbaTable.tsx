import { useState, useMemo } from 'react';
import { Eye, FileSpreadsheet, Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface VerbaResultadoItem {
  codigo: string;
  descricao: string;
  tipo: string;
  categoria: string;
  total_valor: number;
  percentual: number;
  qtd_linhas: number;
  qtd_lojas: number;
  qtd_colaboradores: number;
}

interface ComparativoPorVerbaTableProps {
  resultados: VerbaResultadoItem[];
  loading: boolean;
  onVerDetalhes: (codigo: string, descricao: string) => void;
  onExportarExcel: () => void;
}

const getBadgeCategoria = (categoria: string) => {
  switch (categoria) {
    case 'Salário Base':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-900/40';
    case 'Insalubridade':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-900/40';
    case 'Adicional Noturno':
      return 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400 border-violet-200 dark:border-violet-900/40';
    default:
      return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-900/40';
  }
};

/**
 * Tabela com a listagem e detalhamento analítico das verbas no Raio-X.
 */
export default function ComparativoPorVerbaTable({
  resultados,
  loading,
  onVerDetalhes,
  onExportarExcel
}: ComparativoPorVerbaTableProps) {
  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<'valor_desc' | 'valor_asc' | 'codigo_asc' | 'nome_asc'>('valor_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Filtragem e ordenação local das verbas
  const dadosFiltrados = useMemo(() => {
    let list = [...resultados];
    if (busca.trim()) {
      const q = busca.toLowerCase().trim();
      list = list.filter(
        (v) =>
          v.codigo.toLowerCase().includes(q) ||
          v.descricao.toLowerCase().includes(q) ||
          v.categoria.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (ordenacao === 'valor_desc') return b.total_valor - a.total_valor;
      if (ordenacao === 'valor_asc') return a.total_valor - b.total_valor;
      if (ordenacao === 'codigo_asc') return a.codigo.localeCompare(b.codigo);
      if (ordenacao === 'nome_asc') return a.descricao.localeCompare(b.descricao);
      return 0;
    });

    return list;
  }, [resultados, busca, ordenacao]);

  const totalPages = Math.ceil(dadosFiltrados.length / itemsPerPage) || 1;
  const paginados = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return dadosFiltrados.slice(start, start + itemsPerPage);
  }, [dadosFiltrados, currentPage]);

  const handleMudarBusca = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBusca(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs overflow-hidden">
      {/* Barra de Ações Superiores */}
      <div className="p-4 sm:p-5 border-b border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-50">
            Detalhamento Consolidado por Rubrica ({dadosFiltrados.length})
          </h3>
          <p className="text-xs text-neutral-500 font-medium">
            Listagem analítica com valores totais, ocorrências e participação percentual
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-center">
          {/* Busca Rápida na Tabela */}
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar verba por código ou nome..."
              value={busca}
              onChange={handleMudarBusca}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 rounded-full text-neutral-700 dark:text-neutral-300 focus:outline-hidden focus:border-primary"
            />
          </div>

          {/* Botão de Exportar */}
          <button
            type="button"
            onClick={onExportarExcel}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold shadow-xs transition-colors cursor-pointer w-full sm:w-auto justify-center"
            title="Exportar todas as verbas filtradas para Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Tabela de Verbas */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
              <th
                className="p-3.5 cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 select-none w-20"
                onClick={() => setOrdenacao(ordenacao === 'codigo_asc' ? 'valor_desc' : 'codigo_asc')}
              >
                <div className="flex items-center gap-1">
                  <span>Código</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>
              <th
                className="p-3.5 cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 select-none"
                onClick={() => setOrdenacao(ordenacao === 'nome_asc' ? 'valor_desc' : 'nome_asc')}
              >
                <div className="flex items-center gap-1">
                  <span>Descrição da Verba</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>
              <th className="p-3.5">Categoria</th>
              <th className="p-3.5 text-center">Tipo</th>
              <th className="p-3.5 text-center">Lojas</th>
              <th className="p-3.5 text-center">Colabs</th>
              <th className="p-3.5 text-center">Lançamentos</th>
              <th
                className="p-3.5 text-right cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 select-none"
                onClick={() => setOrdenacao(ordenacao === 'valor_desc' ? 'valor_asc' : 'valor_desc')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Valor Total</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>
              <th className="p-3.5 text-right">Part. (%)</th>
              <th className="p-3.5 text-center w-24">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="p-3.5"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-12" /></td>
                  <td className="p-3.5"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-48" /></td>
                  <td className="p-3.5"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-24" /></td>
                  <td className="p-3.5"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-12 mx-auto" /></td>
                  <td className="p-3.5"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-8 mx-auto" /></td>
                  <td className="p-3.5"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-8 mx-auto" /></td>
                  <td className="p-3.5"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-12 mx-auto" /></td>
                  <td className="p-3.5"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-20 ml-auto" /></td>
                  <td className="p-3.5"><div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-12 ml-auto" /></td>
                  <td className="p-3.5"><div className="h-6 bg-neutral-100 dark:bg-neutral-800 rounded w-16 mx-auto" /></td>
                </tr>
              ))
            ) : paginados.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-neutral-400 italic">
                  Nenhuma verba encontrada com os filtros e busca aplicados.
                </td>
              </tr>
            ) : (
              paginados.map((v) => (
                <tr
                  key={v.codigo}
                  className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors"
                >
                  <td className="p-3.5 font-mono font-bold text-primary">{v.codigo}</td>
                  <td className="p-3.5 font-semibold text-neutral-900 dark:text-neutral-100">{v.descricao}</td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${getBadgeCategoria(
                        v.categoria
                      )}`}
                    >
                      {v.categoria}
                    </span>
                  </td>
                  <td className="p-3.5 text-center text-[11px] text-neutral-500">{v.tipo}</td>
                  <td className="p-3.5 text-center font-mono">{v.qtd_lojas}</td>
                  <td className="p-3.5 text-center font-mono">{v.qtd_colaboradores}</td>
                  <td className="p-3.5 text-center font-mono">{v.qtd_linhas}</td>
                  <td className="p-3.5 text-right font-mono font-bold text-neutral-900 dark:text-neutral-100">
                    {formatCurrency(v.total_valor)}
                  </td>
                  <td className="p-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {v.percentual.toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-center">
                    <button
                      type="button"
                      onClick={() => onVerDetalhes(v.codigo, v.descricao)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer"
                    >
                      <Eye className="h-3 w-3" />
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {!loading && totalPages > 1 && (
        <div className="px-5 py-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
          <span>
            Página {currentPage} de {totalPages} ({dadosFiltrados.length} itens)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-neutral-800 dark:text-neutral-200 px-2">
              {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
