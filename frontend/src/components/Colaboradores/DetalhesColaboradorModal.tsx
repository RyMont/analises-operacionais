import { useRef } from 'react';
import { User, X, Layers, Calendar } from 'lucide-react';
import type { Colaborador } from './ColaboradoresTable';
import { formatDate } from '../../utils/formatters';
import { getStatusBadge } from '../../utils/badges';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface DetalhesColaboradorModalProps {
  colab: Colaborador;
  onClose: () => void;
}

/**
 * Modal de visualização detalhada da Ficha do Colaborador.
 * 
 * Por que existe: Permite auditar todos os dados individuais do auxiliar,
 * comparando as bases do TOTVS vs Planilha de Gestão vs GeoVictoria, e
 * monitorando datas de experiência em um pop-up isolado.
 */
export default function DetalhesColaboradorModal({
  colab,
  onClose,
}: DetalhesColaboradorModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-xl w-full max-w-2xl overflow-hidden animate-scale-in">
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                Ficha do Colaborador
              </h3>
              <p className="text-xs text-neutral-500">
                Cadastro de Funcionário no Banco
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Informações Pessoais */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 bg-neutral-50 dark:bg-neutral-850 p-4 rounded-lg border border-neutral-200 dark:border-neutral-800">
              <span className="block text-[10px] font-bold text-neutral-600 uppercase tracking-wider mb-1">
                Nome Completo
              </span>
              <span className="text-lg font-bold text-neutral-950 dark:text-neutral-50">
                {colab.nome}
              </span>
            </div>

            <div>
              <span className="block text-[10px] font-bold text-neutral-600 uppercase tracking-wider mb-1">
                Matrícula (RE)
              </span>
              <span className="text-sm font-mono font-semibold">
                {colab.re}
              </span>
            </div>

            <div>
              <span className="block text-[10px] font-bold text-neutral-600 uppercase tracking-wider mb-1">
                CPF
              </span>
              <span className="text-sm font-mono font-semibold">
                {colab.cpf || 'Não cadastrado'}
              </span>
            </div>
          </div>

          {/* Lotação e Cargos de Base Cruzada */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 border-b border-neutral-200 dark:border-neutral-800 pb-1">
              <Layers className="h-4 w-4" />
              Comparativo de Lotação & Função
            </h4>

            <div className="grid grid-cols-2 gap-4">
              {/* TOTVS */}
              <div className="p-3 bg-neutral-50 dark:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-1">
                <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                  TOTVS (Lotação Física)
                </span>
                <span className="text-sm font-semibold">
                  {colab.loja_nome || colab.centro_custo}
                </span>
                <span className="block text-[10px] text-neutral-500">
                  Função: {colab.cargo}
                </span>
              </div>

              {/* Gestão Pessoas */}
              <div
                className={`p-3 rounded-lg border space-y-1 ${
                  colab.loja_gestao_divergente
                    ? 'bg-red-500/5 border-red-500/20'
                    : 'bg-neutral-50 dark:bg-neutral-850 border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                  Gestão Pessoas
                </span>
                <span className="text-sm font-semibold">
                  {colab.loja_gestao_nome || 'Em branco'}
                </span>
                <span className="block text-[10px] text-neutral-500">
                  Função: {colab.funcao_gestao || 'Em branco'}
                </span>
              </div>

              {/* GeoVictoria */}
              <div
                className={`p-3 rounded-lg border space-y-1 ${
                  colab.loja_geo_divergente
                    ? 'bg-red-500/5 border-red-500/20'
                    : 'bg-neutral-50 dark:bg-neutral-850 border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                  GeoVictoria (Relógio Ponto)
                </span>
                <span className="text-sm font-semibold">
                  {colab.loja_geo_nome || 'Em branco'}
                </span>
              </div>

              {/* Status do Funcionário */}
              <div className="p-3 bg-neutral-50 dark:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-1">
                <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                  Status de Contrato
                </span>
                <div className="flex gap-2 items-center">
                  <div>{getStatusBadge(colab.status)}</div>
                  {colab.status_gestao && (
                    <div className="text-xs text-neutral-500">
                      (Gestão:{' '}
                      <span className="font-semibold">
                        {colab.status_gestao}
                      </span>
                      )
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Datas de Experiência e Admissão */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 border-b border-neutral-200 dark:border-neutral-800 pb-1">
              <Calendar className="h-4 w-4" />
              Datas e Períodos de Experiência
            </h4>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <span className="block text-[9px] font-bold text-neutral-600 uppercase mb-1">
                  Admissão
                </span>
                <span className="text-sm font-semibold font-mono">
                  {formatDate(colab.data_admissao)}
                </span>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <span className="block text-[9px] font-bold text-neutral-600 uppercase mb-1">
                  Experiência (1º Período)
                </span>
                <span className="text-sm font-semibold font-mono">
                  {formatDate(colab.termino_1)}
                </span>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <span className="block text-[9px] font-bold text-neutral-600 uppercase mb-1">
                  Experiência (2º Período)
                </span>
                <span className="text-sm font-semibold font-mono">
                  {formatDate(colab.termino_2)}
                </span>
              </div>

              {colab.data_demissao && (
                <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20 col-span-3">
                  <span className="block text-[9px] font-bold text-red-400 uppercase mb-1">
                    Data de Demissão
                  </span>
                  <span className="text-sm font-semibold font-mono text-red-500">
                    {formatDate(colab.data_demissao)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex justify-end p-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:opacity-90 rounded-lg text-sm font-semibold transition-colors"
          >
            Fechar Ficha
          </button>
        </div>
      </div>
    </div>
  );
}
