import { useEffect, useState, useRef } from 'react';
import { Loader2, X, AlertCircle, FileText, CalendarCheck, TrendingUp, Calculator, Scale, Info, ChevronDown, ChevronUp, User } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../utils/formatters';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

export interface ResultadoComparativo {
  loja: {
    id: string;
    nome_referencia: string;
  };
  competencias: string[];
  escopo_base_total: string;
  escopo_insalubridade_fixa_total: string;
  escopo_insalubridade_banheirista_total: string;
  escopo_insalubridade_total: string;
  escopo_adicional_noturno_total: string;
  escopo_total: string;
  escopo_itens_sem_estimativa: any[];
  escopo_meses_sem_registro: any[];
  folha_total: string;
  folha_linhas_count: number;
  folha_salario_categoria_total: string;
  folha_insalubridade_categoria_total: string;
  folha_adicional_noturno_categoria_total: string;
  diferenca_folha_menos_escopo: string;
  desvio_salario: string;
  desvio_insalubridade: string;
  desvio_adicional_noturno: string;
  tabela_escopo_total: string;
  tabela_folha_total: string;
  tabela_desvio_total: string;
  colaboradores_salario?: { matricula: string; nome: string; valor: number }[];
  colaboradores_insalubridade?: { matricula: string; nome: string; valor: number }[];
  colaboradores_adicional_noturno?: { matricula: string; nome: string; valor: number }[];
}

interface ComparativoDetalheModalProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: number;
  lojaNome: string;
  competencia: string;
  competenciaLabel: string;
}

const getDesvioBadge = (desvioStr: string) => {
  const desvio = parseFloat(desvioStr || '0');
  if (isNaN(desvio)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
        -
      </span>
    );
  }
  if (desvio > 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">
        +{formatCurrency(desvioStr)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400">
      {formatCurrency(desvioStr)}
    </span>
  );
};

export default function ComparativoDetalheModal({
  isOpen,
  onClose,
  lojaId,
  lojaNome,
  competencia,
  competenciaLabel,
}: ComparativoDetalheModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  const [resultado, setResultado] = useState<ResultadoComparativo | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  useEffect(() => {
    if (!isOpen) return;

    const fetchDetalhes = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const response = await api.get(`/comparativo/`, {
          params: { loja: lojaId, c: competencia }
        });
        if (response.data) {
          setResultado(response.data.resultado || null);
        }
      } catch (err) {
        console.error('Erro ao buscar comparativo detalhado:', err);
        setErrorMsg('Erro ao calcular as estimativas e processar os dados da folha.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetalhes();
  }, [isOpen, lojaId, competencia]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-850 shrink-0">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-50">
              Detalhes de Custo — {lojaNome}
            </h2>
            <p className="text-xs text-neutral-500 font-medium">
              Competência selecionada: {competenciaLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-450 hover:bg-neutral-100 dark:hover:bg-neutral-850 hover:text-neutral-800 dark:hover:text-neutral-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm flex gap-3 items-center">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
              <span className="text-xs text-neutral-500 font-semibold">Calculando desvios e estimativas...</span>
            </div>
          ) : !resultado ? (
            <div className="py-10 text-center text-xs text-neutral-500 italic">
              Não foi possível gerar o comparativo. Certifique-se de que a folha foi importada ou o escopo foi criado.
            </div>
          ) : (
            <div className="space-y-6">
              {/* KPIs Internos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-neutral-50 dark:bg-neutral-850 p-4 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-neutral-450">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Folha Importada</span>
                    <FileText className="h-4 w-4" />
                  </div>
                  <span className="text-lg font-extrabold font-mono text-neutral-900 dark:text-neutral-50 block">
                    {formatCurrency(resultado.folha_total)}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-medium block">
                    {resultado.folha_linhas_count.toLocaleString()} verbas encontradas
                  </span>
                </div>

                <div className="bg-neutral-50 dark:bg-neutral-850 p-4 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-neutral-450">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Escopo Orçado</span>
                    <CalendarCheck className="h-4 w-4" />
                  </div>
                  <span className="text-lg font-extrabold font-mono text-neutral-900 dark:text-neutral-50 block">
                    {formatCurrency(resultado.escopo_total)}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-medium block">
                    Estimado a partir do cadastro do mês
                  </span>
                </div>

                <div className="bg-neutral-50 dark:bg-neutral-850 p-4 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-neutral-450">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Desvio Consolidado</span>
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <span className={`text-lg font-extrabold font-mono block ${
                    parseFloat(resultado.diferenca_folha_menos_escopo) > 0 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-green-600 dark:text-green-400'
                  }`}>
                    {parseFloat(resultado.diferenca_folha_menos_escopo) > 0 ? '+' : ''}
                    {formatCurrency(resultado.diferenca_folha_menos_escopo)}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-medium block">
                    Real menos o Orçado Planejado
                  </span>
                </div>
              </div>

              {/* Tabela de Rubricas */}
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-100 dark:border-neutral-800 text-[10px] font-extrabold text-neutral-450 uppercase tracking-wider">
                        <th className="py-3 px-5">Categoria Rubrica</th>
                        <th className="py-3 px-5 text-right">Orçado (Escopo)</th>
                        <th className="py-3 px-5 text-right">Real (Folha)</th>
                        <th className="py-3 px-5 text-center">Desvio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300">
                      {/* Salário Base */}
                      <tr 
                        onClick={() => toggleCategory('salario')}
                        className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-850/30 transition-colors"
                      >
                        <td className="py-3.5 px-5 flex items-center gap-2">
                          <Calculator className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>Salário Base</span>
                          {expandedCategories['salario'] ? (
                            <ChevronUp className="h-3 w-3 text-neutral-400 ml-0.5" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-neutral-400 ml-0.5" />
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono">{formatCurrency(resultado.escopo_base_total)}</td>
                        <td className="py-3.5 px-5 text-right font-mono">{formatCurrency(resultado.folha_salario_categoria_total)}</td>
                        <td className="py-3.5 px-5 text-center font-mono">{getDesvioBadge(resultado.desvio_salario)}</td>
                      </tr>
                      {expandedCategories['salario'] && (
                        <tr>
                          <td colSpan={4} className="p-0 bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800">
                            <div className="p-4 md:px-8 space-y-2">
                              <h4 className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" />
                                Detalhamento de Salário Base por Colaborador
                              </h4>
                              {resultado.colaboradores_salario && resultado.colaboradores_salario.length > 0 ? (
                                <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden max-w-2xl bg-white dark:bg-neutral-900 shadow-xs">
                                  <table className="w-full text-left border-collapse text-[11px]">
                                    <thead>
                                      <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 text-neutral-450 font-extrabold uppercase tracking-wider">
                                        <th className="p-2 w-28">Matrícula</th>
                                        <th className="p-2">Nome</th>
                                        <th className="p-2 text-right w-32">Valor Recebido</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium">
                                      {resultado.colaboradores_salario.map((colab: any) => (
                                        <tr key={colab.matricula} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/50">
                                          <td className="p-2 font-mono">{colab.matricula}</td>
                                          <td className="p-2 font-semibold text-neutral-900 dark:text-neutral-100">{colab.nome}</td>
                                          <td className="p-2 text-right font-mono">{formatCurrency(colab.valor.toString())}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-[11px] text-neutral-455 italic py-1">Nenhum colaborador com lançamentos nesta categoria.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Insalubridade */}
                      <tr 
                        onClick={() => toggleCategory('insalubridade')}
                        className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-850/30 transition-colors"
                      >
                        <td className="py-3.5 px-5 flex items-center gap-2">
                          <Scale className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>Insalubridade (Fixa + Banheiristas)</span>
                          {expandedCategories['insalubridade'] ? (
                            <ChevronUp className="h-3 w-3 text-neutral-400 ml-0.5" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-neutral-400 ml-0.5" />
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono">{formatCurrency(resultado.escopo_insalubridade_total)}</td>
                        <td className="py-3.5 px-5 text-right font-mono">{formatCurrency(resultado.folha_insalubridade_categoria_total)}</td>
                        <td className="py-3.5 px-5 text-center font-mono">{getDesvioBadge(resultado.desvio_insalubridade)}</td>
                      </tr>
                      {expandedCategories['insalubridade'] && (
                        <tr>
                          <td colSpan={4} className="p-0 bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800">
                            <div className="p-4 md:px-8 space-y-2">
                              <h4 className="text-[10px] font-bold text-neutral-455 uppercase tracking-wider flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" />
                                Detalhamento de Insalubridade por Colaborador
                              </h4>
                              {resultado.colaboradores_insalubridade && resultado.colaboradores_insalubridade.length > 0 ? (
                                <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden max-w-2xl bg-white dark:bg-neutral-900 shadow-xs">
                                  <table className="w-full text-left border-collapse text-[11px]">
                                    <thead>
                                      <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 text-neutral-450 font-extrabold uppercase tracking-wider">
                                        <th className="p-2 w-28">Matrícula</th>
                                        <th className="p-2">Nome</th>
                                        <th className="p-2 text-right w-32">Valor Recebido</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium">
                                      {resultado.colaboradores_insalubridade.map((colab: any) => (
                                        <tr key={colab.matricula} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/50">
                                          <td className="p-2 font-mono">{colab.matricula}</td>
                                          <td className="p-2 font-semibold text-neutral-900 dark:text-neutral-100">{colab.nome}</td>
                                          <td className="p-2 text-right font-mono">{formatCurrency(colab.valor.toString())}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-[11px] text-neutral-455 italic py-1">Nenhum colaborador com lançamentos nesta categoria.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Adicional Noturno */}
                      <tr 
                        onClick={() => toggleCategory('adicional_noturno')}
                        className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-850/30 transition-colors"
                      >
                        <td className="py-3.5 px-5 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>Adicional Noturno</span>
                          {expandedCategories['adicional_noturno'] ? (
                            <ChevronUp className="h-3 w-3 text-neutral-400 ml-0.5" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-neutral-400 ml-0.5" />
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono">{formatCurrency(resultado.escopo_adicional_noturno_total)}</td>
                        <td className="py-3.5 px-5 text-right font-mono">{formatCurrency(resultado.folha_adicional_noturno_categoria_total)}</td>
                        <td className="py-3.5 px-5 text-center font-mono">{getDesvioBadge(resultado.desvio_adicional_noturno)}</td>
                      </tr>
                      {expandedCategories['adicional_noturno'] && (
                        <tr>
                          <td colSpan={4} className="p-0 bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800">
                            <div className="p-4 md:px-8 space-y-2">
                              <h4 className="text-[10px] font-bold text-neutral-455 uppercase tracking-wider flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" />
                                Detalhamento de Adicional Noturno por Colaborador
                              </h4>
                              {resultado.colaboradores_adicional_noturno && resultado.colaboradores_adicional_noturno.length > 0 ? (
                                <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden max-w-2xl bg-white dark:bg-neutral-900 shadow-xs">
                                  <table className="w-full text-left border-collapse text-[11px]">
                                    <thead>
                                      <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 text-neutral-450 font-extrabold uppercase tracking-wider">
                                        <th className="p-2 w-28">Matrícula</th>
                                        <th className="p-2">Nome</th>
                                        <th className="p-2 text-right w-32">Valor Recebido</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium">
                                      {resultado.colaboradores_adicional_noturno.map((colab: any) => (
                                        <tr key={colab.matricula} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/50">
                                          <td className="p-2 font-mono">{colab.matricula}</td>
                                          <td className="p-2 font-semibold text-neutral-900 dark:text-neutral-100">{colab.nome}</td>
                                          <td className="p-2 text-right font-mono">{formatCurrency(colab.valor.toString())}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-[11px] text-neutral-455 italic py-1">Nenhum colaborador com lançamentos nesta categoria.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-neutral-50 dark:bg-neutral-850 font-bold border-t border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 text-[13px]">
                        <td className="py-4 px-5">Total Consolidado</td>
                        <td className="py-4 px-5 text-right font-mono">{formatCurrency(resultado.tabela_escopo_total)}</td>
                        <td className="py-4 px-5 text-right font-mono">{formatCurrency(resultado.tabela_folha_total)}</td>
                        <td className="py-4 px-5 text-center font-mono">
                          <span className={parseFloat(resultado.tabela_desvio_total) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                            {parseFloat(resultado.tabela_desvio_total) > 0 ? '+' : ''}
                            {parseFloat(resultado.tabela_desvio_total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Informativo */}
              <div className="bg-neutral-50 dark:bg-neutral-850 p-4 border border-neutral-200/20 dark:border-neutral-800 rounded-2xl flex gap-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 shadow-xs">
                <Info className="h-4.5 w-4.5 text-neutral-550 shrink-0 mt-0.5" />
                <div>
                  <p>
                    <strong className="text-neutral-850 dark:text-neutral-200 font-bold block mb-1">Sobre os Desvios de Rubricas:</strong>
                    A coluna de desvios calcula o real subtraído do orçado. O Total Geral da Folha reflete a soma bruta de todas as verbas importadas. 
                    As outras linhas e totais da tabela consideram apenas o cruzamento de rubricas coincidentes. Divergências apontam verbas extraordinárias não mapeadas no orçado de escopo original.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
