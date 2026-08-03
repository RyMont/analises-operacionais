import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2, AlertCircle, FileUp } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import { formatDate } from '../../utils/formatters';
import SearchableSelect from '../ui/searchable-select';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface NovoTesteModalProps {
  onClose: () => void;
  onSaveSuccess: () => void;
}

interface Colaborador {
  id: string;
  nome: string;
  re: string;
  cargo: string;
  cpf: string;
  data_admissao: string;
  loja_nome?: string;
  loja_supervisor?: string;
  loja?: string;
  centro_custo?: string;
}

interface AusenciasInfo {
  faltas: number;
  atestados: number;
  detalhes: any[];
}

/**
 * Modal de solicitação de Novo Teste de Promoção.
 * 
 * Por que existe: Permite a busca reativa de colaboradores, carrega seus dados contratuais
 * e ausências recentes de 1 ano do ponto em tempo real, exigindo o envio da folha de teste
 * para finalizar a solicitação.
 */
export default function NovoTesteModal({ onClose, onSaveSuccess }: NovoTesteModalProps) {
  const [buscaText, setBuscaText] = useState('');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [buscandoColaborador, setBuscandoColaborador] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selecionadoRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  // Selecionado
  const [colaborador, setColaborador] = useState<Colaborador | null>(null);
  const [dataInicio, setDataInicio] = useState('');
  const [anexoFile, setAnexoFile] = useState<File | null>(null);

  // Cargos / Funções (lojas_cargo)
  const [cargos, setCargos] = useState<string[]>([]);
  const [cargoTeste, setCargoTeste] = useState('');
  const [loadingCargos, setLoadingCargos] = useState(false);

  // Ausências
  const [ausencias, setAusencias] = useState<AusenciasInfo | null>(null);
  const [loadingAusencias, setLoadingAusencias] = useState(false);
  const [errorAusencias, setErrorAusencias] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Carrega lista de cargos parametrizados no lojas_cargo
  useEffect(() => {
    const fetchCargos = async () => {
      setLoadingCargos(true);
      try {
        const response = await api.get('/colaboradores/testes/cargos/');
        setCargos(response.data || []);
      } catch (err) {
        console.error('Erro ao carregar cargos de lojas_cargo:', err);
      } finally {
        setLoadingCargos(false);
      }
    };
    fetchCargos();
  }, []);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Busca debounced de colaboradores
  useEffect(() => {
    if (selecionadoRef.current || buscaText.trim().length < 2) {
      setColaboradores([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setBuscandoColaborador(true);
      try {
        const response = await api.get('/colaboradores/', {
          params: { nome: buscaText }
        });
        if (response.data && response.data.results) {
          setColaboradores(response.data.results);
        } else {
          setColaboradores(response.data || []);
        }
        setShowDropdown(true);
      } catch (err) {
        console.error('Erro ao buscar colaboradores autocomplete:', err);
      } finally {
        setBuscandoColaborador(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [buscaText]);

  // Busca ausências recentes
  useEffect(() => {
    if (!colaborador) {
      setAusencias(null);
      return;
    }

    const fetchAusencias = async () => {
      setLoadingAusencias(true);
      setErrorAusencias(null);
      try {
        // Busca ausências 1 ano / admissão
        const ausenciasRes = await api.get(`/colaboradores/testes/colaborador/${colaborador.id}/ausencias/`);
        setAusencias(ausenciasRes.data);
      } catch (err: any) {
        console.error('Erro ao carregar dados do ponto:', err);
        setErrorAusencias(err.response?.data?.error || 'Erro ao comunicar com a GeoVictoria.');
      } finally {
        setLoadingAusencias(false);
      }
    };

    fetchAusencias();
  }, [colaborador]);

  const handleSelectColaborador = (colab: Colaborador) => {
    selecionadoRef.current = true;
    setColaborador(colab);
    setBuscaText(colab.nome);
    setShowDropdown(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAnexoFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!colaborador) {
      toast.error('Por favor, selecione um colaborador.');
      return;
    }
    if (!cargoTeste) {
      toast.error('Por favor, selecione o cargo/função em teste.');
      return;
    }
    if (!dataInicio) {
      toast.error('Por favor, informe a data de início do teste.');
      return;
    }
    if (!anexoFile) {
      toast.error('Por favor, anexe a folha de teste de promoção.');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('colaborador_id', colaborador.id);
      formData.append('cargo_teste', cargoTeste);
      formData.append('data_inicio', dataInicio);
      formData.append('anexo', anexoFile);

      await api.post('/colaboradores/testes/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Solicitação de teste de promoção cadastrada com sucesso!');
      onSaveSuccess();
    } catch (err: any) {
      console.error('Erro ao salvar teste de promoção:', err);
      toast.error(err.response?.data?.error || 'Erro ao registrar solicitação.');
    } finally {
      setSaving(false);
    }
  };

  const getSupervisor = () => {
    if (colaborador?.loja_supervisor) {
      return colaborador.loja_supervisor;
    }
    return 'Não cadastrado';
  };

  const getLoja = () => {
    if (colaborador?.loja_nome) return colaborador.loja_nome;
    return colaborador?.centro_custo || 'Não vinculada';
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">Nova Solicitação de Teste</h3>
            <p className="text-xs text-neutral-500">Crie o controle para promoção de cargo do funcionário</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Autocomplete Colaborador */}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider">Buscar Colaborador *</label>
            
            {/* Campo de Busca Visualmente Unificado - Sem problemas de encavalamento */}
            <div className="flex items-center w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg focus-within:ring-1 focus-within:ring-neutral-900 dark:focus-within:ring-white">
              <Search className="h-4.5 w-4.5 text-neutral-450 mr-2.5 shrink-0" />
              <input
                type="text"
                placeholder="Busque pelo nome ou RE do colaborador..."
                value={buscaText}
                onChange={(e) => {
                  selecionadoRef.current = false;
                  setBuscaText(e.target.value);
                  if (colaborador) {
                    setColaborador(null);
                    setAusencias(null);
                  }
                }}
                className="w-full bg-transparent text-sm text-neutral-800 dark:text-neutral-200 focus:outline-hidden"
              />
              {buscandoColaborador && (
                <Loader2 className="h-4.5 w-4.5 animate-spin text-neutral-450 ml-2.5 shrink-0" />
              )}
            </div>

            {/* Dropdown */}
            {showDropdown && colaboradores.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
                {colaboradores.map((colab) => (
                  <button
                    key={colab.id}
                    type="button"
                    onClick={() => handleSelectColaborador(colab)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-850/50 transition-colors flex justify-between items-center"
                  >
                    <div>
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">{colab.nome}</span>
                      <span className="text-xs text-neutral-400 block">RE: {colab.re} • {colab.cargo}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {colaborador && (
            <div className="space-y-6 animate-fade-in">
              {/* Informações contratuais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-neutral-50 dark:bg-neutral-950/45 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider block">Admissão</span>
                  <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">{formatDate(colaborador.data_admissao)}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider block">Loja de Lotação</span>
                  <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">{getLoja()}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider block">Cargo Atual</span>
                  <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">{colaborador.cargo}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider block">Supervisão</span>
                  <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">
                    {loadingAusencias ? (
                      <Loader2 className="h-3 w-3 animate-spin text-neutral-400 inline" />
                    ) : (
                      getSupervisor()
                    )}
                  </span>
                </div>
              </div>

              {/* Faltas e Atestados recentes */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                <div className="p-4 bg-neutral-50 dark:bg-neutral-950/45 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center">
                  <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">Histórico Recente de Ausências (Último Ano)</h4>
                  <span className="text-[10px] text-neutral-400">GeoVictoria</span>
                </div>

                {loadingAusencias ? (
                  <div className="flex items-center justify-center p-8 gap-2.5 text-neutral-500">
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    <span className="text-xs">Sincronizando pontos da GeoVictoria...</span>
                  </div>
                ) : errorAusencias ? (
                  <div className="p-4 flex gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border-t border-red-500/10">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorAusencias}</span>
                  </div>
                ) : ausencias ? (
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3.5 bg-red-500/5 border border-red-500/20 rounded-xl text-center">
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block">Total de Faltas</span>
                        <span className="text-2xl font-extrabold text-red-600 dark:text-red-400">{ausencias.faltas}</span>
                      </div>
                      <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl text-center">
                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">Total de Atestados</span>
                        <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{ausencias.atestados}</span>
                      </div>
                    </div>

                    {ausencias.detalhes && ausencias.detalhes.length > 0 ? (
                      <div className="max-h-32 overflow-y-auto space-y-2 pr-2">
                        {ausencias.detalhes.map((det, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs p-2 rounded-lg bg-neutral-50 dark:bg-neutral-950/20 border border-neutral-100 dark:border-neutral-850">
                            <div>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase mr-2 ${
                                det.tipo === 'FALTA' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                              }`}>
                                {det.tipo}
                              </span>
                              <span className="font-semibold text-neutral-800 dark:text-neutral-300">{det.descricao}</span>
                            </div>
                            <span className="text-neutral-500 font-medium">{formatDate(det.data)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-2 text-xs text-neutral-400 font-medium border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg">
                        Nenhuma ausência registrada neste período.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Seleção do Cargo com SearchableSelect, Data e Upload */}
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Cargo em Teste - Utilizando SearchableSelect */}
                  <div className="space-y-1.5 relative">
                    <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider block">Cargo/Função em Teste *</label>
                    <SearchableSelect
                      options={cargos.map(cargo => ({ value: cargo, label: cargo }))}
                      value={cargoTeste}
                      onChange={setCargoTeste}
                      placeholder="Pesquise e selecione o cargo..."
                      searchPlaceholder="Digite o nome do cargo..."
                      loading={loadingCargos}
                    />
                  </div>

                  {/* Data Início */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider block">Data de Início *</label>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-neutral-200 focus:outline-hidden cursor-pointer"
                    />
                  </div>
                </div>

                {/* Upload Anexo - Sem a propriedade required nativa (evita o bug de form não focável) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider">Folha de Teste (Anexo) *</label>
                  <label className="flex items-center justify-center gap-2.5 w-full px-4 py-2 text-sm border border-dashed border-neutral-300 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-700 rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-950/20 transition-all cursor-pointer">
                    <FileUp className="h-4.5 w-4.5" />
                    <span className="truncate max-w-[200px]">
                      {anexoFile ? anexoFile.name : 'Selecionar arquivo...'}
                    </span>
                    <input
                      type="file"
                      onChange={handleFileChange}
                      accept="application/pdf,image/*"
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Rodapé do Form */}
          <div className="flex justify-end gap-3 pt-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-neutral-200 dark:border-neutral-850 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-500 rounded-full text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !colaborador}
              className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all cursor-pointer"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Cadastrar Solicitação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
