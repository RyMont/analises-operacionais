import { useEffect, useState } from 'react';
import { Plus, Search, Edit3, Trash2, AlertCircle, X, ChevronLeft, ChevronRight, Briefcase } from 'lucide-react';
import api from '../api/client';
import SearchableSelect from '../components/ui/searchable-select';
import NovoCargoModal from '../components/Salarios/NovoCargoModal';

interface Cargo {
  id: string;
  nome: string;
}

interface Salario {
  id: string;
  cargo: string;
  cargo_nome: string;
  uf: string;
  ano: number;
  valor: string;
}

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", 
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", 
  "RS", "RO", "RR", "SC", "SP", "SE", "TO", "BR"
];

export default function Salarios() {
  const [salarios, setSalarios] = useState<Salario[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [buscaTextual, setBuscaTextual] = useState('');
  const [filtroCargo, setFiltroCargo] = useState('');
  const [filtroUf, setFiltroUf] = useState('');
  const [filtroAno, setFiltroAno] = useState('');

  // Modais
  const [showModal, setShowModal] = useState(false);
  const [showCargoModal, setShowCargoModal] = useState(false);
  const [selectedSalario, setSelectedSalario] = useState<Salario | null>(null);

  // Formulário
  const [formCargo, setFormCargo] = useState('');
  const [formUf, setFormUf] = useState('SP');
  const [formAno, setFormAno] = useState(new Date().getFullYear().toString());
  const [formValor, setFormValor] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    fetchCargos();
    fetchSalarios();
  }, []);

  const fetchCargos = async () => {
    try {
      const response = await api.get('/cargos/');
      const dados = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setCargos(dados);
    } catch (err) {
      console.error('Erro ao carregar cargos:', err);
    }
  };

  const fetchSalarios = async () => {
    setLoading(true);
    try {
      const response = await api.get('/lojas/api/salarios/');
      const dados = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setSalarios(dados);
    } catch (err) {
      console.error('Erro ao carregar salários:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (salario?: Salario) => {
    if (salario) {
      setSelectedSalario(salario);
      setFormCargo(salario.cargo);
      setFormUf(salario.uf);
      setFormAno(salario.ano.toString());
      setFormValor(salario.valor);
    } else {
      setSelectedSalario(null);
      setFormCargo('');
      setFormUf('SP');
      setFormAno(new Date().getFullYear().toString());
      setFormValor('');
    }
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formCargo) {
      setFormError('Selecione um cargo.');
      return;
    }
    if (!formValor || parseFloat(formValor) <= 0) {
      setFormError('Informe um valor de salário válido.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        cargo: formCargo,
        uf: formUf,
        ano: parseInt(formAno),
        valor: parseFloat(formValor)
      };

      if (selectedSalario) {
        await api.patch(`/lojas/api/salarios/${selectedSalario.id}/`, payload);
      } else {
        await api.post('/lojas/api/salarios/', payload);
      }

      setShowModal(false);
      fetchSalarios();
    } catch (err: any) {
      console.error('Erro ao salvar salário:', err);
      if (err.response?.data?.non_field_errors) {
        setFormError(err.response.data.non_field_errors[0]);
      } else if (err.response?.data?.error) {
        setFormError(err.response.data.error);
      } else {
        setFormError('Erro ao salvar registro de salário.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este registro de salário base?')) return;
    try {
      await api.delete(`/lojas/api/salarios/${id}/`);
      fetchSalarios();
    } catch (err) {
      console.error('Erro ao excluir salário:', err);
    }
  };

  const handleLimparFiltros = () => {
    setFiltroCargo('');
    setFiltroUf('');
    setFiltroAno('');
    setBuscaTextual('');
    setCurrentPage(1);
  };

  // Filtragem
  const salariosFiltrados = salarios.filter(s => {
    if (filtroCargo && s.cargo !== filtroCargo) return false;
    if (filtroUf && s.uf !== filtroUf) return false;
    if (filtroAno && s.ano.toString() !== filtroAno) return false;
    if (buscaTextual) {
      const termo = buscaTextual.toLowerCase();
      const matchCargo = s.cargo_nome?.toLowerCase().includes(termo);
      const matchUf = s.uf?.toLowerCase().includes(termo);
      if (!matchCargo && !matchUf) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(salariosFiltrados.length / itemsPerPage) || 1;
  const salariosPaginados = salariosFiltrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Salários Base por Região (Dissídios)</h1>
          <p className="text-xs text-neutral-500">Tabela de remunerações base por cargo, UF e ano para estimativas operacionais</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowCargoModal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 rounded-full text-xs font-bold hover:bg-neutral-100 dark:hover:bg-neutral-750 shadow-xs transition-all cursor-pointer"
          >
            <Briefcase className="h-4 w-4" />
            Novo Cargo
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Novo Salário Base
          </button>
        </div>
      </div>

      {/* Painel de Filtros */}
      <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Pesquisar</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Pesquisar cargo ou UF..."
                value={buscaTextual}
                onChange={(e) => { setBuscaTextual(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-4 py-2 bg-neutral-55 dark:bg-neutral-950 text-xs border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-850 dark:text-neutral-200 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Filtrar Cargo</label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todos os cargos' },
                ...cargos.map((cargo) => ({ value: cargo.id, label: cargo.nome })),
              ]}
              value={filtroCargo}
              onChange={(val) => { setFiltroCargo(val); setCurrentPage(1); }}
              placeholder="Todos os cargos"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Filtrar UF</label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todas as UFs' },
                ...UF_OPTIONS.map((uf) => ({ value: uf, label: uf })),
              ]}
              value={filtroUf}
              onChange={(val) => { setFiltroUf(val); setCurrentPage(1); }}
              placeholder="Todas as UFs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-neutral-500 uppercase">Filtrar Ano</label>
            <input
              type="number"
              placeholder="Ex: 2026"
              value={filtroAno}
              onChange={(e) => { setFiltroAno(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-neutral-55 dark:bg-neutral-950 text-xs border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-850 dark:text-neutral-200 focus:outline-none"
            />
          </div>
        </div>

        {(filtroCargo || filtroUf || filtroAno || buscaTextual) && (
          <div className="flex justify-end">
            <button
              onClick={handleLimparFiltros}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 font-semibold cursor-pointer"
            >
              Limpar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabela de Dados */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-200 dark:border-neutral-800 text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                <th className="py-3 px-6">Cargo</th>
                <th className="py-3 px-6">Região / UF</th>
                <th className="py-3 px-6">Ano de Vigência</th>
                <th className="py-3 px-6 text-right">Salário Base</th>
                <th className="py-3 px-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-400 font-medium">
                    Carregando tabela de salários...
                  </td>
                </tr>
              ) : salariosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-400 font-medium">
                    Nenhum salário cadastrado com os filtros ativos.
                  </td>
                </tr>
              ) : (
                salariosPaginados.map((sal) => (
                  <tr key={sal.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/30 transition-colors">
                    <td className="py-4 px-6 font-semibold text-neutral-800 dark:text-neutral-200">
                      {sal.cargo_nome}
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-semibold rounded-md text-[10px]">
                        {sal.uf}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-neutral-500 dark:text-neutral-400 font-medium">
                      {sal.ano}
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-neutral-900 dark:text-neutral-100">
                      R$ {parseFloat(sal.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => handleOpenModal(sal)}
                          title="Editar Salário"
                          className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(sal.id)}
                          title="Excluir Salário"
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
            <span className="text-xs text-neutral-500">
              Página {currentPage} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-neutral-900 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-neutral-900 cursor-pointer"
              >
                Próximo
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Cadastro / Edição */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                {selectedSalario ? 'Editar Salário Base' : 'Novo Salário Base'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-xs flex gap-2 items-center">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Cargo */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase">Cargo / Função</label>
                <SearchableSelect
                  options={[
                    { value: '', label: 'Selecione o cargo...' },
                    ...cargos.map((cargo) => ({ value: cargo.id, label: cargo.nome })),
                  ]}
                  value={formCargo}
                  onChange={setFormCargo}
                  placeholder="Selecione o cargo..."
                  disabled={selectedSalario !== null}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* UF */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase">Região / UF</label>
                  <SearchableSelect
                    options={UF_OPTIONS.map((uf) => ({ value: uf, label: uf }))}
                    value={formUf}
                    onChange={setFormUf}
                    placeholder="UF"
                    disabled={selectedSalario !== null}
                  />
                </div>

                {/* Ano */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase">Ano de Vigência</label>
                  <input
                    type="number"
                    value={formAno}
                    onChange={(e) => setFormAno(e.target.value)}
                    disabled={selectedSalario !== null}
                    min={2000}
                    max={2100}
                    required
                    className="w-full px-3.5 py-2.5 bg-neutral-55 dark:bg-neutral-950 text-xs border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-850 dark:text-neutral-200 focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Valor */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase">Salário Base (R$)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs text-neutral-400 font-semibold">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formValor}
                    onChange={(e) => setFormValor(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-neutral-55 dark:bg-neutral-950 text-xs border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-850 dark:text-neutral-200 focus:outline-none font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800 mt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Salvar Salário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Gestão de Cargos */}
      {showCargoModal && (
        <NovoCargoModal
          cargos={cargos}
          onClose={() => setShowCargoModal(false)}
          onCargoUpdated={() => {
            fetchCargos();
            fetchSalarios();
          }}
        />
      )}
    </div>
  );
}
