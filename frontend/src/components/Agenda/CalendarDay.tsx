import { memo } from 'react';
import { MessageSquare, CheckCircle2, Sun, Moon } from 'lucide-react';
import { formatStatusLabel, type CalendarDayItem } from '../../utils/agenda-utils';

interface CalendarDayProps {
  item: CalendarDayItem;
  isInRange: boolean;
  onMouseDown: (date: string) => void;
  onMouseEnter: (date: string) => void;
  onMouseUp: () => void;
  onClick: (date: string) => void;
  onToggleStatus: (event: React.MouseEvent, item: CalendarDayItem) => void;
}

/**
 * Célula individual do calendário que representa um dia.
 * 
 * Por que existe: Renderiza o status diário, o nome da loja agendada, o turno
 * correspondente e escuta interações de clique e arrasto para seleção em lote.
 */
export const CalendarDay = memo(({ 
  item, 
  isInRange, 
  onMouseDown, 
  onMouseEnter, 
  onMouseUp, 
  onClick, 
  onToggleStatus 
}: CalendarDayProps) => {
  if (item.empty || !item.date || !item.day) {
    return <div className="min-h-[155px] bg-neutral-50 dark:bg-neutral-950 border-r border-b border-neutral-200 dark:border-neutral-800" />;
  }

  const isMorning = item.turno === 'matutino' && (item.status === 'agendado' || item.status === 'concluido');
  const isNight = item.turno === 'noturno' && (item.status === 'agendado' || item.status === 'concluido');

  return (
    <div
      className={`group relative min-h-[155px] overflow-hidden border-r border-b border-neutral-200 dark:border-neutral-800 transition-all duration-200 ${
        isInRange 
        ? 'z-20 ring-2 ring-inset ring-neutral-900 dark:ring-neutral-200 bg-neutral-50 dark:bg-neutral-800' 
        : 'bg-white dark:bg-neutral-900'
      }`}
      onMouseDown={() => onMouseDown(item.date!)} 
      onMouseEnter={() => onMouseEnter(item.date!)} 
      onMouseUp={onMouseUp}
    >
      <div 
        role="button"
        onClick={() => onClick(item.date!)}
        className={`h-full min-h-[155px] flex flex-col justify-between p-3 transition-colors text-left ${
          isInRange ? 'bg-neutral-900/5 dark:bg-white/5' :
          item.status === 'concluido' ? 'bg-emerald-500/10 dark:bg-emerald-500/20 hover:bg-emerald-500/15 dark:hover:bg-emerald-500/25 border-emerald-100 dark:border-emerald-950/30' : 
          item.status === 'faltou' ? 'bg-red-500/10 dark:bg-red-500/20 hover:bg-red-500/15 dark:hover:bg-red-500/25' : 
          item.status === 'atestado' ? 'bg-purple-500/10 dark:bg-purple-500/20 hover:bg-purple-500/15 dark:hover:bg-purple-500/25' : 
          item.status === 'folga' ? 'bg-amber-500/10 dark:bg-amber-500/20 hover:bg-amber-500/15 dark:hover:bg-amber-500/25' : 
          item.status === 'agendado' ? 'bg-neutral-50/60 dark:bg-neutral-850/60 hover:bg-neutral-100/80 dark:hover:bg-neutral-800' : 
          'hover:bg-neutral-50 dark:hover:bg-neutral-850'
        }`}
      >
        {/* Top Header do Dia */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-black leading-none text-neutral-900 dark:text-neutral-100">
              {item.day}
            </span>
            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider ${
              item.status === 'concluido' ? 'bg-emerald-600 dark:bg-emerald-500 text-white' : 
              item.status === 'agendado' ? 'bg-neutral-900 dark:bg-neutral-200 text-white dark:text-neutral-900' : 
              item.status === 'faltou' ? 'bg-red-600 dark:bg-red-500 text-white' : 
              item.status === 'atestado' ? 'bg-purple-600 dark:bg-purple-500 text-white' : 
              item.status === 'folga' ? 'bg-amber-600 dark:bg-amber-500 text-white' : 
              'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
            }`}>
              {formatStatusLabel(item.status)}
            </span>
          </div>

          {/* Nome da Loja / Roteiro */}
          {item.label ? (
            <p className="line-clamp-3 text-xs font-bold leading-snug text-neutral-800 dark:text-neutral-200 break-words">
              {item.label}
            </p>
          ) : (
            <p className="text-[11px] text-neutral-400 dark:text-neutral-600 italic">
              Sem agendamento
            </p>
          )}
        </div>

        {/* Rodapé da Célula: Turno e Ações */}
        <div className="flex items-center justify-between pt-2 mt-auto border-t border-neutral-100/60 dark:border-neutral-800/60">
          {/* Turno */}
          <div className="flex items-center gap-1">
            {isMorning && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                <Sun size={13} className="text-amber-500 fill-amber-50 dark:fill-transparent" />
                <span className="hidden xl:inline">Manhã</span>
              </span>
            )}
            {isNight && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-500 dark:text-indigo-400">
                <Moon size={13} className="text-indigo-400 fill-indigo-50 dark:fill-transparent" />
                <span className="hidden xl:inline">Noite</span>
              </span>
            )}
            {!isMorning && !isNight && (item.status === 'agendado' || item.status === 'concluido') && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                <Sun size={13} className="text-amber-500 fill-amber-50 dark:fill-transparent" />
                <span className="hidden xl:inline">Geral</span>
              </span>
            )}
          </div>

          {/* Botões de Ação */}
          {(item.status === 'agendado' || item.status === 'concluido') && (
            <div className="flex items-center gap-1">
              {item.observacao && (
                <div 
                  onMouseDown={(e) => e.stopPropagation()}
                  title={item.observacao}
                  className="flex h-6 w-6 items-center justify-center rounded-md border shadow-xs bg-white dark:bg-neutral-800 text-amber-600 border-amber-200 dark:border-amber-900 cursor-help"
                >
                  <MessageSquare size={12} />
                </div>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => onToggleStatus(e, item)}
                title={item.status === 'concluido' ? 'Marcar como agendado' : 'Concluir visita'}
                className={`flex h-6 w-6 items-center justify-center rounded-md border shadow-xs transition-all cursor-pointer ${
                  item.status === 'concluido' 
                  ? 'bg-emerald-600 dark:bg-emerald-500 border-emerald-500 text-white' 
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:border-neutral-900 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                <CheckCircle2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

CalendarDay.displayName = 'CalendarDay';
