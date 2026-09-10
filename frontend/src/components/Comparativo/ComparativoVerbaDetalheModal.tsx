import { useEffect, useState, useRef, useMemo } from 'react';
import { X, Building2, Users, Search, Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../utils/formatters';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface LojaDetalhe {
  loja_id: number;
  loja_nome: string;
  uf: string;
  coordenador: string;
  supervisor: string;
  total_valor: number;
  qtd_colaboradores: number;
  qtd_linhas: number;
}

interface ColaboradorDetalhe {
  matricula: string;
  nome: string;
  loja_nome: string;
  total_valor: number;
  qtd_linhas: number;
}

interface DetalheVerbaData {
  codigo: string;
  descricao: string;
  lojas: LojaDetalhe[];
  colaboradores: ColaboradorDetalhe[];
}

interface ComparativoVerbaDetalheModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigoVerba: string;
  descricaoVerba: string;
  paramsFiltro: Record<string, string>;
}

/**
 * Modal para exibição detalhada de uma verba selecionada no Raio-X.
 * Permite visualizar tanto as filiais físicas quanto os colaboradores que receberam a rubrica.
 */
export default function ComparativoVerbaDetalheModal({
  isOpen,
  onClose,
  codigoVerba,
  descricaoVerba,
  paramsFiltro
}: ComparativoVerbaDetalheModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  const [activeTab, setActiveTab] = useState<'lojas' | 'colaboradores'>('lojas');
  const [data, setData] = useState<DetalheVerbaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [buscaModal, setBuscaModal] = useState('');

  useEffect(() => {
    if (!isOpen || !codigoVerba) return;

    const fetchDetalhes = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const queryParams = new URLSearchParams(paramsFiltro);
        queryParams.set('codigo', codigoVerba);

        const response = await api.get(`/comparativo/por-verba/detalhes/?${queryParams.toString()}`);
        setData(response.data);
      } catch (err) {
        console.error('Erro ao buscar detalhes da verba:', err);
        setErrorMsg('Não foi possível carregar os detalhes da verba selecionada.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetalhes();
    setBuscaModal('');
  }, [isOpen, codigoVerba, paramsFiltro]);

  // Filtragem na aba ativa
  const lojasFiltradas = useMemo(() => {
    if (!data?.lojas) return [];
    if (!buscaModal.trim()) return data.lojas;
    const q = buscaModal.toLowerCase().trim();
    return data.lojas.filter(
      (l) =>
        l.loja_nome.toLowerCase().includes(q) ||
        l.coordenador.toLowerCase().includes(q) ||
        l.supervisor.toLowerCase().includes(q) ||
        l.uf.toLowerCase().includes(q)
    );
  }, [data?.lojas, buscaModal]);

  const colaboradoresFiltrados = useMemo(() => {
    if (!data?.colaboradores) return [];
    if (!buscaModal.trim()) return data.colaboradores;
    const q = buscaModal.toLowerCase().trim();
    return data.colaboradores.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.matricula.toLowerCase().includes(q) ||
        c.loja_nome.toLowerCase().includes(q)
    );
  }, [data?.colaboradores, buscaModal]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div
        ref={modalRef}
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-850 shrink-0">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 font-mono text-sm text-primary">
                {codigoVerba}
              </span>
              <span>{descricaoVerba || data?.descricao}</span>
            </h2>
            <p className="text-xs text-neutral-500 font-medium mt-0.5">
              Detalhamento de lançamento por filiais físicas e colaboradores
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Abas e Busca */}
        <div className="px-6 pt-4 border-b border-neutral-100 dark:border-neutral-850 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-4">
            <button
              onClick={() => {
                setActiveTab('lojas');
                setBuscaModal('');
              }}
              className={`pb-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === 'lojas'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Por Filial Física ({data?.lojas?.length || 0})
            </button>
            <button
              onClick={() => {
                setActiveTab('colaboradores');
                setBuscaModal('');
              }}
              className={`pb-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === 'colaboradores'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Users className="h-4 w-4" />
              Por Colaborador ({data?.colaboradores?.length || 0})
            </button>
          </div>

          <div className="relative w-full sm:w-64 pb-2">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 -mt-1" />
            <input
              type="text"
              placeholder={activeTab === 'lojas' ? 'Buscar loja, supervisor...' : 'Buscar nome, matrícula...'}
              value={buscaModal}
              onChange={(e) => setBuscaModal(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 rounded-full text-neutral-700 dark:text-neutral-300 focus:outline-hidden focus:border-primary"
            />
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-xs flex gap-2.5 items-center">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-neutral-400">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">Carregando detalhes da verba...</span>
            </div>
          ) : activeTab === 'lojas' ? (
            /* Tabela de Lojas */
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Loja Física</th>
                    <th className="p-3">UF</th>
                    <th className="p-3">Coordenador</th>
                    <th className="p-3">Supervisor</th>
                    <th className="p-3 text-center">Colaboradores</th>
                    <th className="p-3 text-right">Valor Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium">
                  {lojasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-neutral-400 italic">
                        Nenhuma filial encontrada para os critérios selecionados.
                      </td>
                    </tr>
                  ) : (
                    lojasFiltradas.map((l) => (
                      <tr key={l.loja_id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                        <td className="p-3 font-semibold text-neutral-900 dark:text-neutral-100">{l.loja_nome}</td>
                        <td className="p-3">{l.uf}</td>
                        <td className="p-3">{l.coordenador}</td>
                        <td className="p-3">{l.supervisor}</td>
                        <td className="p-3 text-center font-mono">{l.qtd_colaboradores}</td>
                        <td className="p-3 text-right font-mono font-bold text-neutral-900 dark:text-neutral-100">
                          {formatCurrency(l.total_valor)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* Tabela de Colaboradores */
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3 w-28">Matrícula</th>
                    <th className="p-3">Nome do Colaborador</th>
                    <th className="p-3">Loja Física</th>
                    <th className="p-3 text-center">Lançamentos</th>
                    <th className="p-3 text-right">Valor Recebido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium">
                  {colaboradoresFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-neutral-400 italic">
                        Nenhum colaborador encontrado para os critérios selecionados.
                      </td>
                    </tr>
                  ) : (
                    colaboradoresFiltrados.map((c) => (
                      <tr key={c.matricula} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-primary">{c.matricula}</td>
                        <td className="p-3 font-semibold text-neutral-900 dark:text-neutral-100">{c.nome}</td>
                        <td className="p-3 text-neutral-500">{c.loja_nome}</td>
                        <td className="p-3 text-center font-mono">{c.qtd_linhas}</td>
                        <td className="p-3 text-right font-mono font-bold text-neutral-900 dark:text-neutral-100">
                          {formatCurrency(c.total_valor)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
