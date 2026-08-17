import { useState, useMemo, useEffect, useCallback } from 'react';
import { User, Loader2, AlertCircle } from 'lucide-react';
import api from '../api/client';
import { useCalendarDrag } from '../hooks/useCalendarDrag';
import { buildCalendarDays, type Agendamento, type CalendarDayItem } from '../utils/agenda-utils';
import { weekDays } from '../components/Agenda/constants';
import type { Colaborador } from '../components/Colaboradores/ColaboradoresTable';
import type { Loja } from '../components/Lojas/LojasTable';

// Importação dos subcomponentes da Agenda
import { CleanerSidebar } from '../components/Agenda/CleanerSidebar';
import { CalendarHeader } from '../components/Agenda/CalendarHeader';
import { CalendarDay } from '../components/Agenda/CalendarDay';
import { CalendarNavigation } from '../components/Agenda/CalendarNavigation';
import { AgendaActionModal } from '../components/Agenda/AgendaActionModal';

const LOCAL_STORAGE_KEY_ORDER = 'agenda_colaboradores_ordem';

const getSavedOrder = (): string[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_ORDER);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveOrder = (colaboradores: Colaborador[]) => {
  try {
    const ids = colaboradores.map(c => String(c.id));
    localStorage.setItem(LOCAL_STORAGE_KEY_ORDER, JSON.stringify(ids));
  } catch (e) {
    console.error('Erro ao salvar ordem dos colaboradores:', e);
  }
};

const sortWithSavedOrder = (colabs: Colaborador[], savedOrder: string[]): Colaborador[] => {
  if (!savedOrder || savedOrder.length === 0) return colabs;
  const orderMap = new Map<string, number>();
  savedOrder.forEach((id, idx) => orderMap.set(String(id), idx));

  return [...colabs].sort((a, b) => {
    const posA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id))! : 9999;
    const posB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id))! : 9999;
    return posA - posB;
  });
};

/**
 * Página principal de Planejamento e Programação da Agenda de Apoio.
 * 
 * Por que existe: Permite aos gestores programar e gerenciar a alocação
 * diária da equipe de apoio nas lojas físicas, utilizando um calendário interativo.
 */
export default function Agenda() {
  const today = new Date();

  // Estados de navegação de data
  const [month, setMonth] = useState<number>(today.getMonth());
  const [year, setYear] = useState<number>(today.getFullYear());

  // Estados de dados principais
  const [visibleCollaborators, setVisibleCollaborators] = useState<Colaborador[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string | null>(null);

  // Estados de carregamento e erro
  const [loadingAgendamentos, setLoadingAgendamentos] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados do Modal
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<string[]>([]);
  const [initialForm, setInitialForm] = useState<any>(null);

  // Mapeia o nome das lojas de referência para busca rápida
  const lojasMap = useMemo(() => {
    const map = new Map<string, Loja>();
    lojas.forEach((l) => {
      const norm = l.nome_referencia.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      map.set(norm, l);
    });
    return map;
  }, [lojas]);

  // Hook de Drag and Drop para seleção de múltiplos dias
  const {
    dragStart,
    dragEnd,
    isDragging,
    getDatesInRange,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    setDragStart,
    setDragEnd
  } = useCalendarDrag((range) => {
    setSelectedDateRange(range);
    openDayModal(range[0], range);
  });

  // Carrega lista de lojas na montagem da tela
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        setErrorMsg(null);
        
        const [lojasRes] = await Promise.all([
          api.get('/lojas/?sem_paginacao=true&status=ATIVA'),
        ]);
        
        setLojas(lojasRes.data || []);
      } catch (err) {
        console.error('Erro ao carregar dados mestres para a agenda:', err);
        setErrorMsg('Não foi possível inicializar os dados das lojas.');
      }
    };
    
    fetchBaseData();
  }, []);

  // Recarrega os agendamentos do mês e meses adjacentes sempre que mudar de mês/ano
  const fetchAgendamentos = useCallback(async () => {
    try {
      setLoadingAgendamentos(true);
      
      // Calcula mês anterior
      let prevMonth = month - 1;
      let prevYear = year;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear -= 1;
      }

      // Calcula mês seguinte
      let nextMonth = month + 1;
      let nextYear = year;
      if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }

      const mesIso = `${year}-${String(month + 1).padStart(2, '0')}`;
      const prevMesIso = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
      const nextMesIso = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;

      // Faz as buscas de agendamentos em paralelo
      const [prevRes, currRes, nextRes] = await Promise.all([
        api.get('/colaboradores/agendamentos/', { params: { mes_ano: prevMesIso } }),
        api.get('/colaboradores/agendamentos/', { params: { mes_ano: mesIso } }),
        api.get('/colaboradores/agendamentos/', { params: { mes_ano: nextMesIso } }),
      ]);

      const data: Agendamento[] = [
        ...(prevRes.data || []),
        ...(currRes.data || []),
        ...(nextRes.data || [])
      ];
      setAgendamentos(data);

      // Constrói a lista de colaboradores que já possuem agendamentos no período
      const uniqueColabsMap = new Map<string, Colaborador>();
      data.forEach((a) => {
        if (a.colaborador) {
          uniqueColabsMap.set(String(a.colaborador), {
            id: String(a.colaborador),
            nome: a.colaborador_nome || 'Colaborador',
            re: a.colaborador_re || '',
            cpf: (a as any).colaborador_cpf || '',
            cargo: a.funcao || 'Apoio',
            status: 'ATIVA'
          } as any);
        }
      });

      setVisibleCollaborators(prev => {
        const map = new Map<string, Colaborador>();
        // Preserva os que já estavam listados na tela
        prev.forEach(c => map.set(String(c.id), c));
        // Insere os que já possuem escala
        uniqueColabsMap.forEach((c, id) => {
          if (!map.has(id)) {
            map.set(id, c);
          }
        });

        // Se houver um selecionado, garante sua presença na barra lateral
        if (selectedColaboradorId && !map.has(selectedColaboradorId)) {
          const selColab = prev.find(c => String(c.id) === selectedColaboradorId);
          if (selColab) map.set(selectedColaboradorId, selColab);
        }

        const list = Array.from(map.values());
        const savedOrder = getSavedOrder();
        return sortWithSavedOrder(list, savedOrder);
      });
    } catch (err) {
      console.error('Erro ao buscar agendamentos do mês:', err);
    } finally {
      setLoadingAgendamentos(false);
    }
  }, [month, year, selectedColaboradorId]);

  useEffect(() => {
    fetchAgendamentos();
  }, [month, year]);

  // Encontra o colaborador selecionado na lista
  const selectedColaborador = useMemo(() => {
    return visibleCollaborators.find(c => c.id === selectedColaboradorId) || null;
  }, [visibleCollaborators, selectedColaboradorId]);

  // Constrói a lista dos dias do calendário formatados
  const calendarDays = useMemo(() => {
    return buildCalendarDays(month, year, agendamentos, selectedColaboradorId, lojasMap);
  }, [month, year, agendamentos, selectedColaboradorId, lojasMap]);

  // Navega entre os meses
  const moveMonth = useCallback((direction: number) => {
    setMonth((prev) => {
      let nextMonth = prev + direction;
      if (nextMonth < 0) {
        setYear((y) => y - 1);
        return 11;
      } else if (nextMonth > 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return nextMonth;
    });
  }, []);

  // Abre o modal de configuração de roteiro para o dia/dias selecionados
  const openDayModal = useCallback((date: string, customRange?: string[]) => {
    const [y, m, d] = date.split('-').map(Number);
    const isSunday = new Date(y, m - 1, d).getDay() === 0;
    setSelectedDate(date);

    const targetDates = customRange && customRange.length > 0 ? customRange : [date];

    // Procura primeiro se existe algum agendamento com loja física em qualquer um dos dias selecionados
    let agendamento = agendamentos.find(
      item => targetDates.includes(item.data) && 
              String(item.colaborador) === String(selectedColaboradorId) && 
              !!item.loja
    );

    // Se não encontrou nenhum com loja, pega o primeiro agendamento que encontrar (mesmo sem loja, ex: folga/livre)
    if (!agendamento) {
      agendamento = agendamentos.find(
        item => targetDates.includes(item.data) && 
                String(item.colaborador) === String(selectedColaboradorId)
      );
    }

    let formData = {
      lojaId: '',
      lojaTexto: '',
      funcao: selectedColaborador?.cargo || 'Apoio',
      status: (isSunday ? 'folga' : 'livre') as any,
      turno: 'noturno' as 'matutino' | 'noturno' | 'personalizado',
      horaEntrada: '',
      horaSaida: '',
      observacao: '',
    };

    if (agendamento) {
      formData = {
        lojaId: agendamento.loja || '',
        lojaTexto: agendamento.loja_nome || '',
        funcao: agendamento.funcao || selectedColaborador?.cargo || 'Apoio',
        status: agendamento.status || 'agendado',
        turno: agendamento.turno || 'noturno',
        horaEntrada: agendamento.hora_entrada || '',
        horaSaida: agendamento.hora_saida || '',
        observacao: agendamento.observacao || '',
      };
    }

    setInitialForm(formData);
    setModalOpen(true);
  }, [selectedColaborador, selectedColaboradorId, agendamentos]);

  // Fecha o modal de agendamento e limpa os estados locais
  const closeDayModal = useCallback(() => {
    setModalOpen(false); 
    setSelectedDateRange([]);
    setInitialForm(null);
    setDragStart(null);
    setDragEnd(null);
  }, [setDragStart, setDragEnd]);

  // Limpa (exclui) o agendamento das datas selecionadas no banco de dados, voltando para o estado "livre"
  const handleClearAgendamento = useCallback(async () => {
    if (!selectedColaboradorId) return;

    const targetDates = selectedDateRange.length > 0 ? selectedDateRange : [selectedDate];
    const toDelete = agendamentos.filter(
      a => targetDates.includes(a.data) && String(a.colaborador) === String(selectedColaboradorId)
    );

    if (toDelete.length === 0) {
      closeDayModal();
      return;
    }

    try {
      setLoadingAgendamentos(true);
      await Promise.all(
        toDelete.map((a) => {
          if (a.id) {
            return api.delete(`/colaboradores/agendamentos/${a.id}/excluir/`);
          }
          return Promise.resolve();
        })
      );
      await fetchAgendamentos();
      closeDayModal();
    } catch (err) {
      console.error('Erro ao excluir agendamentos:', err);
      setErrorMsg('Não foi possível excluir o agendamento no servidor.');
    } finally {
      setLoadingAgendamentos(false);
    }
  }, [selectedColaboradorId, selectedDate, selectedDateRange, agendamentos, fetchAgendamentos, closeDayModal]);

  // Salva ou edita a programação da agenda (upsert em lote)
  const handleModalSubmit = async (formData: any) => {
    if (!selectedColaboradorId) return;

    const targetDates = selectedDateRange.length > 0 ? selectedDateRange : [selectedDate];
    const payload = targetDates.map((dateStr) => {
      const existing = agendamentos.find(
        a => a.data === dateStr && String(a.colaborador) === String(selectedColaboradorId)
      );
      
      const item: any = {
        colaborador: selectedColaboradorId,
        data: dateStr,
        status: formData.status,
        funcao: formData.funcao || 'Apoio',
        observacao: formData.observacao.trim(),
        turno: formData.turno,
        hora_entrada: formData.horaEntrada,
        hora_saida: formData.horaSaida
      };

      if (existing) {
        item.id = existing.id;
      }

      if (formData.lojaId) {
        item.loja = formData.lojaId;
      } else {
        item.loja = null;
        item.loja_manual = formData.lojaTexto || null;
      }

      return item;
    });

    try {
      setLoadingAgendamentos(true);
      await api.post('/colaboradores/agendamentos/', payload);
      await fetchAgendamentos();
      closeDayModal();
    } catch (err) {
      console.error('Erro ao salvar agendamentos:', err);
      setErrorMsg('Não foi possível salvar o agendamento no servidor.');
    } finally {
      setLoadingAgendamentos(false);
    }
  };

  // Alterna o status do dia rapidamente de agendado para concluído (e vice-versa)
  const toggleStatusQuickly = useCallback(async (event: React.MouseEvent, dayItem: CalendarDayItem) => {
    event.stopPropagation();
    if (!selectedColaboradorId || !dayItem.date || dayItem.status === 'livre' || dayItem.status === 'folga') return;

    const existing = agendamentos.find(
      a => a.data === dayItem.date && String(a.colaborador) === String(selectedColaboradorId)
    );
    if (!existing) return;

    const nextStatus = existing.status === 'concluido' ? 'agendado' : 'concluido';
    const payload = {
      ...existing,
      status: nextStatus
    };

    try {
      setLoadingAgendamentos(true);
      await api.post('/colaboradores/agendamentos/', [payload]);
      await fetchAgendamentos();
    } catch (err) {
      console.error('Erro ao alterar status rápido:', err);
    } finally {
      setLoadingAgendamentos(false);
    }
  }, [selectedColaboradorId, agendamentos]);

  // Move o colaborador para cima ou para baixo na lista/grid
  const handleMoveColaborador = useCallback((id: string, direction: 'up' | 'down') => {
    setVisibleCollaborators(prev => {
      const index = prev.findIndex(c => String(c.id) === String(id));
      if (index === -1) return prev;
      
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const newList = [...prev];
      const [moved] = newList.splice(index, 1);
      newList.splice(targetIndex, 0, moved);
      saveOrder(newList);
      return newList;
    });
  }, []);

  // Atualiza a ordenação completa dos colaboradores (ex: via Drag and Drop)
  const handleReorderColaboradores = useCallback((newOrder: Colaborador[]) => {
    setVisibleCollaborators(newOrder);
    saveOrder(newOrder);
  }, []);



  return (
    <div className="space-y-6">
      {/* Exibição de Alertas de Erro */}
      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-sm flex gap-3 items-center">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Grid Principal Layout com a Sidebar na Esquerda */}
      <section className="flex flex-col gap-6 lg:flex-row items-start">
        <CleanerSidebar 
          visibleColaboradores={visibleCollaborators}
          selectedColaboradorId={selectedColaboradorId}
          onSelectColaborador={(id) => { setSelectedColaboradorId(id); closeDayModal(); }}
          onAddColaborador={(colab) => {
            setVisibleCollaborators((prev) => {
              if (prev.some(c => String(c.id) === String(colab.id))) return prev;
              const updated = [...prev, colab];
              saveOrder(updated);
              return updated;
            });
            setSelectedColaboradorId(String(colab.id));
            closeDayModal();
          }}
          onMoveColaborador={handleMoveColaborador}
          onReorderColaboradores={handleReorderColaboradores}
        />

        {/* Área de Calendário */}
        <div className="flex-1 min-w-0 w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm">
          <CalendarHeader 
            selectedColaborador={selectedColaborador}
            month={month}
            year={year}
            onMoveMonth={moveMonth}
            isDragging={isDragging}
          />

          {selectedColaboradorId ? (
            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800 shadow-inner relative">
              {loadingAgendamentos && (
                <div className="absolute inset-0 z-50 bg-white/50 dark:bg-neutral-950/50 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-neutral-900 dark:text-white" />
                </div>
              )}
              
              <div className="grid grid-cols-7 bg-neutral-50 dark:bg-neutral-850">
                {weekDays.map((day) => (
                  <div key={day} className="border-b border-neutral-200 dark:border-neutral-700 px-2 py-3 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-400">
                    {day}
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-7 select-none bg-transparent">
                {calendarDays.map((item) => (
                  <CalendarDay 
                    key={item.key}
                    item={item}
                    isInRange={!item.empty && !!dragStart && !!dragEnd && getDatesInRange(dragStart, dragEnd).includes(item.date!)}
                    onMouseDown={handleMouseDown}
                    onMouseEnter={handleMouseEnter}
                    onMouseUp={handleMouseUp}
                    onClick={openDayModal}
                    onToggleStatus={toggleStatusQuickly}
                  />
                ))}
              </div>

              <div className="flex justify-end p-4 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800">
                <CalendarNavigation 
                  month={month} 
                  year={year} 
                  onMoveMonth={moveMonth} 
                  isDragging={isDragging} 
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/30 py-24 text-center">
              <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4 mb-4">
                 <User className="h-8 w-8 text-neutral-400" />
              </div>
              <h4 className="text-base font-bold text-neutral-900 dark:text-neutral-100">Selecione um colaborador</h4>
              <p className="mt-1 text-sm text-neutral-500 max-w-xs mx-auto">Utilize a barra de pesquisa à esquerda para selecionar um membro da equipe e gerenciar seu cronograma.</p>
            </div>
          )}
        </div>
      </section>

      {/* Modal de Agendamento */}
      {modalOpen && initialForm && selectedColaborador && (
        <AgendaActionModal 
          isOpen={modalOpen}
          onClose={closeDayModal}
          title={selectedDateRange.length > 0 ? 'Agendar Período' : 'Agendar Dia'}
          selectedColaborador={selectedColaborador}
          selectedDateRange={selectedDateRange.length > 0 ? selectedDateRange : [selectedDate!]}
          initialForm={initialForm}
          lojas={lojas}
          lojasMap={lojasMap}
          agendamentos={agendamentos}
          onSubmit={handleModalSubmit}
          onClear={handleClearAgendamento}
        />
      )}
    </div>
  );
}
