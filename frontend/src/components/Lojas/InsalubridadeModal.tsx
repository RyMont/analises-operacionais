import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../api/client';
import type { Loja } from './LojasTable';
import SearchableSelect from '../ui/searchable-select';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface InsalubridadeConfig {
  id?: string;
  loja?: string;
  insalubridade_fixa_percentual: string;
  insalubridade_fixa_base: string;
  insalubridade_banheirista_percentual: string;
  insalubridade_banheirista_base: string;
  calcular_diferenca_banheirista: boolean;
  insalubridade_fixa_recebedores_modo: string;
  insalubridade_fixa_recebedores_quantidade: number | null;
}

interface InsalubridadeModalProps {
  loja: Loja;
  onClose: () => void;
}

/**
 * Modal de configuração de insalubridade para uma filial específica.
 * 
 * Por que existe: Permite parametrizar as regras financeiras de insalubridade 
 * (tanto fixa quanto banheirista), calculando as diferenças salariais de forma 
 * autônoma, carregando os dados da API na inicialização e salvando diretamente no backend.
 */
export default function InsalubridadeModal({
  loja,
  onClose,
}: InsalubridadeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  // Estado local com valores padrão recomendados
  const [insalConfig, setInsalConfig] = useState<InsalubridadeConfig>({
    insalubridade_fixa_percentual: '0.00',
    insalubridade_fixa_base: 'SALARIO_BASE',
    insalubridade_banheirista_percentual: '40.00',
    insalubridade_banheirista_base: 'MINIMO_NACIONAL',
    calcular_diferenca_banheirista: true,
    insalubridade_fixa_recebedores_modo: 'TODOS',
    insalubridade_fixa_recebedores_quantidade: null,
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Carrega a configuração específica da loja selecionada
  useEffect(() => {
    const fetchInsalubridade = async () => {
      setErrorMsg(null);
      try {
        const response = await api.get(`/lojas/${loja.id}/insalubridade/`);
        if (response.data) {
          setInsalConfig(response.data);
        }
      } catch (err) {
        console.error('Erro ao buscar config de insalubridade:', err);
        setErrorMsg('Não foi possível carregar a configuração de insalubridade.');
      }
    };

    fetchInsalubridade();
  }, [loja]);

  // Salva a configuração atualizada via PUT no backend
  const handleSaveInsalubridade = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setActionLoading(true);

    try {
      await api.put(`/lojas/${loja.id}/insalubridade/`, insalConfig);
      toast.success('Configuração de insalubridade salva com sucesso!');
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar insalubridade:', err);
      setErrorMsg(
        err.response?.data
          ? JSON.stringify(err.response.data)
          : 'Erro ao salvar configurações.'
      );
      toast.error('Erro ao salvar insalubridade.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-xl w-full max-w-lg overflow-hidden animate-scale-in">
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
          <div>
            <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
              Configurar Insalubridade
            </h3>
            <p className="text-xs text-neutral-500">{loja.nome_referencia}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulário de Configuração */}
        <form onSubmit={handleSaveInsalubridade} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-md text-xs flex gap-2">
              <AlertCircle className="h-4 w-4 text-red-450 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Seção Insalubridade Fixa */}
            <div className="col-span-2">
              <h4 className="font-bold text-sm text-primary border-b border-neutral-200 dark:border-neutral-800 pb-1 mb-2">
                Insalubridade Fixa
              </h4>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                Percentual da Fixa (%)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={insalConfig.insalubridade_fixa_percentual}
                onChange={(e) =>
                  setInsalConfig({
                    ...insalConfig,
                    insalubridade_fixa_percentual: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                Base de Cálculo da Fixa
              </label>
              <SearchableSelect
                options={[
                  { value: 'SALARIO_BASE', label: 'Salário Base do Cargo' },
                  { value: 'MINIMO_NACIONAL', label: 'Salário Mínimo Nacional' },
                ]}
                value={insalConfig.insalubridade_fixa_base}
                onChange={(val) =>
                  setInsalConfig({
                    ...insalConfig,
                    insalubridade_fixa_base: val,
                  })
                }
                placeholder="Selecione a base..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                Modo de Recebedores (Fixa)
              </label>
              <SearchableSelect
                options={[
                  { value: 'TODOS', label: 'Todos do Escopo' },
                  { value: 'PERSONALIZADO', label: 'Personalizado' },
                ]}
                value={insalConfig.insalubridade_fixa_recebedores_modo}
                onChange={(val) =>
                  setInsalConfig({
                    ...insalConfig,
                    insalubridade_fixa_recebedores_modo: val,
                  })
                }
                placeholder="Selecione o modo..."
              />
            </div>

            {insalConfig.insalubridade_fixa_recebedores_modo === 'PERSONALIZADO' && (
              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                  Qtd. de Pessoas
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={insalConfig.insalubridade_fixa_recebedores_quantidade || ''}
                  onChange={(e) =>
                    setInsalConfig({
                      ...insalConfig,
                      insalubridade_fixa_recebedores_quantidade: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                  className="w-full px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                  placeholder="Ex: 5"
                />
              </div>
            )}

            {/* Seção Insalubridade Banheirista */}
            <div className="col-span-2 pt-2">
              <h4 className="font-bold text-sm text-primary border-b border-neutral-200 dark:border-neutral-800 pb-1 mb-2">
                Insalubridade Banheirista
              </h4>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                Percentual da Banheirista (%)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={insalConfig.insalubridade_banheirista_percentual}
                onChange={(e) =>
                  setInsalConfig({
                    ...insalConfig,
                    insalubridade_banheirista_percentual: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                Base de Cálculo da Banheirista
              </label>
              <SearchableSelect
                options={[
                  { value: 'SALARIO_BASE', label: 'Salário Base do Cargo' },
                  { value: 'MINIMO_NACIONAL', label: 'Salário Mínimo Nacional' },
                ]}
                value={insalConfig.insalubridade_banheirista_base}
                onChange={(val) =>
                  setInsalConfig({
                    ...insalConfig,
                    insalubridade_banheirista_base: val,
                  })
                }
                placeholder="Selecione a base..."
              />
            </div>

            <div className="col-span-2 flex items-center gap-2.5 pt-2">
              <input
                type="checkbox"
                id="calc_diferenca"
                checked={insalConfig.calcular_diferenca_banheirista}
                onChange={(e) =>
                  setInsalConfig({
                    ...insalConfig,
                    calcular_diferenca_banheirista: e.target.checked,
                  })
                }
                className="rounded border-neutral-200 dark:border-neutral-800 text-primary focus:ring-primary h-4 w-4"
              />
              <label
                htmlFor="calc_diferenca"
                className="text-sm text-neutral-700 select-none"
              >
                Calcular diferença de banheirista (valor banheirista − valor fixa)
              </label>
            </div>
          </div>

          {/* Botões de Ação do Modal */}
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-full text-xs font-bold text-neutral-700 dark:text-neutral-300 text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 shadow-xs disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Configuração
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
