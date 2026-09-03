import { useState } from 'react';
import { ChevronRight, FileSpreadsheet, User } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface VerbaItem {
  codigo: string;
  codigo_original?: string;
  descricao: string;
  tipo: 'Provento' | 'Desconto' | 'Base' | string;
  valor: number;
  dt_arq?: string;
}

export interface ColaboradorRubrica {
  matricula: string;
  nome: string;
  valor: number;
  total_proventos?: number;
  total_descontos?: number;
  total_base?: number;
  quantidade_verbas?: number;
  verbas?: VerbaItem[];
  todas_verbas?: VerbaItem[];
}

interface TabelaColaboradoresRubricaProps {
  colaboradores?: ColaboradorRubrica[];
  categoriaNome: string;
}

export default function TabelaColaboradoresRubrica({
  colaboradores,
  categoriaNome
}: TabelaColaboradoresRubricaProps) {
  // Guarda quais colaboradores estão com o detalhamento expandido
  const [expandedMatriculas, setExpandedMatriculas] = useState<Record<string, boolean>>({});
  // Guarda a aba selecionada para cada colaborador ('categoria' ou 'todas')
  const [abaAtivaPorColab, setAbaAtivaPorColab] = useState<Record<string, 'categoria' | 'todas'>>({});

  const toggleColab = (matricula: string) => {
    setExpandedMatriculas(prev => ({
      ...prev,
      [matricula]: !prev[matricula]
    }));
  };

  const setAbaColab = (matricula: string, aba: 'categoria' | 'todas') => {
    setAbaAtivaPorColab(prev => ({
      ...prev,
      [matricula]: aba
    }));
  };

  if (!colaboradores || colaboradores.length === 0) {
    return (
      <div className="p-4 md:px-8 space-y-2">
        <h4 className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          Detalhamento de {categoriaNome} por Colaborador
        </h4>
        <p className="text-[11px] text-neutral-455 italic py-1">Nenhum colaborador com lançamentos nesta categoria.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:px-8 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          Detalhamento de {categoriaNome} por Colaborador ({colaboradores.length})
        </h4>
        <span className="text-[10px] text-neutral-450 italic">
          Clique no colaborador para ver a descrição detalhada dos valores
        </span>
      </div>

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-900 shadow-xs">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 text-neutral-450 font-extrabold uppercase tracking-wider">
              <th className="p-2 w-32">Matrícula</th>
              <th className="p-2">Nome do Colaborador</th>
              <th className="p-2 text-right w-40">Valor Recebido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium">
            {colaboradores.map((colab) => {
              const isExpanded = !!expandedMatriculas[colab.matricula];
              const abaAtiva = abaAtivaPorColab[colab.matricula] || 'categoria';
              
              const verbasDaCategoria = colab.verbas || [];
              const todasVerbas = colab.todas_verbas || [];
              const verbasExibidas = (abaAtiva === 'todas' && todasVerbas.length > 0) 
                ? todasVerbas 
                : verbasDaCategoria;

              // Calcula totais das verbas exibidas
              const totProventos = verbasExibidas
                .filter(v => v.tipo.toLowerCase().includes('provento'))
                .reduce((acc, v) => acc + v.valor, 0);

              const totDescontos = verbasExibidas
                .filter(v => v.tipo.toLowerCase().includes('desconto'))
                .reduce((acc, v) => acc + v.valor, 0);

              const totBase = verbasExibidas
                .filter(v => v.tipo.toLowerCase().includes('base'))
                .reduce((acc, v) => acc + v.valor, 0);

              const liquidoCalculado = totProventos - totDescontos;

              return (
                <tr key={colab.matricula} className="contents">
                  {/* Linha Principal do Colaborador */}
                  <tr
                    onClick={() => toggleColab(colab.matricula)}
                    className={`cursor-pointer transition-colors ${
                      isExpanded 
                        ? 'bg-neutral-100/70 dark:bg-neutral-800/60 font-semibold' 
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-850/50'
                    }`}
                  >
                    <td className="p-2 font-mono text-neutral-600 dark:text-neutral-400">
                      <div className="flex items-center gap-1.5">
                        <span className={`p-0.5 rounded transition-transform duration-150 ${isExpanded ? 'rotate-90 text-primary-600' : 'text-neutral-400'}`}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                        <span>{colab.matricula}</span>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {colab.nome}
                        </span>
                        {verbasDaCategoria.length > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700">
                            {verbasDaCategoria.length} {verbasDaCategoria.length === 1 ? 'verba' : 'verbas'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-neutral-900 dark:text-neutral-50">
                      {formatCurrency(colab.valor.toString())}
                    </td>
                  </tr>

                  {/* Linha Expansível com Detalhamento Individual */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={3} className="p-0 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100/40 dark:bg-neutral-950/40">
                        <div className="p-3 pl-6 pr-4 space-y-3">
                          {/* Cabeçalho do Detalhamento e Alternador de Abas */}
                          <div className="flex items-center justify-between gap-2 flex-wrap text-[10px]">
                            <span className="font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                              <FileSpreadsheet className="h-3.5 w-3.5 text-primary-500" />
                              Detalhamento de Valores — {colab.nome}
                            </span>

                            {todasVerbas.length > verbasDaCategoria.length && (
                              <div className="inline-flex rounded-lg p-0.5 bg-neutral-200/60 dark:bg-neutral-800 border border-neutral-300/60 dark:border-neutral-700">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setAbaColab(colab.matricula, 'categoria'); }}
                                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] transition-all cursor-pointer ${
                                    abaAtiva !== 'todas'
                                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                                      : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                                  }`}
                                >
                                  Nesta Categoria ({verbasDaCategoria.length})
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setAbaColab(colab.matricula, 'todas'); }}
                                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] transition-all cursor-pointer ${
                                    abaAtiva === 'todas'
                                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                                      : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                                  }`}
                                >
                                  Todas da Folha ({todasVerbas.length})
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Tabela de Verbas Detalhadas */}
                          {verbasExibidas.length > 0 ? (
                            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900 shadow-xs">
                              <table className="w-full text-left border-collapse text-[10px]">
                                <thead>
                                  <tr className="bg-neutral-50 dark:bg-neutral-850 text-neutral-500 font-extrabold uppercase border-b border-neutral-200 dark:border-neutral-800">
                                    <th className="p-2 w-20">Cód. Verba</th>
                                    <th className="p-2">Descrição (Protheus)</th>
                                    <th className="p-2 w-24 text-center">Tipo</th>
                                    <th className="p-2 w-32 text-right">Valor</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                  {verbasExibidas.map((v, idx) => {
                                    const tipoLower = v.tipo.toLowerCase();
                                    const isDesconto = tipoLower.includes('desconto');
                                    const isBase = tipoLower.includes('base');
                                    const isProvento = !isDesconto && !isBase;

                                    return (
                                      <tr key={`${v.codigo}-${idx}`} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-850/40">
                                        <td className="p-2 font-mono font-bold text-neutral-600 dark:text-neutral-400">
                                          {v.codigo}
                                        </td>
                                        <td className="p-2 font-semibold text-neutral-800 dark:text-neutral-200">
                                          {v.descricao}
                                        </td>
                                        <td className="p-2 text-center">
                                          {isDesconto ? (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40">
                                              Desconto
                                            </span>
                                          ) : isBase ? (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 dark:border-sky-900/40">
                                              Base
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40">
                                              Provento
                                            </span>
                                          )}
                                        </td>
                                        <td className={`p-2 text-right font-mono font-bold ${
                                          isDesconto 
                                            ? 'text-rose-600 dark:text-rose-400' 
                                            : isBase 
                                            ? 'text-sky-600 dark:text-sky-400' 
                                            : 'text-emerald-600 dark:text-emerald-400'
                                        }`}>
                                          {isDesconto ? '-' : isProvento ? '+' : ''}
                                          {formatCurrency(v.valor.toString())}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-[10px] text-neutral-400 italic py-1">Nenhuma verba encontrada para este colaborador.</p>
                          )}

                          {/* Resumo de Cálculos: Proventos, Descontos, Base e Total */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30 rounded-lg p-2 text-[10px]">
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold block">Total Proventos</span>
                              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 text-xs">
                                +{formatCurrency(totProventos.toString())}
                              </span>
                            </div>

                            {totDescontos > 0 && (
                              <div className="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-900/30 rounded-lg p-2 text-[10px]">
                                <span className="text-rose-600 dark:text-rose-400 font-semibold block">Total Descontos</span>
                                <span className="font-mono font-bold text-rose-700 dark:text-rose-300 text-xs">
                                  -{formatCurrency(totDescontos.toString())}
                                </span>
                              </div>
                            )}

                            {totBase > 0 && (
                              <div className="bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/50 dark:border-sky-900/30 rounded-lg p-2 text-[10px]">
                                <span className="text-sky-600 dark:text-sky-400 font-semibold block">Base de Cálculo</span>
                                <span className="font-mono font-bold text-sky-700 dark:text-sky-300 text-xs">
                                  {formatCurrency(totBase.toString())}
                                </span>
                              </div>
                            )}

                            <div className="bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2 text-[10px]">
                              <span className="text-neutral-500 font-semibold block">Total Calculado</span>
                              <span className="font-mono font-extrabold text-neutral-900 dark:text-neutral-50 text-xs">
                                {formatCurrency(liquidoCalculado.toString())}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
