import { useState, useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import type { ResultadoComparativo } from './ComparativoDetalheModal';

interface GraficoProporcaoVerbasLojaProps {
  resultado: ResultadoComparativo;
}

interface ItemProporcao {
  nome: string;
  codigo?: string;
  valor: number;
  percentual: number;
  cor: string;
}

// Paleta harmônica e acessível para as categorias principais
const CORES_CATEGORIAS = {
  salario: '#3b82f6', // Azul Índigo
  insalubridade: '#f59e0b', // Âmbar
  adicional_noturno: '#8b5cf6', // Violeta
  verbas_extraordinarias: '#f43f5e', // Rosa / Coral
};

// Paleta estendida para rubricas individuais
const CORES_RUBRICAS = [
  '#3b82f6', // Azul Índigo
  '#10b981', // Verde Esmeralda
  '#f59e0b', // Âmbar
  '#8b5cf6', // Violeta
  '#ec4899', // Rosa
  '#06b6d4', // Ciano
  '#f97316', // Laranja
  '#14b8a6', // Teal
  '#6366f1', // Índigo
  '#84cc16', // Lima
  '#a855f7', // Roxo
  '#e11d48', // Carmesim
  '#64748b', // Ardósia (Outras)
];

/**
 * Tooltip customizada com alto contraste para tema claro e escuro.
 */
const CustomTooltipProporcao = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as ItemProporcao;
    return (
      <div className="bg-neutral-900/95 dark:bg-neutral-950/95 border border-neutral-700/60 dark:border-neutral-800 text-white p-3 rounded-xl text-xs shadow-2xl backdrop-blur-md space-y-1.5 min-w-[170px] z-50">
        <div className="flex items-center gap-2 border-b border-neutral-700/60 dark:border-neutral-800 pb-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
            style={{ backgroundColor: data.cor }}
          />
          <span className="font-bold text-neutral-100 truncate">{data.nome}</span>
        </div>
        <div className="flex justify-between items-center gap-3 text-neutral-300">
          <span className="text-neutral-400">Total:</span>
          <span className="font-mono font-bold text-white">{formatCurrency(data.valor)}</span>
        </div>
        <div className="flex justify-between items-center gap-3 text-neutral-300">
          <span className="text-neutral-400">Participação:</span>
          <span className="font-mono font-bold text-emerald-400">{data.percentual.toFixed(1)}%</span>
        </div>
      </div>
    );
  }
  return null;
};

/**
 * Componente gráfico que exibe a proporção das verbas para o custo total da loja.
 * Fica posicionado logo acima da tabela descritiva no detalhamento do Raio-X.
 */
export default function GraficoProporcaoVerbasLoja({ resultado }: GraficoProporcaoVerbasLojaProps) {
  // Modo de visualização: Realizado (Folha) vs Orçado (Escopo)
  const [origemDados, setOrigemDados] = useState<'folha' | 'escopo'>('folha');
  // Índice ativo em foco (hover)
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // 1. Dados por Categoria (utilizado apenas se Orçado for selecionado)
  const dadosCategorias = useMemo(() => {
    // Escopo Orçado
    const vSalario = Math.max(0, parseFloat(resultado.escopo_base_total || '0'));
    const vInsalubridade = Math.max(0, parseFloat(resultado.escopo_insalubridade_total || '0'));
    const vAdicional = Math.max(0, parseFloat(resultado.escopo_adicional_noturno_total || '0'));
    const totalEscopo = Math.max(
      vSalario + vInsalubridade + vAdicional,
      parseFloat(resultado.escopo_total || '0')
    );

    const itens: ItemProporcao[] = [
      {
        nome: 'Salário Base (Estimado)',
        valor: vSalario,
        percentual: totalEscopo > 0 ? (vSalario / totalEscopo) * 100 : 0,
        cor: CORES_CATEGORIAS.salario,
      },
      {
        nome: 'Insalubridade (Estimada)',
        valor: vInsalubridade,
        percentual: totalEscopo > 0 ? (vInsalubridade / totalEscopo) * 100 : 0,
        cor: CORES_CATEGORIAS.insalubridade,
      },
      {
        nome: 'Adicional Noturno (Estimado)',
        valor: vAdicional,
        percentual: totalEscopo > 0 ? (vAdicional / totalEscopo) * 100 : 0,
        cor: CORES_CATEGORIAS.adicional_noturno,
      },
    ];

    return {
      itens,
      total: totalEscopo,
    };
  }, [resultado]);

  // 2. Dados por Rubrica Detalhada (padrão principal da folha realizada sem agrupamento forçado)
  const dadosRubricas = useMemo(() => {
    if (origemDados !== 'folha') {
      return { itens: [], total: 0 };
    }

    const mapaRubricas = new Map<string, { nome: string; codigo: string; total: number }>();
    const listas = [
      resultado.colaboradores_salario || [],
      resultado.colaboradores_insalubridade || [],
      resultado.colaboradores_adicional_noturno || [],
      resultado.colaboradores_verbas_extraordinarias || [],
    ];

    listas.forEach(colabs => {
      colabs.forEach(colab => {
        (colab.verbas || []).forEach(v => {
          const codFormatado = v.codigo ? String(v.codigo).padStart(3, '0') : '';
          const chave = codFormatado || v.descricao;
          const valor = Number(v.valor) || 0;
          if (valor <= 0) return;

          const atual = mapaRubricas.get(chave);
          if (atual) {
            atual.total += valor;
          } else {
            const rotulo = v.descricao
              ? (codFormatado ? `${codFormatado} — ${v.descricao}` : v.descricao)
              : chave;
            mapaRubricas.set(chave, {
              nome: rotulo,
              codigo: codFormatado,
              total: valor,
            });
          }
        });
      });
    });

    const ordenados = Array.from(mapaRubricas.values()).sort((a, b) => b.total - a.total);
    const totalFolha = ordenados.reduce((acc, cur) => acc + cur.total, 0);

    // Permite exibir até 10 rubricas individuais com suas próprias cores antes de agrupar o excedente
    const itensFinais: ItemProporcao[] = [];
    const maxTop = 10;
    const topItens = ordenados.slice(0, maxTop);
    const demais = ordenados.slice(maxTop);

    topItens.forEach((item, index) => {
      itensFinais.push({
        nome: item.nome,
        codigo: item.codigo,
        valor: item.total,
        percentual: totalFolha > 0 ? (item.total / totalFolha) * 100 : 0,
        cor: CORES_RUBRICAS[index % (CORES_RUBRICAS.length - 1)],
      });
    });

    if (demais.length > 0) {
      const somaDemais = demais.reduce((acc, cur) => acc + cur.total, 0);
      itensFinais.push({
        nome: `Outras Rubricas (${demais.length})`,
        valor: somaDemais,
        percentual: totalFolha > 0 ? (somaDemais / totalFolha) * 100 : 0,
        cor: CORES_RUBRICAS[CORES_RUBRICAS.length - 1],
      });
    }

    return {
      itens: itensFinais,
      total: totalFolha,
    };
  }, [resultado, origemDados]);

  // Escolhe os dados: na Folha, utiliza SEMPRE as rubricas individuais sem agrupamento
  const dadosAtivos =
    origemDados === 'folha' && dadosRubricas.itens.length > 0
      ? dadosRubricas
      : dadosCategorias;

  // Fatias a desenhar no Pie (apenas valores positivos)
  const fatiasGrafico = useMemo(() => {
    return dadosAtivos.itens.filter(i => i.valor > 0);
  }, [dadosAtivos]);

  const temDados = dadosAtivos.total > 0 && fatiasGrafico.length > 0;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs overflow-hidden transition-all">
      {/* Cabeçalho do Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-800/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <PieIcon className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
              Proporção por Rubrica
            </h3>
          </div>
          <p className="text-[11px] text-neutral-500 font-medium mt-1">
            Distribuição percentual de cada rubrica individual em relação ao custo total da filial
          </p>
        </div>

        {/* Controles de Alternância */}
        <div className="flex items-center gap-2">
          {/* Alternância Realizado vs Orçado */}
          <div className="inline-flex rounded-xl bg-neutral-100 dark:bg-neutral-800 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setOrigemDados('folha')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                origemDados === 'folha'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 shadow-xs font-bold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Realizado (Folha)
            </button>
            <button
              type="button"
              onClick={() => setOrigemDados('escopo')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                origemDados === 'escopo'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 shadow-xs font-bold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Orçado (Escopo)
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo do Gráfico e Detalhes */}
      {!temDados ? (
        <div className="py-12 text-center text-xs text-neutral-400 dark:text-neutral-500 italic">
          Não há despesas com valor positivo registradas para cálculo de proporção neste período.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center pt-4">
          {/* Lado Esquerdo: Donut Chart com Centro Informativo */}
          <div className="md:col-span-5 flex flex-col items-center justify-center relative min-h-[220px]">
            <div className="w-full h-56 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fatiasGrafico}
                    dataKey="valor"
                    nameKey="nome"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={3}
                    stroke="transparent"
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {fatiasGrafico.map((entry, index) => {
                      const isHovered = activeIndex === index;
                      return (
                        <Cell
                          key={`slice-${index}`}
                          fill={entry.cor}
                          opacity={activeIndex === null || isHovered ? 1 : 0.45}
                          style={{
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                            transformOrigin: 'center center',
                          }}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip content={<CustomTooltipProporcao />} />
                </PieChart>
              </ResponsiveContainer>

              {/* Rótulo Central do Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 dark:text-neutral-500">
                  {origemDados === 'folha' ? 'Total Folha' : 'Total Escopo'}
                </span>
                <span className="text-sm font-extrabold font-mono text-neutral-900 dark:text-neutral-50 mt-0.5">
                  {formatCurrency(dadosAtivos.total)}
                </span>
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-md mt-0.5">
                  100%
                </span>
              </div>
            </div>
          </div>

          {/* Lado Direito: Barras de Progresso e Percentuais */}
          <div className="md:col-span-7 space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {dadosAtivos.itens.map((item, index) => {
              const isHovered = activeIndex === index;
              return (
                <div
                  key={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isHovered
                      ? 'border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-850 shadow-xs'
                      : 'border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50/50 dark:hover:bg-neutral-850/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: item.cor }}
                      />
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate text-[11px] sm:text-xs">
                        {item.nome}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100 text-[11px] sm:text-xs">
                        {formatCurrency(item.valor)}
                      </span>
                      <span
                        className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-md text-white shrink-0"
                        style={{ backgroundColor: item.cor }}
                      >
                        {item.percentual.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Barra de Progresso Visual */}
                  <div className="h-1.5 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${Math.min(100, item.percentual)}%`,
                        backgroundColor: item.cor,
                        opacity: isHovered ? 1 : 0.85,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
