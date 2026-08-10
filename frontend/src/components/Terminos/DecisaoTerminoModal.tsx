import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import type { TerminoItem } from './TerminosTable';
import DecisaoTab from './DecisaoTab';
import AusenciasTab from './AusenciasTab';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface DecisaoTerminoModalProps {
  item: TerminoItem;
  onClose: () => void;
  onSaveSuccess: () => void;
}

/**
 * Modal de registro de decisões de RH para Términos de Experiência.
 * 
 * Por que existe: Centraliza a casca visual do modal (overlay, abas) e atua
 * como orquestrador entre a aba de tomada de decisão e a aba de histórico de faltas/atestados.
 */
export default function DecisaoTerminoModal({
  item,
  onClose,
  onSaveSuccess,
}: DecisaoTerminoModalProps) {
  const [activeTab, setActiveTab] = useState<'decisao' | 'detalhes'>('decisao');
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
              Decisão de Término
            </h3>
            <p className="text-xs text-neutral-500">
              {item.colaborador.nome} ({item.state.tipoTermino})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Seletor de Abas */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 px-6 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('decisao')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'decisao'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            Registrar Decisão
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('detalhes')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'detalhes'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            Detalhes de Ausências
          </button>
        </div>

        {activeTab === 'decisao' ? (
          <DecisaoTab
            item={item}
            onClose={onClose}
            onSaveSuccess={onSaveSuccess}
          />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <AusenciasTab
              colaboradorId={item.colaborador.id}
              faltas={item.faltas}
              atestados={item.atestados}
            />
            {/* Rodapé Detalhes */}
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
        )}
      </div>
    </div>
  );
}
