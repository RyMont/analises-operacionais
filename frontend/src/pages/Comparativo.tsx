import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import api, { getBackendPort } from '../api/client';
import ComparativoFilter from '../components/Comparativo/ComparativoFilter';
import ComparativoTable, { type ComparativoLinhaData } from '../components/Comparativo/ComparativoTable';
import ComparativoKPIs from '../components/Comparativo/ComparativoKPIs';
import ComparativoCharts from '../components/Comparativo/ComparativoCharts';
import ComparativoDetalheModal from '../components/Comparativo/ComparativoDetalheModal';

interface LojaRef {
  id: string;
  nome_referencia: string;
}

interface FiltrosDados {
  periodo: string;
  loja: string;
  supervisor: string;
  coordenador: string;
  uf: string;
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
}

/**
 * Página de Comparativo de Custos Orçado vs Real (Raio-X).
 * 
 * Por que existe: Gerencia a análise integrada e auditoria de despesas.
 * Centraliza KPIs financeiros consolidando estimativas contra folha,
 * gráficos do BI, filtros reativos e a listagem de filiais com paginação.
 */
export default function Comparativo() {
  const [lojasOpcoes, setLojasOpcoes] = useState<LojaRef[]>([]);
  
  // Opções para preencher os filtros (coletadas do pai)
  const [opcoesFiltros, setOpcoesFiltros] = useState<FiltroOpcoes>({
    supervisores: [],
    coordenadores: [],
    ufs: [],
    competencias: []
  });
  const [loadingFiltros, setLoadingFiltros] = useState(true);

  // Estados dos filtros oficiais (aplicados apenas no clique do botão Buscar)
  const [filtros, setFiltros] = useState<FiltrosDados>({
    periodo: '',
    loja: '',
    supervisor: '',
    coordenador: '',
    uf: ''
  });

  // Estados de dados da API paginada
  const [resultados, setResultados] = useState<ComparativoLinhaData[]>([]);
  const [kpis, setKpis] = useState({
    orcado_total: 0,
    realizado_total: 0,
    desvio_total: 0
  });
  const [graficos, setGraficos] = useState({
    mensal: [] as { mes: string; orcado: number; realizado: number; desvio: number }[],
    coordenador: [] as { coordenador: string; desvio: number }[],
    uf: [] as { uf: string; desvio: number }[]
  });

  // Paginação e UI
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingData, setLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados do Modal de Detalhes de uma Filial
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    lojaId: 0,
    lojaNome: '',
    competencia: '',
    competenciaLabel: ''
  });

  // Busca lojas físicas e opções de filtros em paralelo na carga inicial
  useEffect(() => {
    const carregarDadosIniciais = async () => {
      try {
        const [resLojas, resFiltros] = await Promise.all([
          api.get('/lojas/', { params: { sem_paginacao: 'true', status: 'ATIVA' } }),
          api.get('/comparativo/filtro-opcoes/')
        ]);

        if (resLojas.data) {
          setLojasOpcoes(resLojas.data.results || resLojas.data || []);
        }

        if (resFiltros.data) {
          setOpcoesFiltros(resFiltros.data);
          const comps = resFiltros.data.competencias || [];
          // Pré-seleciona a competência mais recente de imediato no estado pai
          if (comps.length > 0) {
            setFiltros({
              periodo: comps[0].value,
              loja: '',
              supervisor: '',
              coordenador: '',
              uf: ''
            });
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados iniciais:', err);
        setErrorMsg('Erro ao carregar a listagem de lojas físicas e opções de filtros.');
      } finally {
        setLoadingFiltros(false);
      }
    };
    carregarDadosIniciais();
  }, []);



  // Recarrega os dados agregados e a tabela ao alterar os filtros aplicados ou a paginação
  useEffect(() => {
    // IMPORTANTE: Bloqueia a primeira busca vazia (race condition) até carregar os filtros padrão.
    if (loadingFiltros) return;

    const fetchComparativoData = async () => {
      setLoadingData(true);
      setErrorMsg(null);
      try {
        const params = new URLSearchParams();
        params.append('page', String(currentPage));

        if (filtros.periodo) params.append('period', filtros.periodo);
        if (filtros.loja) params.append('loja', filtros.loja);
        if (filtros.supervisor) params.append('supervisor', filtros.supervisor);
        if (filtros.coordenador) params.append('coordenador', filtros.coordenador);
        if (filtros.uf) params.append('uf', filtros.uf);

        const response = await api.get(`/comparativo/relatorio/?${params.toString()}`);
        if (response.data) {
          const results = response.data.results || {};
          setResultados(results.resultados || []);
          setKpis(results.kpis || { orcado_total: 0, realizado_total: 0, desvio_total: 0 });
          setGraficos(results.graficos || { mensal: [], coordenador: [], uf: [] });
          
          const count = response.data.count || 0;
          setTotalPages(Math.ceil(count / 20) || 1);
        }
      } catch (err) {
        console.error('Erro ao buscar comparativo consolidado:', err);
        setErrorMsg('Erro ao calcular as estimativas e processar os dados da folha.');
      } finally {
        setLoadingData(false);
      }
    };

    fetchComparativoData();
  }, [currentPage, filtros, loadingFiltros]);

  // Handler para aplicar filtros (disparado pelo clique no botão Aplicar Filtros)
  const handleApplyFilters = (novosFiltros: FiltrosDados) => {
    setFiltros(novosFiltros);
    setCurrentPage(1);
  };

  const handleLimparFiltros = () => {
    // Redefine para a última competência disponível (como no Turnover) para evitar carregar volume excessivo de dados
    const ultimoPeriodo = opcoesFiltros.competencias[0]?.value || '';
    setFiltros({
      periodo: ultimoPeriodo,
      loja: '',
      supervisor: '',
      coordenador: '',
      uf: ''
    });
    setCurrentPage(1);
  };

  // Handler para clicar num coordenador ou UF nos gráficos e aplicar como filtro na tabela (alternando a seleção se clicar no mesmo)
  const handleSetFiltroCoordenador = (nome: string) => {
    setFiltros(prev => ({ 
      ...prev, 
      coordenador: prev.coordenador === nome ? '' : nome 
    }));
    setCurrentPage(1);
  };

  const handleSetFiltroUf = (sigla: string) => {
    setFiltros(prev => ({ 
      ...prev, 
      uf: prev.uf === sigla ? '' : sigla 
    }));
    setCurrentPage(1);
  };

  const handleVerDetalhes = (lojaId: number, lojaNome: string, competencia: string, competenciaLabel: string) => {
    setDetailModal({
      isOpen: true,
      lojaId,
      lojaNome,
      competencia,
      competenciaLabel
    });
  };

  const handleCloseDetailModal = () => {
    setDetailModal(prev => ({ ...prev, isOpen: false }));
  };

  // Handler para exportação em lote para Excel (.xlsx)
  const handleExportarExcel = () => {
    const params = new URLSearchParams();
    if (filtros.periodo) params.append('period', filtros.periodo);
    if (filtros.loja) params.append('loja', filtros.loja);
    if (filtros.supervisor) params.append('supervisor', filtros.supervisor);
    if (filtros.coordenador) params.append('coordenador', filtros.coordenador);
    if (filtros.uf) params.append('uf', filtros.uf);

    // Utiliza o hostname dinâmico do navegador para garantir funcionamento em rede local e produção
    const url = `http://${window.location.hostname}:${getBackendPort()}/comparativo/relatorio/exportar/?${params.toString()}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Raio-X (Comparativo de Custos)</h1>
        <p className="text-sm text-neutral-500 font-medium">Análise consolidada de custos orçados pelo escopo contra os dados reais da folha de pagamento</p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm flex gap-3 items-center">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Seção de Filtros */}
      <ComparativoFilter
        filtros={filtros}
        onApplyFilters={handleApplyFilters}
        lojasOpcoes={lojasOpcoes}
        opcoesFiltros={opcoesFiltros}
        loadingFiltros={loadingFiltros}
        onClear={handleLimparFiltros}
      />

      {/* Relatório e Gráficos */}
      <main className="space-y-6">
        {/* KPIs */}
        <ComparativoKPIs kpis={kpis} loadingData={loadingData} />

        {/* Gráficos de Evolução, Coordenador e UF */}
        <ComparativoCharts
          loadingData={loadingData}
          graficos={graficos}
          setFiltroCoordenador={handleSetFiltroCoordenador}
          setFiltroUf={handleSetFiltroUf}
          setCurrentPage={setCurrentPage}
        />

        {/* Tabela de Dados Paginada */}
        <ComparativoTable
          resultados={resultados}
          loading={loadingData}
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
          onVerDetalhes={handleVerDetalhes}
          onExportarExcel={handleExportarExcel}
        />
      </main>

      {/* Modal de Detalhes do Custo da Loja */}
      <ComparativoDetalheModal
        isOpen={detailModal.isOpen}
        onClose={handleCloseDetailModal}
        lojaId={detailModal.lojaId}
        lojaNome={detailModal.lojaNome}
        competencia={detailModal.competencia}
        competenciaLabel={detailModal.competenciaLabel}
      />
    </div>
  );
}
