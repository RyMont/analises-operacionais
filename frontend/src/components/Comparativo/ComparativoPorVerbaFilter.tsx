import { useEffect, useState } from 'react';
import { Filter, RotateCcw, Search } from 'lucide-react';
import SearchableSelect from '../ui/searchable-select';

interface Option {
  value: string;
  label: string;
}

interface FiltroOpcoes {
  supervisores: string[];
  coordenadores: string[];
  ufs: string[];
  competencias: Option[];
  verbas?: Option[];
}

interface LojaRef {
  id: string | number;
  nome_referencia: string;
}

export interface FiltrosPorVerbaDados {
  periodo: string;
  loja: string;
  supervisor: string;
  coordenador: string;
  uf: string;
  verba: string;
}

interface ComparativoPorVerbaFilterProps {
  filtros: FiltrosPorVerbaDados;
  onApplyFilters: (novosFiltros: FiltrosPorVerbaDados) => void;
  lojasOpcoes: LojaRef[];
  opcoesFiltros: FiltroOpcoes;
  loadingFiltros: boolean;
  onClear: () => void;
}

/**
 * Painel de Filtros para a visão 'Por Verba' do Raio-X.
 * 
 * Por que existe: Segue a estrutura visual do painel de filtros do Turnover,
 * contendo Competência, Loja Física, Coordenador, Supervisor, UF e Verba/Rubrica
 * (carregada diretamente da base de verbas), sem campos de motivos nem busca por nome.
 */
export default function ComparativoPorVerbaFilter({
  filtros,
  onApplyFilters,
  lojasOpcoes,
  opcoesFiltros,
  loadingFiltros,
  onClear,
}: ComparativoPorVerbaFilterProps) {
  // Estados locais temporários para digitação/seleção do usuário antes de clicar em aplicar
  const [tempPeriodo, setTempPeriodo] = useState(filtros.periodo);
  const [tempLoja, setTempLoja] = useState(filtros.loja);
  const [tempSupervisor, setTempSupervisor] = useState(filtros.supervisor);
  const [tempCoordenador, setTempCoordenador] = useState(filtros.coordenador);
  const [tempUf, setTempUf] = useState(filtros.uf);
  const [tempVerba, setTempVerba] = useState(filtros.verba);

  // Sincroniza os estados temporários com as propriedades recebidas do pai
  useEffect(() => {
    setTempPeriodo(filtros.periodo);
    setTempLoja(filtros.loja);
    setTempSupervisor(filtros.supervisor);
    setTempCoordenador(filtros.coordenador);
    setTempUf(filtros.uf);
    setTempVerba(filtros.verba);
  }, [filtros]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyFilters({
      periodo: tempPeriodo,
      loja: tempLoja,
      supervisor: tempSupervisor,
      coordenador: tempCoordenador,
      uf: tempUf,
      verba: tempVerba,
    });
  };

  const handleLimpar = () => {
    onClear();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <h2 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-primary" />
          Filtros por Verba
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Competência (Mês/Ano) */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-neutral-500 uppercase">
            Mês de Referência
          </label>
          {loadingFiltros ? (
            <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
          ) : (
            <SearchableSelect
              options={[
                { value: '', label: 'Todas as Competências' },
                ...(opcoesFiltros.competencias || []),
              ]}
              value={tempPeriodo}
              onChange={setTempPeriodo}
              placeholder="Todas as competências..."
              multiple={true}
            />
          )}
        </div>

        {/* Loja Física */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-neutral-500 uppercase">
            Loja Física
          </label>
          {loadingFiltros ? (
            <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
          ) : (
            <SearchableSelect
              options={[
                { value: '', label: 'Todas as Lojas' },
                ...lojasOpcoes.map((l) => ({
                  value: String(l.id),
                  label: l.nome_referencia,
                })),
              ]}
              value={tempLoja}
              onChange={setTempLoja}
              placeholder="Todas as lojas..."
              multiple={true}
            />
          )}
        </div>

        {/* Coordenador */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-neutral-500 uppercase">
            Coordenador
          </label>
          {loadingFiltros ? (
            <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
          ) : (
            <SearchableSelect
              options={[
                { value: '', label: 'Todos os Coordenadores' },
                ...(opcoesFiltros.coordenadores || []).map((c) => ({
                  value: c,
                  label: c === 'null' ? '(Sem Coordenador)' : c,
                })),
              ]}
              value={tempCoordenador}
              onChange={setTempCoordenador}
              placeholder="Todos..."
              multiple={true}
            />
          )}
        </div>

        {/* Supervisor */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-neutral-500 uppercase">
            Supervisor
          </label>
          {loadingFiltros ? (
            <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
          ) : (
            <SearchableSelect
              options={[
                { value: '', label: 'Todos os Supervisores' },
                ...(opcoesFiltros.supervisores || []).map((s) => ({
                  value: s,
                  label: s === 'null' ? '(Sem Supervisor)' : s,
                })),
              ]}
              value={tempSupervisor}
              onChange={setTempSupervisor}
              placeholder="Todos..."
              multiple={true}
            />
          )}
        </div>

        {/* UF */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-neutral-500 uppercase">
            UF
          </label>
          {loadingFiltros ? (
            <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
          ) : (
            <SearchableSelect
              options={[
                { value: '', label: 'Todas as UFs' },
                ...(opcoesFiltros.ufs || []).map((u) => ({
                  value: u,
                  label: u === 'null' ? '(N/A)' : u,
                })),
              ]}
              value={tempUf}
              onChange={setTempUf}
              placeholder="Todas..."
              multiple={true}
            />
          )}
        </div>

        {/* Verba / Rubrica da Base de Verbas */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-neutral-500 uppercase">
            Verba / Rubrica
          </label>
          {loadingFiltros ? (
            <div className="h-9 bg-neutral-100 dark:bg-neutral-800 animate-pulse rounded-lg" />
          ) : (
            <SearchableSelect
              options={[
                { value: '', label: 'Todas as Verbas' },
                ...(opcoesFiltros.verbas || []),
              ]}
              value={tempVerba}
              onChange={setTempVerba}
              placeholder="Todas as verbas..."
              multiple={true}
            />
          )}
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="flex justify-end gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800 items-center">
        <button
          type="button"
          onClick={handleLimpar}
          className="flex items-center gap-1.5 px-4 py-2 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-full text-xs font-bold text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5 text-neutral-400" />
          Limpar Filtros
        </button>
        <button
          type="submit"
          className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white hover:bg-primary/90 rounded-full text-xs font-bold shadow-xs transition-colors cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" />
          Aplicar Filtros
        </button>
      </div>
    </form>
  );
}
