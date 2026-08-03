import { useState, useEffect, useRef } from 'react';
import { X, Calendar, MapPin, User, Copy, Check, FileText } from 'lucide-react';
import SearchableSelect from '../ui/searchable-select';
import { statusOptions } from './constants';
import { formatWhatsAppMessage, maskTime, type Agendamento } from '../../utils/agenda-utils';
import type { Colaborador } from '../Colaboradores/ColaboradoresTable';
import type { Loja } from '../Lojas/LojasTable';
import { logoBase64 } from '../../assets/logoBase64';
import api from '../../api/client';
import { copyTextToClipboard } from '../../utils/clipboard';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface AgendaActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  selectedColaborador: Colaborador;
  selectedDateRange: string[];
  initialForm: {
    lojaId: string;
    lojaTexto: string;
    funcao: string;
    status: 'agendado' | 'concluido' | 'folga' | 'livre' | 'faltou' | 'atestado';
    turno: 'matutino' | 'noturno' | 'personalizado';
    horaEntrada: string;
    horaSaida: string;
    observacao: string;
  };
  lojas: Loja[];
  lojasMap: Map<string, Loja>;
  agendamentos: Agendamento[];
  onSubmit: (formData: any) => void;
  onClear?: () => void;
}


/**
 * Modal para criação e edição de agendamentos.
 * 
 * Por que existe: Gerencia a atribuição de lojas e horários aos colaboradores de apoio,
 * permitindo edição manual da função a ser exercida no dia e cópia rápida do roteiro para o WhatsApp.
 */
export function AgendaActionModal({
  isOpen,
  onClose,
  title,
  selectedColaborador,
  selectedDateRange,
  initialForm, 
  lojas,
  lojasMap,
  agendamentos,
  onSubmit,
  onClear
}: AgendaActionModalProps) {
  const [copied, setCopied] = useState(false);
  const [localForm, setLocalForm] = useState(initialForm);
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  /**
   * Estado para controlar se a data na carta de apresentação deve ser exibida como "a partir de" a data selecionada.
   * Por que existe: Permite flexibilizar a geração da carta para escalas que começam em uma data fixa e continuam indefinidamente.
   */
  const [usarAPartirDe, setUsarAPartirDe] = useState(false);

  const hasExistingAgendamento = selectedDateRange.some(date => 
    agendamentos.some(a => a.data === date && String(a.colaborador) === String(selectedColaborador.id))
  );

  useEffect(() => {
    if (isOpen && initialForm) {
      setLocalForm(initialForm);
      setUsarAPartirDe(false);
    }
  }, [isOpen, initialForm]);

  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.get('/usuarios/api/me/')
        .then(res => {
          if (res.data.authenticated && res.data.user) {
            const u = res.data.user;
            const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
            setCurrentUser({ name: fullName, email: u.email || '' });
          }
        })
        .catch(err => console.error('Erro ao buscar usuário logado:', err));
    }
  }, [isOpen]);
  /**
   * Gera e abre a carta de apresentação em uma nova janela para impressão.
   * O título do documento HTML é configurado como "[Nome do Colaborador] - [Nome da Loja]"
   * para que, ao salvar como PDF, o navegador sugira este nome de arquivo por padrão.
   */
  const handleGenerateLetter = () => {
    const sortedDates = [...selectedDateRange].sort();
    const formatDateStr = (dStr: string) => {
      const [y, m, d] = dStr.split('-');
      return `${d}/${m}/${y}`;
    };
    
    let dateText = '';
    if (usarAPartirDe) {
      dateText = `a partir do dia ${formatDateStr(sortedDates[0])}`;
    } else if (sortedDates.length === 1) {
      dateText = `no dia ${formatDateStr(sortedDates[0])}`;
    } else {
      dateText = `no dia ${formatDateStr(sortedDates[0])} até ${formatDateStr(sortedDates[sortedDates.length - 1])}`;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, ative os pop-ups para gerar a carta de apresentação.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${selectedColaborador.nome} - ${localForm.lojaTexto || 'Sem Loja'}</title>
        <meta charset="utf-8">
        <style>
          @page {
            size: A4;
            margin: 25mm 25mm 20mm 25mm;
          }
          body {
            font-family: 'Arial', sans-serif;
            color: #000;
            line-height: 1.8;
            margin: 0;
            padding: 0;
            background: #fff;
            font-size: 16px;
          }
          .container {
            max-width: 100%;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            margin-bottom: 50px;
          }
          .logo {
            max-height: 140px;
            width: auto;
          }
          .store-name {
            font-size: 19px;
            font-weight: bold;
            margin-bottom: 25px;
            text-transform: uppercase;
            margin-top: 30px;
          }
          .reference {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 35px;
            text-transform: uppercase;
          }
          .salutation {
            margin-bottom: 35px;
          }
          .body-text {
            text-align: justify;
            margin-bottom: 35px;
          }
          .disclaimer {
            margin-bottom: 35px;
          }
          .closing {
            margin-bottom: 45px;
          }
          .signature-section {
            margin-top: 50px;
          }
          .signer-name {
            font-weight: bold;
            text-transform: uppercase;
          }
          .signer-title {
            margin-bottom: 2px;
          }
          .signer-email {
            color: #000;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img class="logo" src="${logoBase64}" alt="Logo" />
          </div>
          
          <div class="store-name">${(localForm.lojaTexto || 'Sem Loja / Digitação Manual').toUpperCase()}</div>
          
          <div class="reference">REF: APRESENTAÇÃO DE FUNCIONÁRIOS:</div>
          
          <div class="salutation">Prezados Senhores,</div>
          
          <p class="body-text">
            Nós, da empresa Inovacao de Servicos LTDA, inscrita no CNPJ 17.965.438/0001-07, apresentamos o colaborador ${selectedColaborador.nome.toUpperCase()}, CPF: ${selectedColaborador.cpf || 'Não Informado'}, que irá atuar na função de ${(localForm.funcao || selectedColaborador.cargo || 'Apoio').toUpperCase()} ${dateText} das ${localForm.horaEntrada || '--:--'} às ${localForm.horaSaida || '--:--'}.
          </p>
          
          <p class="disclaimer">
            Estamos à disposição para quaisquer esclarecimentos.
          </p>
          
          <p class="closing">
            Atenciosamente,
          </p>
          
          <div class="signature-section">
            <div class="signer-name">${(currentUser?.name || 'Guilherme Satoru').toUpperCase()}</div>
            <div class="signer-title">SUPORTE OPERACIONAL</div>
            <div class="signer-email">${currentUser?.email || 'guilherme.satoru@inovacao.com'}</div>
          </div>
        </div>
        
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  const handleCopyAndOpenMaps = async () => {
    const { message } = formatWhatsAppMessage(
      selectedColaborador,
      selectedDateRange,
      {
        lojaTexto: localForm.lojaTexto,
        status: localForm.status,
        funcao: localForm.funcao
      },
      agendamentos,
      lojasMap
    );
    
    try {
      await copyTextToClipboard(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Falha ao copiar texto:", err);
    }
  };

  const handleInternalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(localForm);
  };

  const handleShiftSelect = (t: 'matutino' | 'noturno' | 'personalizado') => {
    setLocalForm(prev => {
      let novaEntrada = prev.horaEntrada;
      let novaSaida = prev.horaSaida;
      
      if (t === 'noturno') {
        novaEntrada = '22:00H';
        novaSaida = '05:00H';
      } else if (t === 'matutino') {
        novaEntrada = '06:00H';
        novaSaida = '14:20H';
      }
      
      return { 
        ...prev, 
        turno: t,
        horaEntrada: novaEntrada,
        horaSaida: novaSaida
      };
    });
  };

  // Prepara as opções de lojas para o SearchableSelect
  const storeOptions = [
    { value: '', label: 'Selecione uma loja...' },
    ...lojas.filter(l => l.status === 'ATIVA').map(l => ({
      value: String(l.id),
      label: l.nome_referencia
    }))
  ];

  // Encontra a loja selecionada atualmente para mostrar detalhes adicionais (endereço, supervisor)
  const selectedLojaObj = lojas.find(l => String(l.id) === localForm.lojaId);
  const enderecoExibicao = selectedLojaObj
    ? `${selectedLojaObj.rua || ''} - ${selectedLojaObj.bairro || ''}, ${selectedLojaObj.municipio || ''} - ${selectedLojaObj.uf || ''}`.trim()
    : '';

  const supervisorExibicao = selectedLojaObj?.supervisor_nome || '';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
        
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center font-bold shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                {title}
              </h3>
              <p className="text-xs text-neutral-500 uppercase tracking-widest">
                Agendamento de Roteiro
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo do Formulário */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <form id="agendamento-form" onSubmit={handleInternalSubmit} className="space-y-4">
            
            {/* Dados do Colaborador */}
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center font-bold text-lg uppercase shrink-0">
                {selectedColaborador.nome.substring(0, 2)}
              </div>
              <div className="text-left">
                <span className="block text-[10px] font-bold text-neutral-500 uppercase">Colaborador</span>
                <span className="text-base font-bold text-neutral-900 dark:text-neutral-50">{selectedColaborador.nome}</span>
                <span className="block text-[11px] text-neutral-500 font-mono mt-0.5">RE: {selectedColaborador.re} | Cargo: {selectedColaborador.cargo}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              
              {/* Seleção de Loja via SearchableSelect */}
              <div className="md:col-span-2 space-y-1.5">
                <span className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase">Destino (Loja)</span>
                <SearchableSelect
                  options={storeOptions}
                  value={localForm.lojaId}
                  onChange={(val) => {
                    const lojaFound = lojas.find(l => String(l.id) === val);
                    const t = 'noturno';

                    setLocalForm(prev => ({
                      ...prev,
                      lojaId: val,
                      lojaTexto: lojaFound ? lojaFound.nome_referencia : '',
                      status: val !== '' && (prev.status === 'livre' || prev.status === 'folga') ? 'agendado' : prev.status,
                      turno: val !== '' ? t : prev.turno,
                      horaEntrada: val !== '' ? prev.horaEntrada || '22:00H' : prev.horaEntrada,
                      horaSaida: val !== '' ? prev.horaSaida || '05:00H' : prev.horaSaida
                    }));
                  }}
                  placeholder="Pesquisar loja física..."
                />
              </div>

              {/* Informações da Loja Selecionada */}
              {localForm.lojaId && (
                <div className="md:col-span-2 grid grid-cols-2 gap-3 p-3 bg-neutral-50 dark:bg-neutral-850 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 uppercase">Endereço da Loja</span>
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{enderecoExibicao || 'Sem endereço'}</span>
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 uppercase">Supervisor da Loja</span>
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">{supervisorExibicao || 'Sem supervisor'}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Função a exercer (Definida Manualmente pelo usuário) */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase">
                  Função a Exercer no Roteiro
                </label>
                <input
                  type="text"
                  value={localForm.funcao}
                  onChange={(e) => setLocalForm(prev => ({ ...prev, funcao: e.target.value }))}
                  placeholder="Ex: Auxiliar de Apoio, Limpador de Vidros..."
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm font-semibold outline-none focus:border-neutral-900 dark:focus:border-neutral-300 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
                />
              </div>

              {/* Status do Agendamento */}
              <div className="space-y-1.5">
                <span className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase">Status</span>
                <SearchableSelect
                  options={statusOptions}
                  value={localForm.status}
                  onChange={(val) => setLocalForm(prev => ({ ...prev, status: val as any }))}
                  placeholder="Selecione o status..."
                />
              </div>

              {/* Observação Interna */}
              <div className="space-y-1.5 md:col-span-2">
                <span className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase">Observação Interna</span>
                <textarea
                  value={localForm.observacao}
                  onChange={(e) => setLocalForm(prev => ({ ...prev, observacao: e.target.value }))}
                  rows={2}
                  placeholder="Dica de acesso, contato local, etc."
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm font-medium outline-none text-neutral-900 dark:text-neutral-100"
                />
              </div>
            </div>

            {/* Configurações do Roteiro (WhatsApp e Google Maps) */}
            {localForm.lojaId && (
              <div className="space-y-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/20 p-5 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />
                  <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">Cronograma e Horários</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2 items-start">
                  {/* Turno */}
                  <div className="space-y-1.5">
                    <span className="block text-[10px] font-bold text-neutral-500 uppercase">Turno</span>
                    <div className="flex gap-1.5">
                      {(['matutino', 'noturno', 'personalizado'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleShiftSelect(t)}
                          className={`flex-1 rounded-xl border py-2.5 text-xs font-bold transition cursor-pointer ${
                            localForm.turno === t 
                              ? 'bg-neutral-900 border-neutral-900 text-white dark:bg-white dark:border-white dark:text-neutral-900' 
                              : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-550'
                          }`}
                        >
                          {t === 'matutino' ? 'Matutino' : t === 'noturno' ? 'Noturno' : 'Personalizado'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Entrada */}
                  <div className="space-y-1.5">
                    <span className="block text-[10px] font-bold text-neutral-500 uppercase">Entrada</span>
                    <input 
                      type="text" 
                      value={localForm.horaEntrada}
                      onChange={(e) => {
                        const val = maskTime(e.target.value);
                        setLocalForm(prev => {
                          const novoTurno = (prev.turno === 'matutino' && val === '06:00H' && prev.horaSaida === '14:20H') ? 'matutino' :
                                            (prev.turno === 'noturno' && val === '22:00H' && prev.horaSaida === '05:00H') ? 'noturno' : 'personalizado';
                          return { ...prev, horaEntrada: val, turno: novoTurno };
                        });
                      }}
                      className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm font-semibold outline-none text-neutral-900 dark:text-neutral-100 focus:border-neutral-900 dark:focus:border-neutral-300"
                      placeholder="Ex: 07:00H"
                    />
                  </div>

                  {/* Botão de Carta de Apresentação */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-neutral-550 dark:text-neutral-400 uppercase cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={usarAPartirDe}
                        onChange={(e) => setUsarAPartirDe(e.target.checked)}
                        className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span>Usar "A partir de"</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateLetter}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-850 py-2.5 text-xs font-bold text-neutral-700 dark:text-neutral-300 transition cursor-pointer shadow-xs"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-neutral-500" />
                      Gerar Carta de Apresentação
                    </button>
                  </div>

                  {/* Saída */}
                  <div className="space-y-1.5">
                    <span className="block text-[10px] font-bold text-neutral-550 uppercase">Saída</span>
                    <input 
                      type="text" 
                      value={localForm.horaSaida}
                      onChange={(e) => {
                        const val = maskTime(e.target.value);
                        setLocalForm(prev => {
                          const novoTurno = (prev.turno === 'matutino' && prev.horaEntrada === '06:00H' && val === '14:20H') ? 'matutino' :
                                            (prev.turno === 'noturno' && prev.horaEntrada === '22:00H' && val === '05:00H') ? 'noturno' : 'personalizado';
                          return { ...prev, horaSaida: val, turno: novoTurno };
                        });
                      }}
                      className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm font-semibold outline-none text-neutral-900 dark:text-neutral-100 focus:border-neutral-900 dark:focus:border-neutral-300"
                      placeholder="Ex: 16:00H"
                    />
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={handleCopyAndOpenMaps} 
                  className={`flex items-center justify-center gap-2 w-full rounded-xl py-3.5 text-sm font-bold transition shadow-md cursor-pointer ${
                    copied 
                      ? 'bg-emerald-600 dark:bg-emerald-500 text-white' 
                      : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:opacity-90'
                  }`}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Roteiro Copiado!' : 'Copiar Roteiro para WhatsApp'}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Rodapé com botões de Ação */}
        {/* Rodapé com botões de Ação */}
        <div className="flex justify-between items-center p-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 shrink-0">
          <div>
            {hasExistingAgendamento && onClear && (
              <button
                type="button"
                onClick={onClear}
                className="px-5 py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-bold text-red-650 hover:text-red-750 transition-colors cursor-pointer"
              >
                Limpar Agendamento
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="agendamento-form"
              className="px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-bold hover:bg-neutral-800 dark:hover:opacity-90 transition-colors cursor-pointer"
            >
              Salvar Roteiro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
