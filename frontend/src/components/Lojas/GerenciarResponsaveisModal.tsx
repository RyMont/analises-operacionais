import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Edit2, Trash2, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../api/client';
import type { Responsavel } from './LojasTable';
import FormField from '../ui/form-field';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface GerenciarResponsaveisModalProps {
  onClose: () => void;
  onRefresh: () => void;
}

/**
 * Modal de Gerenciamento de Responsáveis (Coordenadores e Supervisores).
 * 
 * Por que existe: Permite listar, cadastrar, editar e excluir coordenadores e
 * supervisores vinculados às lojas e aos prêmios. Garante que possamos associar
 * REs para fins de conciliação e filtros detalhados no BI.
 */
export default function GerenciarResponsaveisModal({
  onClose,
  onRefresh,
}: GerenciarResponsaveisModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  const [activeTab, setActiveTab] = useState<'coordenadores' | 'supervisores'>('coordenadores');
  const [items, setItems] = useState<Responsavel[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados do formulário (Edição / Criação)
  const [formMode, setFormMode] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedItem, setSelectedItem] = useState<Responsavel | null>(null);
  const [nome, setNome] = useState('');
  const [re, setRe] = useState('');
  const [coordenadorId, setCoordenadorId] = useState('');
  const [orcamentoDiarias, setOrcamentoDiarias] = useState('');
  const [orcamentoPremios, setOrcamentoPremios] = useState('');
  const [coordenadoresOpcoes, setCoordenadoresOpcoes] = useState<Responsavel[]>([]);

  const fetchCoordenadoresOpcoes = async () => {
    try {
      const response = await api.get('/lojas/api/coordenadores/');
      setCoordenadoresOpcoes(response.data || []);
    } catch (err) {
      console.error('Erro ao buscar coordenadores para opções:', err);
    }
  };

  useEffect(() => {
    fetchCoordenadoresOpcoes();
  }, []);

  // Busca dados dependendo da aba ativa
  const fetchItems = async () => {
    setLoading(true);
    setErrorMsg(null);
    const endpoint = activeTab === 'coordenadores' ? '/lojas/api/coordenadores/' : '/lojas/api/supervisores/';
    try {
      const response = await api.get(endpoint);
      setItems(response.data || []);
    } catch (err) {
      console.error(`Erro ao buscar ${activeTab}:`, err);
      setErrorMsg(`Não foi possível carregar os ${activeTab} do servidor.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    setFormMode('list');
  }, [activeTab]);

  // Abre formulário de criação
  const handleOpenCreate = () => {
    setNome('');
    setRe('');
    setCoordenadorId('');
    setOrcamentoDiarias('');
    setOrcamentoPremios('');
    setFormMode('create');
    setErrorMsg(null);
  };

  // Abre formulário de edição
  const handleOpenEdit = (item: Responsavel) => {
    setSelectedItem(item);
    setNome(item.nome);
    setRe(item.re || '');
    setCoordenadorId(item.coordenador || '');
    setOrcamentoDiarias(item.orcamento_diarias || '');
    setOrcamentoPremios(item.orcamento_premios || '');
    setFormMode('edit');
    setErrorMsg(null);
  };

  // Salva o cadastro (Criação ou Edição)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setActionLoading(true);

    const payload: any = {
      nome: nome.trim(),
      re: re.trim(),
    };
    if (activeTab === 'coordenadores') {
      payload.orcamento_diarias = orcamentoDiarias ? parseFloat(orcamentoDiarias) : 0;
      payload.orcamento_premios = orcamentoPremios ? parseFloat(orcamentoPremios) : 0;
    }
    if (activeTab === 'supervisores') {
      payload.coordenador = coordenadorId || null;
    }

    const endpointBase = activeTab === 'coordenadores' ? '/lojas/api/coordenadores/' : '/lojas/api/supervisores/';
    const endpoint = formMode === 'edit' && selectedItem ? `${endpointBase}${selectedItem.id}/` : endpointBase;

    try {
      if (formMode === 'edit') {
        await api.put(endpoint, payload);
        toast.success(`${activeTab === 'coordenadores' ? 'Coordenador' : 'Supervisor'} atualizado com sucesso!`);
      } else {
        await api.post(endpoint, payload);
        toast.success(`${activeTab === 'coordenadores' ? 'Coordenador' : 'Supervisor'} cadastrado com sucesso!`);
      }
      onRefresh(); // Notifica o pai para atualizar
      setFormMode('list');
      fetchItems();
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setErrorMsg(
        err.response?.data?.errors
          ? JSON.stringify(err.response.data.errors)
          : 'Erro ao processar requisição.'
      );
      toast.error('Erro ao salvar registro.');
    } finally {
      setActionLoading(false);
    }
  };

  // Exclui um registro
  const handleDelete = async (item: Responsavel) => {
    const cargoNome = activeTab === 'coordenadores' ? 'Coordenador' : 'Supervisor';
    if (!window.confirm(`Tem certeza de que deseja excluir o ${cargoNome.toLowerCase()} "${item.nome}"?`)) {
      return;
    }

    setErrorMsg(null);
    const endpointBase = activeTab === 'coordenadores' ? '/lojas/api/coordenadores/' : '/lojas/api/supervisores/';
    try {
      await api.delete(`${endpointBase}${item.id}/`);
      toast.success(`${cargoNome} excluído com sucesso!`);
      onRefresh(); // Notifica o pai
      fetchItems();
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      setErrorMsg('Erro ao tentar excluir o registro do servidor.');
      toast.error('Erro ao excluir registro.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-xl w-full max-w-2xl overflow-hidden animate-scale-in">
        
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
          <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
            Gerenciar Coordenadores e Supervisores
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Abas do Modal */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 px-4">
          {(['coordenadores', 'supervisores'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              disabled={formMode !== 'list'}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                activeTab === tab
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {tab === 'coordenadores' ? 'Coordenadores' : 'Supervisores'}
            </button>
          ))}
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-md text-xs flex gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {formMode === 'list' ? (
            <div className="space-y-4">
              {/* Barra de Ações */}
              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-500">
                  Total de {activeTab === 'coordenadores' ? 'coordenadores' : 'supervisores'}: {items.length}
                </span>
                <button
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 transition-all shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Cadastrar {activeTab === 'coordenadores' ? 'Coordenador' : 'Supervisor'}
                </button>
              </div>

              {/* Listagem */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
                {loading ? (
                  <div className="p-10 flex items-center justify-center text-neutral-400 gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Carregando dados...</span>
                  </div>
                ) : items.length === 0 ? (
                  <div className="p-10 text-center text-neutral-450 text-xs">
                    Nenhum registro encontrado. Cadastre um novo para começar.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 text-[10px] font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider">
                        <th className="py-2 px-4">Nome</th>
                        <th className="py-2 px-4">RE</th>
                        {activeTab === 'supervisores' && <th className="py-2 px-4">Coordenador</th>}
                        <th className="py-2 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-150 dark:divide-neutral-800 text-xs text-neutral-800 dark:text-neutral-200">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                          <td className="py-2.5 px-4 font-semibold">{item.nome}</td>
                          <td className="py-2.5 px-4 font-mono text-neutral-500">{item.re || '—'}</td>
                          {activeTab === 'supervisores' && (
                            <td className="py-2.5 px-4 font-semibold text-neutral-600 dark:text-neutral-450">
                              {item.coordenador_nome || '—'}
                            </td>
                          )}
                          <td className="py-2.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-750 rounded-md transition-colors text-neutral-700 dark:text-neutral-300 inline-block"
                              title="Editar"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-md transition-colors text-red-650 inline-block"
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            /* Formulário de Criação/Edição */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setFormMode('list')}
                  className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500 hover:text-neutral-850"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h4 className="font-bold text-sm text-neutral-800 dark:text-neutral-200">
                  {formMode === 'edit'
                    ? `Editar ${activeTab === 'coordenadores' ? 'Coordenador' : 'Supervisor'}`
                    : `Cadastrar Novo ${activeTab === 'coordenadores' ? 'Coordenador' : 'Supervisor'}`}
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <FormField
                    label="Nome Completo *"
                    value={nome}
                    onChange={setNome}
                    placeholder="Ex: Carlos Alberto Silva"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <FormField
                    label="Código RE (Opcional)"
                    value={re}
                    onChange={setRe}
                    placeholder="Ex: 012345"
                  />
                </div>

                {activeTab === 'coordenadores' && (
                  <>
                    <div>
                      <FormField
                        label="Orçamento Mensal Diárias (R$)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={orcamentoDiarias}
                        onChange={setOrcamentoDiarias}
                        placeholder="Ex: 5000.00"
                      />
                    </div>
                    <div>
                      <FormField
                        label="Orçamento Mensal Prêmios (R$)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={orcamentoPremios}
                        onChange={setOrcamentoPremios}
                        placeholder="Ex: 10000.00"
                      />
                    </div>
                  </>
                )}

                {activeTab === 'supervisores' && (
                  <div className="md:col-span-2">
                    <FormField
                      label="Coordenador Associado"
                      type="select"
                      value={coordenadorId}
                      onChange={setCoordenadorId}
                      options={coordenadoresOpcoes.map((c) => ({ value: c.id, label: c.nome }))}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setFormMode('list')}
                  disabled={actionLoading}
                  className="px-4 py-2 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-full text-xs font-bold text-neutral-700 dark:text-neutral-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 transition-all shadow-xs disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  {formMode === 'edit' ? 'Salvar Alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer do Modal */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-full text-xs font-bold text-neutral-700 dark:text-neutral-300 transition-colors"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
}
