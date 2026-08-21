import { useState, useEffect } from 'react';
import { Briefcase, X, UserPlus, Search, Check, AlertCircle, Trash2, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../api/client';

interface Cargo {
  id: string;
  nome: string;
}

interface ColaboradorLight {
  id: string;
  nome: string;
  re: string;
  cargo: string;
}

interface NovoCargoModalProps {
  cargos: Cargo[];
  onClose: () => void;
  onCargoUpdated: () => void;
}

export default function NovoCargoModal({
  cargos,
  onClose,
  onCargoUpdated,
}: NovoCargoModalProps) {
  const [tab, setTab] = useState<'novo' | 'gerenciar'>('novo');

  // Form novo cargo
  const [nomeCargo, setNomeCargo] = useState('');
  const [atribuirAgora, setAtribuirAgora] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Busca e seleção de colaboradores para atribuição
  const [buscaColab, setBuscaColab] = useState('');
  const [colaboradoresEncontrados, setColaboradoresEncontrados] = useState<ColaboradorLight[]>([]);
  const [loadingColabs, setLoadingColabs] = useState(false);
  const [selectedColabs, setSelectedColabs] = useState<ColaboradorLight[]>([]);

  // Gestão de cargos existentes
  const [buscaCargoExistente, setBuscaCargoExistente] = useState('');
  const [cargoParaAtribuir, setCargoParaAtribuir] = useState<Cargo | null>(null);

  // Carrega colaboradores conforme busca
  useEffect(() => {
    if (!atribuirAgora && !cargoParaAtribuir) return;

    const timer = setTimeout(async () => {
      setLoadingColabs(true);
      try {
        const response = await api.get('/colaboradores/agendamentos/colaboradores-ativos/', {
          params: { busca: buscaColab || undefined }
        });
        setColaboradoresEncontrados(response.data || []);
      } catch (err) {
        console.error('Erro ao buscar colaboradores:', err);
      } finally {
        setLoadingColabs(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [buscaColab, atribuirAgora, cargoParaAtribuir]);

  const handleToggleColab = (colab: ColaboradorLight) => {
    setSelectedColabs((prev) => {
      const exists = prev.some((c) => c.id === colab.id);
      if (exists) {
        return prev.filter((c) => c.id !== colab.id);
      }
      return [...prev, colab];
    });
  };

  const handleSalvarNovoCargo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cargoLimpo = nomeCargo.trim().toUpperCase();
    if (!cargoLimpo) {
      setErrorMsg('Informe o nome do cargo.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Cadastra o novo cargo
      const response = await api.post('/cargos/', { nome: cargoLimpo });
      const cargoCriado = response.data;

      // 2. Se houver colaboradores selecionados, faz a atribuição em lote
      if (atribuirAgora && selectedColabs.length > 0) {
        const payloadAtribuir = {
          cargo: cargoCriado.nome || cargoLimpo,
          colaborador_ids: selectedColabs.map((c) => c.id),
        };
        await api.post('/colaboradores/atribuir-cargo/', payloadAtribuir);
        toast.success(`Cargo "${cargoLimpo}" criado e atribuído a ${selectedColabs.length} colaborador(es)!`);
      } else {
        toast.success(`Cargo "${cargoLimpo}" cadastrado com sucesso!`);
      }

      onCargoUpdated();
      onClose();
    } catch (err: any) {
      console.error('Erro ao cadastrar cargo:', err);
      const erro = err.response?.data?.error || err.response?.data?.detail || 'Erro ao cadastrar o cargo.';
      setErrorMsg(erro);
      toast.error(erro);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAtribuirCargoExistente = async () => {
    if (!cargoParaAtribuir) return;
    if (selectedColabs.length === 0) {
      toast.error('Selecione pelo menos um colaborador para atribuir o cargo.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        cargo: cargoParaAtribuir.nome,
        colaborador_ids: selectedColabs.map((c) => c.id),
      };
      await api.post('/colaboradores/atribuir-cargo/', payload);
      toast.success(`Cargo "${cargoParaAtribuir.nome}" atribuído com sucesso a ${selectedColabs.length} colaborador(es)!`);
      setCargoParaAtribuir(null);
      setSelectedColabs([]);
      setBuscaColab('');
    } catch (err: any) {
      console.error('Erro ao atribuir cargo:', err);
      toast.error(err.response?.data?.error || 'Erro ao atribuir cargo aos colaboradores.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExcluirCargo = async (cargo: Cargo) => {
    if (!confirm(`Tem certeza que deseja remover o cargo "${cargo.nome}"?`)) return;

    try {
      await api.delete(`/cargos/${cargo.id}/`);
      toast.success(`Cargo "${cargo.nome}" removido com sucesso.`);
      onCargoUpdated();
    } catch (err: any) {
      console.error('Erro ao remover cargo:', err);
      const erro = err.response?.data?.error || 'Não foi possível excluir o cargo. Verifique se existem salários ou escopos vinculados.';
      toast.error(erro);
    }
  };

  const cargosFiltrados = cargos.filter((c) =>
    c.nome.toLowerCase().includes(buscaCargoExistente.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-850/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-bold">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-50">
                Gestão de Cargos & Funções
              </h3>
              <p className="text-xs text-neutral-500">
                Cadastre novas funções e atribua diretamente aos colaboradores
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 px-5 pt-3 bg-neutral-50/30 dark:bg-neutral-850/30 gap-4">
          <button
            type="button"
            onClick={() => {
              setTab('novo');
              setCargoParaAtribuir(null);
            }}
            className={`pb-2.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              tab === 'novo' && !cargoParaAtribuir
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Cadastrar Novo Cargo
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('gerenciar');
              setCargoParaAtribuir(null);
            }}
            className={`pb-2.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              tab === 'gerenciar' || cargoParaAtribuir
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Cargos Cadastrados ({cargos.length})
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-xs flex gap-2 items-center">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ABA: NOVO CARGO */}
          {tab === 'novo' && !cargoParaAtribuir && (
            <form onSubmit={handleSalvarNovoCargo} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                  Nome da Função / Cargo *
                </label>
                <input
                  type="text"
                  placeholder="Ex: SUPERVISOR DE OPERAÇÕES, AUXILIAR DE LIMPEZA..."
                  value={nomeCargo}
                  onChange={(e) => setNomeCargo(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-neutral-55 dark:bg-neutral-950 text-xs border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-850 dark:text-neutral-200 focus:outline-none uppercase font-semibold"
                />
              </div>

              {/* Opção de atribuir a colaboradores */}
              <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={atribuirAgora}
                      onChange={(e) => {
                        setAtribuirAgora(e.target.checked);
                        if (!e.target.checked) setSelectedColabs([]);
                      }}
                      className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 h-4 w-4"
                    />
                    <span>Atribuir este novo cargo a colaboradores agora</span>
                  </label>
                  {atribuirAgora && selectedColabs.length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900">
                      {selectedColabs.length} selecionado(s)
                    </span>
                  )}
                </div>

                {atribuirAgora && (
                  <div className="space-y-3 p-3.5 bg-neutral-50 dark:bg-neutral-850/50 rounded-xl border border-neutral-200 dark:border-neutral-800 animate-fade-in">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Buscar colaborador por Nome ou RE..."
                        value={buscaColab}
                        onChange={(e) => setBuscaColab(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-neutral-900 text-xs border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-850 dark:text-neutral-200 focus:outline-none"
                      />
                    </div>

                    {/* Chips de selecionados */}
                    {selectedColabs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
                        {selectedColabs.map((colab) => (
                          <span
                            key={colab.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-[11px] rounded-md font-medium"
                          >
                            <span className="truncate max-w-[150px]">{colab.nome}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleColab(colab)}
                              className="text-neutral-400 hover:text-red-500 cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Lista de colaboradores encontrados */}
                    <div className="max-h-44 overflow-y-auto space-y-1 divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-1">
                      {loadingColabs ? (
                        <div className="p-4 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Buscando colaboradores ativos...
                        </div>
                      ) : colaboradoresEncontrados.length === 0 ? (
                        <div className="p-4 text-center text-xs text-neutral-400">
                          Nenhum colaborador encontrado.
                        </div>
                      ) : (
                        colaboradoresEncontrados.map((colab) => {
                          const isSelected = selectedColabs.some((c) => c.id === colab.id);
                          return (
                            <div
                              key={colab.id}
                              onClick={() => handleToggleColab(colab)}
                              className={`p-2 rounded-md flex items-center justify-between cursor-pointer text-xs transition-colors ${
                                isSelected
                                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold'
                                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold">{colab.nome}</span>
                                <span className="text-[10px] text-neutral-400">
                                  RE: {colab.re} | Cargo Atual: {colab.cargo || 'Não definido'}
                                </span>
                              </div>
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center ${
                                  isSelected
                                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent'
                                    : 'border-neutral-300 dark:border-neutral-700'
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3" />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Botões do Rodapé */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Salvando...
                    </>
                  ) : atribuirAgora && selectedColabs.length > 0 ? (
                    `Salvar e Atribuir a (${selectedColabs.length})`
                  ) : (
                    'Cadastrar Cargo'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ABA: GERENCIAR CARGOS OU ATRIBUIR CARGO ESPECÍFICO */}
          {(tab === 'gerenciar' || cargoParaAtribuir) && (
            <div className="space-y-4">
              {cargoParaAtribuir ? (
                /* Sub-tela: Atribuir cargo existente selecionado */
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
                    <div>
                      <span className="text-[10px] font-bold text-neutral-400 uppercase">
                        Atribuindo Cargo
                      </span>
                      <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-50">
                        {cargoParaAtribuir.nome}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCargoParaAtribuir(null);
                        setSelectedColabs([]);
                      }}
                      className="text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                    >
                      Voltar à lista
                    </button>
                  </div>

                  <div className="space-y-3 p-3.5 bg-neutral-50 dark:bg-neutral-850/50 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Buscar colaborador por Nome ou RE..."
                        value={buscaColab}
                        onChange={(e) => setBuscaColab(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-neutral-900 text-xs border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-850 dark:text-neutral-200 focus:outline-none"
                      />
                    </div>

                    {/* Chips de selecionados */}
                    {selectedColabs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
                        {selectedColabs.map((colab) => (
                          <span
                            key={colab.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-[11px] rounded-md font-medium"
                          >
                            <span className="truncate max-w-[150px]">{colab.nome}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleColab(colab)}
                              className="text-neutral-400 hover:text-red-500 cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Lista de colaboradores encontrados */}
                    <div className="max-h-48 overflow-y-auto space-y-1 divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-1">
                      {loadingColabs ? (
                        <div className="p-4 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Buscando colaboradores ativos...
                        </div>
                      ) : colaboradoresEncontrados.length === 0 ? (
                        <div className="p-4 text-center text-xs text-neutral-400">
                          Nenhum colaborador encontrado.
                        </div>
                      ) : (
                        colaboradoresEncontrados.map((colab) => {
                          const isSelected = selectedColabs.some((c) => c.id === colab.id);
                          return (
                            <div
                              key={colab.id}
                              onClick={() => handleToggleColab(colab)}
                              className={`p-2 rounded-md flex items-center justify-between cursor-pointer text-xs transition-colors ${
                                isSelected
                                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold'
                                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold">{colab.nome}</span>
                                <span className="text-[10px] text-neutral-400">
                                  RE: {colab.re} | Cargo Atual: {colab.cargo || 'Não definido'}
                                </span>
                              </div>
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center ${
                                  isSelected
                                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent'
                                    : 'border-neutral-300 dark:border-neutral-700'
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3" />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCargoParaAtribuir(null);
                        setSelectedColabs([]);
                      }}
                      className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={submitting || selectedColabs.length === 0}
                      onClick={handleAtribuirCargoExistente}
                      className="px-5 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Atribuindo...
                        </>
                      ) : (
                        `Confirmar Atribuição (${selectedColabs.length})`
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Lista de todos os cargos cadastrados */
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Pesquisar cargo cadastrado..."
                      value={buscaCargoExistente}
                      onChange={(e) => setBuscaCargoExistente(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-neutral-55 dark:bg-neutral-950 text-xs border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-850 dark:text-neutral-200 focus:outline-none"
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl p-2 bg-white dark:bg-neutral-900">
                    {cargosFiltrados.length === 0 ? (
                      <div className="p-6 text-center text-xs text-neutral-400">
                        Nenhum cargo encontrado.
                      </div>
                    ) : (
                      cargosFiltrados.map((c) => (
                        <div
                          key={c.id}
                          className="pt-2 first:pt-0 flex items-center justify-between px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-850/50 rounded-lg transition-colors"
                        >
                          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                            {c.nome}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setCargoParaAtribuir(c);
                                setSelectedColabs([]);
                                setBuscaColab('');
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-300 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <UserPlus className="h-3 w-3" />
                              Atribuir
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExcluirCargo(c)}
                              title="Excluir Cargo"
                              className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
