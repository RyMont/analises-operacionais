import { useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedEtapa: number;
  actionLoading: boolean;
}

/**
 * Modal de Confirmação para limpeza de decisões de término de experiência.
 * 
 * Por que existe: Isola a interface do popup de confirmação do fluxo principal do modal.
 * Isso melhora a legibilidade e evita poluição de JSX no componente pai.
 */
export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  selectedEtapa,
  actionLoading,
}: ConfirmDeleteModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 animate-scale-in text-left">
        <div className="flex gap-3 text-red-500">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <h4 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
            Confirmar Limpeza
          </h4>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
          Tem certeza que deseja limpar a decisão de <strong>Término {selectedEtapa}</strong>?
          <br />
          <br />
          Isso fará com que o colaborador volte para o status <strong>"Pendente"</strong> nesta etapa.
          {selectedEtapa === 1 && (
            <span className="block mt-2 text-xs font-semibold text-red-500 bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/40 p-2 rounded">
              Aviso: As decisões das etapas 1 e 2 serão excluídas.
            </span>
          )}
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-full text-xs font-bold text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={actionLoading}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-bold transition-colors shadow-sm cursor-pointer disabled:opacity-50"
          >
            Limpar Decisão
          </button>
        </div>
      </div>
    </div>
  );
}
