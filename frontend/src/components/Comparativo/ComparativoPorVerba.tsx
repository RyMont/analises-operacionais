import { useEffect, useState, useRef, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import api, { getBackendPort } from '../../api/client';
import ComparativoPorVerbaFilter, { type FiltrosPorVerbaDados } from './ComparativoPorVerbaFilter';
import ComparativoPorVerbaKPIs, { type VerbaKPIsData } from './ComparativoPorVerbaKPIs';
import ComparativoPorVerbaCharts from './ComparativoPorVerbaCharts';
import ComparativoPorVerbaTable, { type VerbaResultadoItem } from './ComparativoPorVerbaTable';
import ComparativoVerbaDetalheModal from './ComparativoVerbaDetalheModal';

interface LojaRef {
  id: string | number;
  nome_referencia: string;
}

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

interface ComparativoPorVerbaProps {
  lojasOpcoes: LojaRef[];
  opcoesFiltros: FiltroOpcoes;
  loadingFiltros: boolean;
}

/**
 * Componente principal da aba 'Por Verba' do Raio-X.
 * Orquestra os filtros, KPIs, gráficos analíticos, tabela de verbas e modal de detalhamento.
 */
export default function ComparativoPorVerba({
  lojasOpcoes,
  opcoesFiltros,
  loadingFiltros
}: ComparativoPorVerbaProps) {
  // Filtros aplicados oficialmente
  const [filtros, setFiltros] = useState<FiltrosPorVerbaDados>({
    periodo: '',
    loja: '',
    supervisor: '',
    coordenador: '',
    uf: '',
    verba: ''
  });

  // Inicializa com a última competência disponível
  useEffect(() => {
    if (opcoesFiltros.competencias && opcoesFiltros.competencias.length > 0 && !filtros.periodo) {
      setFiltros((prev) => ({
        ...prev,
        periodo: opcoesFiltros.competencias[0].value
      }));
    }
  }, [opcoesFiltros]);

  // Estados de dados da API
  const [kpis, setKpis] = useState<VerbaKPIsData>({
    total_realizado: 0,
    total_verbas: 0,
    total_colaboradores: 0,
    total_lancamentos: 0,
    maior_verba: null
  });

  const [topVerbas, setTopVerbas] = useState<any[]>([]);
  const [topLojas, setTopLojas] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [resultados, setResultados] = useState<VerbaResultadoItem[]>([]);

  const [loadingData, setLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal de Detalhes da Verba
  const [modalDetalhe, setModalDetalhe] = useState<{
    isOpen: boolean;
    codigo: string;
    descricao: string;
  }>({
    isOpen: false,
    codigo: '',
    descricao: ''
  });

  const lastQueryId = useRef(0);

  // Busca dados analíticos por verba ao alterar os filtros
  useEffect(() => {
    if (loadingFiltros) return;

    const fetchPorVerbaData = async () => {
      setLoadingData(true);
      setErrorMsg(null);
      const queryId = ++lastQueryId.current;

      try {
        const params = new URLSearchParams();
        if (filtros.periodo) params.append('period', filtros.periodo);
        if (filtros.loja) params.append('loja', filtros.loja);
        if (filtros.supervisor) params.append('supervisor', filtros.supervisor);
        if (filtros.coordenador) params.append('coordenador', filtros.coordenador);
        if (filtros.uf) params.append('uf', filtros.uf);
        if (filtros.verba) params.append('verba', filtros.verba);

        const response = await api.get(`/comparativo/por-verba/?${params.toString()}`);

        if (queryId !== lastQueryId.current) return;

        if (response.data) {
          setKpis(response.data.kpis || {
            total_realizado: 0,
            total_verbas: 0,
            total_colaboradores: 0,
            total_lancamentos: 0,
            maior_verba: null
          });
          setTopVerbas(response.data.graficos?.top_verbas || []);
          setTopLojas(response.data.graficos?.top_lojas || []);
          setCategorias(response.data.graficos?.categorias || []);
          setResultados(response.data.resultados || []);
        }
      } catch (err) {
        if (queryId !== lastQueryId.current) return;
        console.error('Erro ao buscar dados do Raio-X por verba:', err);
        setErrorMsg('Não foi possível carregar a análise de custos por verba.');
      } finally {
        if (queryId === lastQueryId.current) {
          setLoadingData(false);
        }
      }
    };

    fetchPorVerbaData();
  }, [filtros, loadingFiltros]);

  const handleApplyFilters = (novosFiltros: FiltrosPorVerbaDados) => {
    setFiltros(novosFiltros);
  };

  const handleLimparFiltros = () => {
    const ultimoPeriodo = opcoesFiltros.competencias[0]?.value || '';
    setFiltros({
      periodo: ultimoPeriodo,
      loja: '',
      supervisor: '',
      coordenador: '',
      uf: '',
      verba: ''
    });
  };

  const handleVerDetalhes = (codigo: string, descricao: string) => {
    setModalDetalhe({
      isOpen: true,
      codigo,
      descricao
    });
  };

  const handleExportarExcel = () => {
    const params = new URLSearchParams();
    if (filtros.periodo) params.append('period', filtros.periodo);
    if (filtros.loja) params.append('loja', filtros.loja);
    if (filtros.supervisor) params.append('supervisor', filtros.supervisor);
    if (filtros.coordenador) params.append('coordenador', filtros.coordenador);
    if (filtros.uf) params.append('uf', filtros.uf);
    if (filtros.verba) params.append('verba', filtros.verba);

    const url = `http://${window.location.hostname}:${getBackendPort()}/comparativo/por-verba/exportar/?${params.toString()}`;
    window.open(url, '_blank');
  };

  // Prepara parâmetros para passar ao modal de detalhes
  const paramsFiltroModal: Record<string, string> = {};
  if (filtros.periodo) paramsFiltroModal.period = filtros.periodo;
  if (filtros.loja) paramsFiltroModal.loja = filtros.loja;
  if (filtros.supervisor) paramsFiltroModal.supervisor = filtros.supervisor;
  if (filtros.coordenador) paramsFiltroModal.coordenador = filtros.coordenador;
  if (filtros.uf) paramsFiltroModal.uf = filtros.uf;

  // Identifica o nome da verba selecionada para exibir no título do gráfico
  const verbaNomeSelecionada = useMemo(() => {
    if (!filtros.verba) return '';
    const codigos = filtros.verba.split(',').map((c) => c.trim()).filter(Boolean);
    if (codigos.length === 1) {
      const opcao = opcoesFiltros.verbas?.find((v) => v.value === codigos[0]);
      if (opcao) return opcao.label;
      const res = resultados.find((r) => r.codigo === codigos[0]);
      if (res) return `${res.codigo} — ${res.descricao}`;
      return `Verba ${codigos[0]}`;
    }
    return `${codigos.length} Verbas Selecionadas`;
  }, [filtros.verba, opcoesFiltros.verbas, resultados]);

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-sm flex gap-3 items-center">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 1. Painel de Filtros estilo Turnover (sem motivos e sem nome) */}
      <ComparativoPorVerbaFilter
        filtros={filtros}
        onApplyFilters={handleApplyFilters}
        lojasOpcoes={lojasOpcoes}
        opcoesFiltros={opcoesFiltros}
        loadingFiltros={loadingFiltros}
        onClear={handleLimparFiltros}
      />

      {/* 2. KPIs de Verbas */}
      <ComparativoPorVerbaKPIs kpis={kpis} loading={loadingData} />

      {/* 3. Gráficos Analíticos: Lojas (no topo), Top 10 e Categorias */}
      <ComparativoPorVerbaCharts
        loading={loadingData}
        topVerbas={topVerbas}
        topLojas={topLojas}
        categorias={categorias}
        verbaNome={verbaNomeSelecionada}
        onSelectVerba={(cod) => {
          const item = resultados.find((r) => r.codigo === cod);
          handleVerDetalhes(cod, item ? item.descricao : '');
        }}
      />

      {/* 4. Tabela de Detalhamento por Verba */}
      <ComparativoPorVerbaTable
        resultados={resultados}
        loading={loadingData}
        onVerDetalhes={handleVerDetalhes}
        onExportarExcel={handleExportarExcel}
      />

      {/* 5. Modal de Detalhes da Verba por Loja e por Colaborador */}
      <ComparativoVerbaDetalheModal
        isOpen={modalDetalhe.isOpen}
        onClose={() => setModalDetalhe((prev) => ({ ...prev, isOpen: false }))}
        codigoVerba={modalDetalhe.codigo}
        descricaoVerba={modalDetalhe.descricao}
        paramsFiltro={paramsFiltroModal}
      />
    </div>
  );
}
