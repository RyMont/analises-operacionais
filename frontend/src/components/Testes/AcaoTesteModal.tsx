import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Loader2, 
  AlertCircle, 
  Copy, 
  Check, 
  UserCheck, 
  AlertTriangle,
  History,
  Info,
  Play,
  CheckCircle2,
  XCircle,
  Edit,
  CalendarDays
} from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import { formatDate, obterInfoFolhas } from '../../utils/formatters';
import { copyTextToClipboard } from '../../utils/clipboard';
import type { TestePromocaoItem } from '../../pages/TestesPromocao';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';
import AlterarDataInicioModal from './AlterarDataInicioModal';

interface AcaoTesteModalProps {
  teste: TestePromocaoItem;
  onClose: () => void;
  onSaveSuccess: () => void;
}

interface AusenciasInfo {
  faltas: number;
  atestados: number;
  detalhes: any[];
}

/**
 * Modal de Acompanhamento Mensal e Tomada de Decisão do Teste de Promoção.
 * 
 * Por que existe: Permite que analistas de gestão aprovem solicitações pendentes,
 * visualizem o histórico de ausências de 1 ano do ponto em tempo real, copiem mensagens formatadas
 * para coordenadores fora do sistema e registrem decisões mensais de acordo com o mês de andamento.
 */
export default function AcaoTesteModal({ teste, onClose, onSaveSuccess }: AcaoTesteModalProps) {
  const [activeTab, setActiveTab] = useState<'controle' | 'ausencias' | 'historico'>('controle');
  const [testeAtual, setTesteAtual] = useState<TestePromocaoItem>(teste);
  const [showAlterarDataModal, setShowAlterarDataModal] = useState(false);
  
  useEffect(() => {
    setTesteAtual(teste);
  }, [teste]);

  // Ausências (GeoVictoria)
  const [ausencias, setAusencias] = useState<AusenciasInfo | null>(null);
  const [loadingAusencias, setLoadingAusencias] = useState(false);
  const [errorAusencias, setErrorAusencias] = useState<string | null>(null);

  // Form de Decisão Mensal
  const [respostaSupervisor, setRespostaSupervisor] = useState<'pagar_premio' | 'promover' | 'cancelar' | 'pagar_premio_cancelar' | ''>('');
  const [observacao, setObservacao] = useState('');
  const [editandoResposta, setEditandoResposta] = useState(false);

  // Ações de execução
  const [executing, setExecuting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingCopy, setLoadingCopy] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  /**
   * Monitora a aba ativa e carrega as ausências do colaborador sob demanda.
   * 
   * Por que existe: Evita requisições automáticas desnecessárias na montagem do modal,
   * buscando dados da GeoVictoria apenas quando o usuário navegar para a aba de ausências.
   */
  useEffect(() => {
    if (activeTab === 'ausencias' && !ausencias && !loadingAusencias) {
      fetchAusencias();
    }
  }, [activeTab, teste.id]);



  /**
   * Busca dados de ausências (faltas/atestados) do colaborador no backend.
   * 
   * Por que existe: Integra-se com a API para coletar o histórico do último ano.
   * Retorna os dados buscados para que outras funções (como a cópia de mensagens)
   * possam consumi-los imediatamente após a resolução da Promise.
   */
  const fetchAusencias = async (): Promise<AusenciasInfo | null> => {
    setLoadingAusencias(true);
    setErrorAusencias(null);
    try {
      const response = await api.get(`/colaboradores/testes/${teste.id}/ausencias/`);
      setAusencias(response.data);
      return response.data;
    } catch (err: any) {
      console.error('Erro ao carregar ausências do teste:', err);
      setErrorAusencias(err.response?.data?.error || 'Erro ao carregar dados do relógio de ponto.');
      return null;
    } finally {
      setLoadingAusencias(false);
    }
  };

  const handleAprovar = async () => {
    setExecuting(true);
    try {
      await api.post(`/colaboradores/testes/${teste.id}/aprovar/`);
      toast.success('Solicitação aprovada e ativada com sucesso!');
      onSaveSuccess();
    } catch (err: any) {
      console.error('Erro ao aprovar teste:', err);
      toast.error(err.response?.data?.error || 'Erro ao aprovar teste.');
    } finally {
      setExecuting(false);
    }
  };

  /**
   * Copia os dados formatados da solicitação para enviar ao coordenador.
   * 
   * Por que existe: Caso os dados de ausências ainda não estejam carregados na tela,
   * ele faz a busca na API no momento do clique, evitando que o usuário precise trocar
   * de aba para obter as faltas e atestados antes de copiar.
   */
  const handleCopiarDados = async () => {
    let dadosAusencias = ausencias;

    if (!dadosAusencias) {
      setLoadingCopy(true);
      dadosAusencias = await fetchAusencias();
      setLoadingCopy(false);

      if (!dadosAusencias) {
        toast.error('Não foi possível carregar os dados de ausências para copiar.');
        return;
      }
    }

    const faltasCount = dadosAusencias.faltas;
    const atestadosCount = dadosAusencias.atestados;

    const texto = `Solicitação de Teste de Promoção:
- Colaborador: ${testeAtual.colaborador_nome} (RE ${testeAtual.colaborador_re})
- Cargo Atual: ${testeAtual.colaborador_cargo}
- Cargo em Teste: ${testeAtual.cargo_teste || '-'}
- Loja: ${testeAtual.loja_nome}
- Supervisão: ${testeAtual.supervisor_nome}
- Admissão: ${formatDate(testeAtual.colaborador_admissao)}
- Início do Teste: ${formatDate(testeAtual.data_inicio)}
- Ausências (último ano): ${faltasCount} faltas e ${atestadosCount} atestados.

Por favor, verifique se aprova o início do teste de promoção para este colaborador.`;

    const copiou = await copyTextToClipboard(texto);
    if (copiou) {
      setCopied(true);
      toast.success('Dados da solicitação copiados para a área de transferência!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Erro ao copiar informações.');
    }
  };

  // Determinar o mês atual do teste
  const getMesAtualNum = () => {
    const premios = testeAtual.historico_acoes.filter(a => a.acao === 'pagar_premio' || a.acao === 'pagar_premio_cancelar').length;
    return premios + 1;
  };

  const mesAtual = getMesAtualNum();

  // Verifica se já existe resposta do supervisor registrada para o mês atual
  const respostaSupervisorReg = testeAtual.historico_acoes.find(
    a => a.acao === 'registrar_resposta' && a.mes_referencia === mesAtual
  );

  // Por que existe: Pré-seleciona a opção de Pagar Prêmio como padrão no primeiro mês de teste,
  // permitindo que o supervisor decida alternar para Pagar Prêmio e Cancelar caso necessário.
  useEffect(() => {
    if (testeAtual.status === 'ativo' && !respostaSupervisorReg && mesAtual === 1) {
      setRespostaSupervisor('pagar_premio');
    }
  }, [testeAtual.id, mesAtual, respostaSupervisorReg]);

  // Por que existe: Garante que o estado de edição da resposta seja reiniciado
  // quando o usuário alternar entre diferentes testes no modal.
  useEffect(() => {
    setEditandoResposta(false);
  }, [testeAtual.id]);

  const iniciarEdicao = () => {
    if (respostaSupervisorReg) {
      setRespostaSupervisor(respostaSupervisorReg.resposta_supervisor as any);
      setObservacao(respostaSupervisorReg.observacao || '');
      setEditandoResposta(true);
    }
  };

  const cancelarEdicao = () => {
    setRespostaSupervisor('');
    setObservacao('');
    setEditandoResposta(false);
  };

  const handleRegistrarRespostaSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    const decisao = mesAtual === 1 
      ? (respostaSupervisor === 'pagar_premio_cancelar' ? 'pagar_premio_cancelar' : 'pagar_premio') 
      : respostaSupervisor;

    if (!decisao) {
      toast.error('Selecione uma resposta do supervisor para salvar.');
      return;
    }
    if (decisao !== 'pagar_premio' && !observacao.trim()) {
      toast.error('A observação é obrigatória para promover, cancelar ou pagar prêmio e cancelar o teste.');
      return;
    }

    setExecuting(true);
    try {
      await api.post(`/colaboradores/testes/${testeAtual.id}/registrar-acao/`, {
        acao: 'registrar_resposta',
        resposta_supervisor: decisao,
        observacao,
      });

      toast.success('Resposta do supervisor registrada com sucesso!');
      setRespostaSupervisor('');
      setObservacao('');
      setEditandoResposta(false);
      onSaveSuccess();
    } catch (err: any) {
      console.error('Erro ao registrar resposta do supervisor:', err);
      toast.error(err.response?.data?.error || 'Erro ao registrar resposta.');
    } finally {
      setExecuting(false);
    }
  };

  const handleConfirmarAcaoFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respostaSupervisorReg) return;

    setExecuting(true);
    try {
      await api.post(`/colaboradores/testes/${testeAtual.id}/registrar-acao/`, {
        acao: respostaSupervisorReg.resposta_supervisor,
        observacao: observacao.trim() || `Ação de ${respostaSupervisorReg.resposta_supervisor === 'pagar_premio' ? 'Pagar Prêmio' : respostaSupervisorReg.resposta_supervisor === 'promover' ? 'Promoção' : 'Cancelamento'} confirmada.`,
      });

      toast.success('Ação confirmada e registrada com sucesso!');
      setObservacao('');
      onSaveSuccess();
    } catch (err: any) {
      console.error('Erro ao confirmar ação final:', err);
      toast.error(err.response?.data?.error || 'Erro ao confirmar ação.');
    } finally {
      setExecuting(false);
    }
  };

  // Calcula as informações das folhas para os 4 meses de teste
  const folhas = obterInfoFolhas(testeAtual.data_inicio);
  const folhaAtual = folhas.find(f => f.mesRef === mesAtual);

  // Mapeia o status de cada mês baseado no histórico de ações do colaborador
  const obterStatusMes = (mesNum: number) => {
    const acoesMes = testeAtual.historico_acoes.filter(a => a.mes_referencia === mesNum);
    const acaoFinal = acoesMes.find(a => ['pagar_premio', 'promover', 'cancelar', 'pagar_premio_cancelar'].includes(a.acao));
    const acaoResposta = acoesMes.find(a => a.acao === 'registrar_resposta');

    if (acaoFinal) {
      if (acaoFinal.acao === 'pagar_premio') {
        return {
          status: 'pago',
          label: 'Prêmio Pago',
          sublabel: `Prorrogado em ${formatDate(acaoFinal.data_acao)} por ${acaoFinal.realizado_por}`,
          color: 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20'
        };
      }
      if (acaoFinal.acao === 'promover') {
        return {
          status: 'promovido',
          label: 'Promovido',
          sublabel: `Promovido em ${formatDate(acaoFinal.data_acao)} por ${acaoFinal.realizado_por}`,
          color: 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20'
        };
      }
      if (acaoFinal.acao === 'cancelar') {
        return {
          status: 'cancelado',
          label: 'Cancelado',
          sublabel: `Cancelado em ${formatDate(acaoFinal.data_acao)} por ${acaoFinal.realizado_por}`,
          color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20'
        };
      }
      if (acaoFinal.acao === 'pagar_premio_cancelar') {
        return {
          status: 'cancelado',
          label: 'Prêmio Pago & Cancelado',
          sublabel: `Cancelado com prêmio em ${formatDate(acaoFinal.data_acao)} por ${acaoFinal.realizado_por}`,
          color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20'
        };
      }
    }

    if (acaoResposta) {
      const respDisplay = acaoResposta.resposta_supervisor === 'pagar_premio' ? 'Pagar Prêmio' : 
                          acaoResposta.resposta_supervisor === 'promover' ? 'Promover' : 
                          acaoResposta.resposta_supervisor === 'pagar_premio_cancelar' ? 'Pagar Prêmio e Cancelar' : 'Cancelar';
      return {
        status: 'aguardando_acao',
        label: 'Aguardando Ação',
        sublabel: `Resp. Supervisor: ${respDisplay} (registrado por ${acaoResposta.realizado_por})`,
        color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20 animate-pulse'
      };
    }

    if (teste.status === 'promovido' || teste.status === 'cancelado') {
      return {
        status: 'nao_cursado',
        label: 'Não Cursado',
        sublabel: 'Finalizado antes deste ciclo',
        color: 'text-neutral-400 bg-neutral-100 dark:bg-neutral-850 border-neutral-200 dark:border-neutral-800'
      };
    }

    if (teste.status === 'pendente') {
      return {
        status: 'bloqueado',
        label: 'Aguardando Ativação',
        sublabel: 'Aprovação pendente',
        color: 'text-neutral-400 bg-neutral-100 dark:bg-neutral-850 border-neutral-200 dark:border-neutral-800'
      };
    }

    if (mesNum === mesAtual) {
      return {
        status: 'pendente',
        label: 'Aguardando Resposta',
        sublabel: 'Aguardando retorno do supervisor',
        color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20 animate-pulse'
      };
    }

    if (mesNum > mesAtual) {
      return {
        status: 'bloqueado',
        label: 'Bloqueado',
        sublabel: `Aguardando Mês ${mesNum - 1}`,
        color: 'text-neutral-400 bg-neutral-100 dark:bg-neutral-850 border-neutral-200 dark:border-neutral-800 opacity-60'
      };
    }

    return {
      status: 'pendente',
      label: 'Pendente',
      sublabel: 'Sem registro de ação',
      color: 'text-neutral-500 bg-neutral-100 dark:bg-neutral-850 border-neutral-200 dark:border-neutral-800'
    };
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
              Controle do Teste de Promoção
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 font-medium">
              {teste.colaborador_nome} (RE {teste.colaborador_re})
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 px-6 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('controle')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'controle'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            Ações e Decisões
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ausencias')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'ausencias'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            Ausências do Ponto
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('historico')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'historico'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            Histórico ({teste.historico_acoes.length})
          </button>
        </div>

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'controle' && (
            <div className="space-y-6">
              {/* Resumo Básico */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-200 dark:border-neutral-850 rounded-xl">
                <div>
                  <span className="block text-[10px] font-bold text-neutral-450 uppercase tracking-wider">Loja</span>
                  <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">{teste.loja_nome}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-neutral-450 uppercase tracking-wider">Supervisão</span>
                  <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">{teste.supervisor_nome}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-neutral-450 uppercase tracking-wider">Coordenador</span>
                  <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">{teste.coordenador_nome || '-'}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-neutral-450 uppercase tracking-wider">Data de Início</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">{formatDate(testeAtual.data_inicio)}</span>
                    <button
                      type="button"
                      onClick={() => setShowAlterarDataModal(true)}
                      title="Alterar Data de Início"
                      className="p-1 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-neutral-450 uppercase tracking-wider">Admissão</span>
                  <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">{formatDate(teste.colaborador_admissao)}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-neutral-450 uppercase tracking-wider">Cargo Atual</span>
                  <span className="text-sm font-semibold text-neutral-850 dark:text-neutral-200">{teste.colaborador_cargo}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-amber-550 dark:text-amber-400 uppercase tracking-wider">Cargo em Teste</span>
                  <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{teste.cargo_teste || '-'}</span>
                </div>
              </div>

              {/* Painel de Ciclos Mensais (Folha 20 a 19) */}
              {teste.status !== 'pendente' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Ciclos do Teste de Promoção</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {folhas.map((folha) => {
                      const infoMes = obterStatusMes(folha.mesRef);
                      return (
                        <div 
                          key={folha.mesRef} 
                          className={`p-4 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${infoMes.color}`}
                        >
                          <div>
                            <div className="flex justify-between items-start gap-1">
                              <span className="font-bold text-xs uppercase tracking-wider">Mês {folha.mesRef}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-900/10 dark:bg-white/10">
                                Folha {folha.nomeFolha}
                              </span>
                            </div>
                            <p className="text-[10px] opacity-75 font-medium mt-1">
                              Período: {folha.periodoStr}
                            </p>
                          </div>
                          
                          <div>
                            <div className="font-bold text-xs flex items-center gap-1">
                              {infoMes.status === 'pago' || infoMes.status === 'promovido' ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                              ) : infoMes.status === 'cancelado' ? (
                                <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                              ) : null}
                              {infoMes.label}
                            </div>
                            <p className="text-[9px] leading-snug mt-0.5 opacity-80">
                              {infoMes.sublabel}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Se status for PENDENTE */}
              {teste.status === 'pendente' && (
                <div className="space-y-6">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-350 rounded-xl text-xs flex gap-3 items-center">
                    <Info className="h-5 w-5 text-amber-500 shrink-0" />
                    <span>
                      Esta solicitação está <strong>Pendente de Aprovação</strong> do coordenador. 
                      Copie os dados da solicitação para enviar ao coordenador fora do sistema.
                    </span>
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="button"
                      disabled={loadingCopy}
                      onClick={handleCopiarDados}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 border border-neutral-300 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850/50 text-neutral-700 dark:text-neutral-300 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-50"
                    >
                      {loadingCopy ? (
                        <Loader2 className="h-4.5 w-4.5 animate-spin" />
                      ) : copied ? (
                        <Check className="h-4.5 w-4.5 text-green-500" />
                      ) : (
                        <Copy className="h-4.5 w-4.5" />
                      )}
                      {loadingCopy ? 'Carregando dados...' : copied ? 'Dados Copiados!' : 'Copiar Mensagem para Coordenador'}
                    </button>

                    <button
                      type="button"
                      onClick={handleAprovar}
                      disabled={executing}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl text-sm font-bold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all cursor-pointer"
                    >
                      {executing ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <UserCheck className="h-4.5 w-4.5" />}
                      Aprovar e Iniciar Teste (Ativar)
                    </button>
                  </div>
                </div>
              )}

              {/* Se status for ATIVO e NÃO TIVER resposta do supervisor OU se estiver no modo de edição */}
              {teste.status === 'ativo' && (!respostaSupervisorReg || editandoResposta) && (
                <form onSubmit={handleRegistrarRespostaSupervisor} className="space-y-5">
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 rounded-xl text-xs flex justify-between items-center animate-fade-in">
                    <div className="flex gap-2 items-center">
                      <Play className="h-4 w-4 text-blue-500 shrink-0" />
                      <span>
                        Etapa 1: Registrar Resposta do Supervisor para o <strong>Mês {mesAtual}</strong> (Folha <strong>{folhaAtual?.nomeFolha || '-'}</strong>).
                      </span>
                    </div>
                    <span className="font-bold uppercase tracking-wider text-[10px] bg-blue-500/25 px-2.5 py-1 rounded-full text-blue-700 dark:text-blue-300">
                      Supervisor: {teste.supervisor_nome}
                    </span>
                  </div>

                  {mesAtual === 1 && (
                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-xl text-xs space-y-2">
                      <div className="flex gap-2.5 items-center">
                        <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                        <span className="font-bold">Regras do Mês 1:</span>
                      </div>
                      <p className="leading-relaxed">
                        No primeiro mês de teste, a resposta do supervisor é por padrão pagar o prêmio para prorrogar. Não é permitido promover o colaborador. Caso precise cancelar o teste neste mês, utilize a opção <strong>Pagar Prêmio e Cancelar</strong>.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider block">Decisão do Supervisor *</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* Botão Pagar Prêmio */}
                      <button
                        type="button"
                        disabled={mesAtual === 4}
                        onClick={() => setRespostaSupervisor('pagar_premio')}
                        className={`py-3 px-4 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                          respostaSupervisor === 'pagar_premio'
                            ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-950'
                            : 'border-neutral-200 dark:border-neutral-850 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        Pagar Prêmio (Prorrogar)
                      </button>

                      {/* Botão Promover */}
                      <button
                        type="button"
                        disabled={mesAtual === 1}
                        onClick={() => setRespostaSupervisor('promover')}
                        className={`py-3 px-4 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                          respostaSupervisor === 'promover'
                            ? 'border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-600'
                            : 'border-neutral-200 dark:border-neutral-850 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-700 dark:text-neutral-300'
                        }`}
                        title={mesAtual === 1 ? "Não é permitido promover no primeiro mês de teste." : ""}
                      >
                        Promover
                      </button>

                      {/* Botão Pagar Prêmio e Cancelar */}
                      <button
                        type="button"
                        onClick={() => setRespostaSupervisor('pagar_premio_cancelar')}
                        className={`py-3 px-4 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                          respostaSupervisor === 'pagar_premio_cancelar'
                            ? 'border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-600'
                            : 'border-neutral-200 dark:border-neutral-850 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        Pagar Prêmio e Cancelar
                      </button>

                      {/* Botão Cancelar */}
                      <button
                        type="button"
                        disabled={mesAtual === 1}
                        onClick={() => setRespostaSupervisor('cancelar')}
                        className={`py-3 px-4 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                          respostaSupervisor === 'cancelar'
                            ? 'border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-600'
                            : 'border-neutral-200 dark:border-neutral-850 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-700 dark:text-neutral-300'
                        }`}
                        title={mesAtual === 1 ? "Para cancelar no primeiro mês, selecione Pagar Prêmio e Cancelar." : ""}
                      >
                        Cancelar Teste
                      </button>
                    </div>
                  </div>

                  {/* Restrição Informativa do Mês 4 */}
                  {mesAtual === 4 && (
                    <div className="p-3.5 bg-red-500/5 border border-red-500/20 text-red-700 dark:text-red-400 rounded-lg text-xs flex gap-2.5">
                      <AlertTriangle className="h-4.5 w-4.5 text-red-500 shrink-0" />
                      <span>
                        <strong>Aviso do Mês 4:</strong> O teste de promoção atingiu o limite de 4 meses. 
                        É impossível prorrogar mais um mês (pagar prêmio). Deve-se promover ou cancelar obrigatoriamente.
                      </span>
                    </div>
                  )}

                  {(mesAtual === 1 || respostaSupervisor) && (
                    <div className="space-y-4 p-5 bg-neutral-50 dark:bg-neutral-950/20 border border-neutral-200 dark:border-neutral-850 rounded-xl animate-fade-in">
                      {/* Observação (obrigatória para promover/cancelar/pagar_premio_cancelar, recomendada para prorrogar) */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider block">
                          Observações do Supervisor {respostaSupervisor !== 'pagar_premio' ? '*' : '(Opcional)'}
                        </label>
                        <textarea
                          placeholder={respostaSupervisor !== 'pagar_premio'
                            ? "Descreva os motivos da promoção, cancelamento ou pagamento e cancelamento informados pelo supervisor..."
                            : "Informações adicionais da resposta do supervisor..."
                          }
                          required={respostaSupervisor !== 'pagar_premio'}
                          rows={3}
                          value={observacao}
                          onChange={(e) => setObservacao(e.target.value)}
                          className="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-neutral-200 focus:outline-hidden resize-none"
                        />
                      </div>

                       <div className="flex justify-end gap-2.5">
                        {editandoResposta && (
                          <button
                            type="button"
                            onClick={cancelarEdicao}
                            className="inline-flex items-center gap-1.5 px-5 py-2 border border-neutral-300 dark:border-neutral-750 text-neutral-700 dark:text-neutral-300 rounded-full text-xs font-bold hover:bg-neutral-100 dark:hover:bg-neutral-850 transition-colors cursor-pointer"
                          >
                            Cancelar Edição
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={executing}
                          className="inline-flex items-center gap-1.5 px-5 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {executing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {editandoResposta ? 'Salvar Alteração' : 'Salvar Resposta do Supervisor'}
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}

              {/* Se status for ATIVO e JÁ TIVER resposta do supervisor e não estiver editando */}
              {teste.status === 'ativo' && respostaSupervisorReg && !editandoResposta && (
                <form onSubmit={handleConfirmarAcaoFinal} className="space-y-5">
                  {(() => {
                    /*
                      Por que existe: Esta função autoexecutável determina dinamicamente o estilo
                      e as mensagens de instrução baseadas na resposta registrada pelo supervisor
                      para a Etapa 2 de tomada de decisão, facilitando a identificação visual 
                      das ações de Pagar Prêmio (Azul), Promover (Verde), Cancelar (Vermelho) ou Pagar e Cancelar (Rose).
                    */
                    const decisao = respostaSupervisorReg.resposta_supervisor;
                    let bgClass = 'bg-blue-500/10 border-blue-500/20 text-blue-800 dark:text-blue-355';
                    let borderHeaderClass = 'border-blue-500/20';
                    let labelDecisao = 'Pagar Prêmio (Prorrogar)';
                    let instrucaoAcao = 'Confirmar o Lançamento de Pagamento & Prorrogar Teste';
                    let descricaoAcao = 'O supervisor decidiu pagar o prêmio e continuar o teste. Confirme o pagamento para prorrogar o teste do colaborador por mais um mês.';
                    let Icone = Play;

                    if (decisao === 'promover') {
                      bgClass = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300';
                      borderHeaderClass = 'border-emerald-500/20';
                      labelDecisao = 'Promover Colaborador';
                      instrucaoAcao = 'Confirmar a Efetivação da Promoção';
                      descricaoAcao = 'O supervisor decidiu promover o colaborador. Confirme a promoção para registrar a efetivação definitiva no novo cargo.';
                      Icone = UserCheck;
                    } else if (decisao === 'cancelar') {
                      bgClass = 'bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-350';
                      borderHeaderClass = 'border-red-500/20';
                      labelDecisao = 'Cancelar Teste';
                      instrucaoAcao = 'Confirmar o Cancelamento do Teste';
                      descricaoAcao = 'O supervisor decidiu cancelar o teste. Confirme o cancelamento para finalizar o teste. O colaborador retornará ao seu cargo original.';
                      Icone = XCircle;
                    } else if (decisao === 'pagar_premio_cancelar') {
                      bgClass = 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-350';
                      borderHeaderClass = 'border-rose-500/20';
                      labelDecisao = 'Pagar Prêmio e Cancelar';
                      instrucaoAcao = 'Confirmar o Pagamento de Prêmio e o Cancelamento do Teste';
                      descricaoAcao = 'O supervisor decidiu pagar o prêmio correspondente ao mês e cancelar o teste. Confirme a ação para registrar o prêmio devido e finalizar o teste como cancelado.';
                      Icone = XCircle;
                    }

                    return (
                      <div className={`p-4 rounded-xl border text-xs flex flex-col gap-3 animate-fade-in ${bgClass}`}>
                        <div className={`flex justify-between items-center border-b pb-2 ${borderHeaderClass}`}>
                          <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Icone className="h-4.5 w-4.5 shrink-0" />
                            Etapa 2: Confirmar Ação para o Mês {mesAtual}
                          </span>
                          <span className="font-bold text-[10px] bg-neutral-900/10 dark:bg-white/10 px-2.5 py-0.5 rounded-full">
                            Folha: {folhaAtual?.nomeFolha || '-'}
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          <div>
                            <p className="text-[10px] opacity-75 font-bold uppercase tracking-wider">O QUE DEVE SER FEITO:</p>
                            <p className="font-bold text-sm leading-tight mt-0.5">{instrucaoAcao}</p>
                            <p className="text-xs opacity-85 mt-1">{descricaoAcao}</p>
                          </div>
                          <div className="border-t border-current/10 pt-2 space-y-1 mt-1 opacity-90 text-[11px]">
                            <p>
                              <strong>Supervisor:</strong> {respostaSupervisorReg.solicitado_por} •{' '}
                              <strong>Resposta registrada em:</strong> {formatDate(respostaSupervisorReg.data_acao)}
                            </p>
                            <p>
                              <strong>Decisão Selecionada:</strong>{' '}
                              <span className="underline font-bold">{labelDecisao}</span>
                            </p>
                            {respostaSupervisorReg.observacao && (
                              <p className="bg-white/40 dark:bg-black/25 p-2.5 rounded-lg text-neutral-800 dark:text-neutral-200 italic mt-2 border border-current/5 whitespace-pre-wrap">
                                "{respostaSupervisorReg.observacao}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="p-5 bg-neutral-50 dark:bg-neutral-950/20 border border-neutral-200 dark:border-neutral-850 rounded-xl space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider block">
                        Observações de Lançamento (Opcional)
                      </label>
                      <textarea
                        placeholder="Adicione observações complementares sobre a execução do pagamento ou ação final..."
                        rows={2}
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-neutral-200 focus:outline-hidden resize-none"
                      />
                    </div>

                    <div className="flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={iniciarEdicao}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 border border-neutral-300 dark:border-neutral-750 text-neutral-700 dark:text-neutral-300 rounded-full text-xs font-bold hover:bg-neutral-100 dark:hover:bg-neutral-850 transition-colors cursor-pointer"
                      >
                        <Edit className="h-3.5 w-3.5 shrink-0" />
                        Editar Resposta
                      </button>
                      <button
                        type="submit"
                        disabled={executing}
                        className={`inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50 ${
                          respostaSupervisorReg.resposta_supervisor === 'pagar_premio'
                            ? 'bg-neutral-900 dark:bg-white dark:text-neutral-950 hover:bg-neutral-850 dark:hover:bg-neutral-100'
                            : respostaSupervisorReg.resposta_supervisor === 'promover'
                            ? 'bg-green-600 hover:bg-green-500'
                            : 'bg-rose-600 hover:bg-rose-500'
                        }`}
                      >
                        {executing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {respostaSupervisorReg.resposta_supervisor === 'pagar_premio'
                          ? 'Confirmar Pagamento e Prorrogar'
                          : respostaSupervisorReg.resposta_supervisor === 'promover'
                          ? 'Confirmar Promoção'
                          : respostaSupervisorReg.resposta_supervisor === 'pagar_premio_cancelar'
                          ? 'Confirmar Pagamento e Cancelar Teste'
                          : 'Confirmar Cancelamento do Teste'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Se status for CONCLUÍDO (Promovido/Cancelado) */}
              {(teste.status === 'promovido' || teste.status === 'cancelado') && (
                <div className="p-5 bg-neutral-50 dark:bg-neutral-950/45 border border-neutral-200 dark:border-neutral-850 rounded-xl text-center space-y-2">
                  <div className="inline-flex items-center justify-center p-3 bg-neutral-100 dark:bg-neutral-800 rounded-full text-neutral-700 dark:text-neutral-300">
                    <UserCheck className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-neutral-800 dark:text-white">Este teste de promoção está finalizado.</h4>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto leading-relaxed">
                    O status atual do colaborador é de <strong className="uppercase">{teste.status_display}</strong>.
                    Consulte as abas superiores para ver a linha do tempo ou o histórico de faltas na GeoVictoria.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ausencias' && (
            <div className="space-y-4">
              <div className="p-4 bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-200 dark:border-neutral-850 rounded-xl flex justify-between items-center shrink-0">
                <div>
                  <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">Histórico Recente de Ausências (Último Ano)</h4>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Captado em tempo real da GeoVictoria</p>
                </div>
                <button
                  onClick={fetchAusencias}
                  disabled={loadingAusencias}
                  className="text-xs font-bold text-neutral-900 dark:text-white hover:underline cursor-pointer disabled:opacity-50"
                >
                  Recarregar
                </button>
              </div>

              {loadingAusencias ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-neutral-500">
                  <Loader2 className="h-7 w-7 animate-spin" />
                  <span className="text-xs">Sincronizando pontos...</span>
                </div>
              ) : errorAusencias ? (
                <div className="p-4 flex gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-xl border border-red-500/20">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-500" />
                  <span>{errorAusencias}</span>
                </div>
              ) : ausencias ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3.5 bg-red-500/5 border border-red-500/20 rounded-xl text-center">
                      <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block">Total de Faltas</span>
                      <span className="text-xl font-extrabold text-red-600 dark:text-red-400">{ausencias.faltas}</span>
                    </div>
                    <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl text-center">
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">Total de Atestados</span>
                      <span className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{ausencias.atestados}</span>
                    </div>
                  </div>

                  {ausencias.detalhes && ausencias.detalhes.length > 0 ? (
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                      {ausencias.detalhes.map((det, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-3.5 rounded-xl bg-card border border-neutral-200 dark:border-neutral-850">
                          <div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase mr-2 ${
                              det.tipo === 'FALTA' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                            }`}>
                              {det.tipo}
                            </span>
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200">{det.descricao}</span>
                          </div>
                          <span className="text-neutral-500 font-medium">{formatDate(det.data)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                      <p className="text-sm text-neutral-500 font-semibold">Nenhuma ausência encontrada.</p>
                      <p className="text-xs text-neutral-400 mt-1">Este colaborador não possui registros de faltas ou atestados.</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {activeTab === 'historico' && (
            <div className="space-y-4">
              <div className="p-4 bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-200 dark:border-neutral-850 rounded-xl flex items-center gap-2.5 shrink-0">
                <History className="h-5 w-5 text-neutral-450" />
                <div>
                  <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">Histórico de Ações (Linha do Tempo)</h4>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Evolução do controle deste teste de promoção</p>
                </div>
              </div>

              <div className="relative pl-6 border-l border-neutral-200 dark:border-neutral-800 space-y-6 py-2 ml-3">
                {/* Item de Criação da Solicitação */}
                <div className="relative">
                  {/* Marcador na linha */}
                  <span className="absolute -left-[31px] top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border bg-white dark:bg-neutral-900 border-neutral-400 text-neutral-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  </span>

                  <div className="space-y-1 bg-neutral-50 dark:bg-neutral-950/10 border border-neutral-200/20 dark:border-neutral-850 p-3.5 rounded-xl">
                    <div className="flex justify-between items-start">
                      <h5 className="text-xs font-bold text-neutral-900 dark:text-white">
                        Solicitação Criada
                      </h5>
                      <span className="text-[10px] text-neutral-400 font-medium">
                        {formatDate(teste.created_at ? teste.created_at.split('T')[0] : null)}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Criado por: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{teste.criado_por || 'Sistema'}</span>
                    </div>
                  </div>
                </div>

                {testeAtual.historico_acoes.map((item) => (
                  <div key={item.id} className="relative">
                    {/* Marcador na linha */}
                    <span className={`absolute -left-[31px] top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border bg-white dark:bg-neutral-900 ${
                      item.acao === 'ativar' ? 'border-blue-500 text-blue-500' :
                      item.acao === 'alterar_data_inicio' ? 'border-amber-500 text-amber-500' :
                      item.acao === 'pagar_premio' ? 'border-amber-500 text-amber-500' :
                      item.acao === 'promover' ? 'border-green-600 text-green-600' :
                      item.acao === 'pagar_premio_cancelar' ? 'border-rose-500 text-rose-500' :
                      'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
                    }`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    </span>

                    <div className="space-y-1 bg-neutral-50 dark:bg-neutral-950/10 border border-neutral-200/20 dark:border-neutral-850 p-3.5 rounded-xl">
                      <div className="flex justify-between items-start">
                        <h5 className="text-xs font-bold text-neutral-900 dark:text-white">
                          {item.acao_display} {item.mes_referencia > 0 && `(Mês ${item.mes_referencia})`}
                        </h5>
                        <span className="text-[10px] text-neutral-400 font-medium">{formatDate(item.data_acao)}</span>
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        Solicitado por: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{item.solicitado_por}</span> • 
                        Lançado por: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{item.realizado_por}</span>
                      </div>
                      {item.observacao && (
                        <div className="text-xs text-neutral-600 dark:text-neutral-450 bg-white/60 dark:bg-neutral-950/45 p-2 rounded border border-neutral-100 dark:border-neutral-800 mt-2 leading-relaxed whitespace-pre-wrap">
                          <span className="font-bold text-[9px] uppercase tracking-wider text-neutral-400 block mb-0.5">Observações:</span>
                          {item.observacao}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Modal - Alterar Data de Início */}
      {showAlterarDataModal && (
        <AlterarDataInicioModal
          teste={testeAtual}
          onClose={() => setShowAlterarDataModal(false)}
          onSaveSuccess={(updated) => {
            if (updated) {
              setTesteAtual(updated);
            }
            onSaveSuccess();
          }}
        />
      )}
    </div>
  );
}


