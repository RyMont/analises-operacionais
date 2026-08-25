import React, { useState, useRef } from 'react';
import { X, Calendar, Loader2, AlertCircle, Info, CalendarDays, Check } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import { formatDate, obterInfoFolhas } from '../../utils/formatters';
import type { TestePromocaoItem } from '../../pages/TestesPromocao';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface AlterarDataInicioModalProps {
  teste: TestePromocaoItem;
  onClose: () => void;
  onSaveSuccess: (updatedTeste?: TestePromocaoItem) => void;
}

/**
 * Modal para Alteração de Data de Início do Teste de Promoção.
 * 
 * Por que existe: Permite corrigir a data inicial do período de teste quando houver
 * erros de digitação ou reagendamento de início de experiência na função. Ao atualizar,
 * o sistema recalcula dinamicamente as folhas de pagamento (Mês 1 a 4) e prazos de cobrança.
 */
export default function AlterarDataInicioModal({
  teste,
  onClose,
  onSaveSuccess,
}: AlterarDataInicioModalProps) {
  const [novaData, setNovaData] = useState(teste.data_inicio || '');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  // Calcula projeção das folhas com a nova data para preview
  const folhasNovas = novaData ? obterInfoFolhas(novaData) : [];

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!novaData) {
      setErro('Selecione uma data de início válida.');
      return;
    }

    if (novaData === teste.data_inicio) {
      toast.info('A nova data informada é idêntica à data atual.');
      onClose();
      return;
    }

    setSalvando(true);
    try {
      const response = await api.patch(`/colaboradores/testes/${teste.id}/alterar-data-inicio/`, {
        data_inicio: novaData,
        motivo: motivo.trim() || undefined,
      });

      toast.success('Data de início alterada com sucesso!');
      onSaveSuccess(response.data);
      onClose();
    } catch (err: any) {
      console.error('Erro ao alterar data de início:', err);
      const msg = err.response?.data?.error || 'Erro ao alterar data de início do teste.';
      setErro(msg);
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div
        ref={modalRef}
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                Alterar Data de Início do Teste
              </h3>
              <p className="text-xs text-neutral-500">
                {teste.colaborador_nome} (RE {teste.colaborador_re})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSalvar} className="p-6 space-y-5">
          {erro && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-xs flex gap-2.5 items-center">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Dados Resumidos do Colaborador */}
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-200/80 dark:border-neutral-850 rounded-xl grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Cargo Atual</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">{teste.colaborador_cargo}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-amber-500 uppercase tracking-wider">Cargo em Teste</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{teste.cargo_teste || '-'}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Loja / Supervisão</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">{teste.loja_nome}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Data de Início Atual</span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 mt-0.5">
                <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                {formatDate(teste.data_inicio)}
              </span>
            </div>
          </div>

          {/* Seleção da Nova Data */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-amber-500" />
              Nova Data de Início <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-800 dark:text-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-medium"
            />
          </div>

          {/* Motivo da Alteração (Opcional para Auditoria) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 block">
              Motivo da Alteração <span className="text-neutral-400 font-normal">(Opcional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Correção de data digitada incorretamente no cadastro / Reagendamento de início..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-800 dark:text-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500 resize-none font-medium"
            />
          </div>

          {/* Aviso sobre Recálculo de Folhas */}
          <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 rounded-xl flex gap-2.5 text-xs text-amber-850 dark:text-amber-300">
            <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Impacto no Calendário do Teste</p>
              <p className="text-[11px] leading-relaxed opacity-90">
                Ao alterar a data de início, os ciclos das folhas de pagamento (Mês 1 ao Mês 4) e as datas limites de cobrança do supervisor serão recalculados automaticamente.
              </p>
              {folhasNovas.length > 0 && novaData !== teste.data_inicio && (
                <div className="mt-2 pt-2 border-t border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-[10px] font-bold">
                  <span>1º Mês: {folhasNovas[0]?.nomeFolha}</span>
                  <span>2º Mês: {folhasNovas[1]?.nomeFolha}</span>
                  <span>3º Mês: {folhasNovas[2]?.nomeFolha}</span>
                  <span>4º Mês: {folhasNovas[3]?.nomeFolha}</span>
                </div>
              )}
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="px-5 py-2.5 text-xs font-bold border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-full transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-6 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-neutral-950 rounded-full shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Salvar Nova Data</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
