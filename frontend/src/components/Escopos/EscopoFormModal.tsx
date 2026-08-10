import React, { useState, useRef } from 'react';
import { Plus, Trash2, AlertCircle, Loader2, X } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import SearchableSelect from '../ui/searchable-select';
import type { Cargo } from './EscoposTable';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface LojaRef {
  id: string;
  nome_referencia: string;
}

interface EscopoFormModalProps {
  lojasOpcoes: LojaRef[];
  cargosOpcoes: Cargo[];
  onClose: () => void;
  onRefresh: () => void;
}

/**
 * Modal de Cadastro de Novo Escopo Mensal.
 * 
 * Por que existe: Fornece um formulário em popup para planejar a quantidade de 
 * Auxiliares e seus turnos para uma determinada loja e mês de competência.
 * Gerencia a adição/remoção dinâmica de postos de trabalho e envia os dados consolidados.
 */
export default function EscopoFormModal({
  lojasOpcoes,
  cargosOpcoes,
  onClose,
  onRefresh,
}: EscopoFormModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  // Estados locais do formulário
  const [loja, setLoja] = useState('');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [itens, setItens] = useState<{ cargo: string; turno: string; quantidade: number }[]>([
    { cargo: cargosOpcoes[0]?.id || '', turno: 'DIURNO', quantidade: 1 }
  ]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const turnosOpcoes = [
    { id: 'DIURNO', nome: 'Diurno' },
    { id: 'NOTURNO', nome: 'Noturno' },
    { id: 'MISTO', nome: 'Misto' }
  ];

  const mesesChoices = [
    { num: 1, nome: 'Janeiro' },
    { num: 2, nome: 'Fevereiro' },
    { num: 3, nome: 'Março' },
    { num: 4, nome: 'Abril' },
    { num: 5, nome: 'Maio' },
    { num: 6, nome: 'Junho' },
    { num: 7, nome: 'Julho' },
    { num: 8, nome: 'Agosto' },
    { num: 9, nome: 'Setembro' },
    { num: 10, nome: 'Outubro' },
    { num: 11, nome: 'Novembro' },
    { num: 12, nome: 'Dezembro' }
  ];

  // Adiciona um novo cargo na lista temporária do modal
  const handleAddItem = () => {
    setItens(prev => [...prev, { cargo: cargosOpcoes[0]?.id || '', turno: 'DIURNO', quantidade: 1 }]);
  };

  // Remove um cargo específico da lista temporária do modal
  const handleRemoveItem = (index: number) => {
    setItens(prev => prev.filter((_, i) => i !== index));
  };

  // Atualiza campo específico de um item da lista temporária
  const handleItemChange = (index: number, field: 'cargo' | 'turno' | 'quantidade', value: any) => {
    setItens(prev => prev.map((item, i) => {
      if (i === index) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  // Salva o novo escopo no banco de dados
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!loja) {
      setErrorMsg('Selecione uma loja para o escopo.');
      return;
    }
    if (itens.length === 0) {
      setErrorMsg('Adicione pelo menos um item operacional.');
      return;
    }

    const invalidItem = itens.some(i => !i.cargo || i.quantidade < 1);
    if (invalidItem) {
      setErrorMsg('Verifique se todos os itens possuem cargo selecionado e quantidade maior ou igual a 1.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        loja,
        ano,
        mes,
        itens
      };

      const response = await api.post('/escopos/novo/', payload);
      if (response.data.success) {
        toast.success('Escopo mensal criado com sucesso!');
        onRefresh();
        onClose();
      } else {
        setErrorMsg(response.data.error || 'Erro ao registrar escopo.');
      }
    } catch (err: any) {
      console.error('Erro ao criar escopo:', err);
      setErrorMsg(err.response?.data?.error || 'Erro de comunicação ao salvar novo escopo mensal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-xl w-full max-w-2xl overflow-hidden animate-scale-in">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
          <div>
            <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
              Novo Escopo Mensal
            </h3>
            <p className="text-xs text-neutral-500">Criação planejada de postos e escala salarial para competência</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-xs flex gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Dados de Competência */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1.5 uppercase tracking-wider">
                Loja Física *
              </label>
              <SearchableSelect
                options={lojasOpcoes.map((l) => ({ value: String(l.id), label: l.nome_referencia }))}
                value={loja}
                onChange={setLoja}
                placeholder="Selecione..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1.5 uppercase tracking-wider">
                Ano da Competência *
              </label>
              <SearchableSelect
                options={[
                  { value: '2024', label: '2024' },
                  { value: '2025', label: '2025' },
                  { value: '2026', label: '2026' },
                  { value: '2027', label: '2027' },
                ]}
                value={String(ano)}
                onChange={(val) => setAno(parseInt(val) || new Date().getFullYear())}
                placeholder="Selecione o ano..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1.5 uppercase tracking-wider">
                Mês da Competência *
              </label>
              <SearchableSelect
                options={mesesChoices.map(m => ({ value: String(m.num), label: m.nome }))}
                value={String(mes)}
                onChange={(val) => setMes(parseInt(val) || new Date().getMonth() + 1)}
                placeholder="Selecione o mês..."
              />
            </div>
          </div>

          {/* Itens Operacionais */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-neutral-450 uppercase tracking-wider">
                Itens Operacionais do Escopo
              </h4>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-850 rounded text-xs font-bold cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                Adicionar Cargo
              </button>
            </div>

            {/* Listagem Dinâmica dos Cargos */}
            <div className="max-h-48 overflow-y-auto space-y-3 pr-1">
              {itens.map((item, index) => (
                <div key={index} className="flex gap-3 items-end bg-neutral-50 dark:bg-neutral-850/60 p-3 rounded-lg border border-neutral-200/20">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">
                      Cargo / Função *
                    </label>
                    <SearchableSelect
                      options={[
                        { value: '', label: 'Selecione...' },
                        ...cargosOpcoes.map((c) => ({ value: c.id, label: c.nome })),
                      ]}
                      value={item.cargo}
                      onChange={(val) => handleItemChange(index, 'cargo', val)}
                      placeholder="Selecione..."
                    />
                  </div>

                  <div className="w-40">
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">
                      Turno *
                    </label>
                    <SearchableSelect
                      options={turnosOpcoes.map((t) => ({ value: t.id, label: t.nome }))}
                      value={item.turno}
                      onChange={(val) => handleItemChange(index, 'turno', val)}
                      placeholder="Selecione..."
                    />
                  </div>

                  <div className="w-24">
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1 text-center">
                      Quantidade *
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) => handleItemChange(index, 'quantidade', parseInt(e.target.value) || 1)}
                      className="w-full p-2 border border-neutral-200 dark:border-neutral-855 rounded-lg bg-white dark:bg-neutral-900 text-xs text-center"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors mb-0.5"
                    title="Remover linha"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {itens.length === 0 && (
                <div className="text-center py-6 text-xs text-neutral-400 italic">
                  Nenhum cargo adicionado ainda. Clique em "Adicionar Cargo" acima.
                </div>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-full text-xs font-bold text-neutral-700 dark:text-neutral-300 text-sm font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 shadow-xs disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Escopo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
