import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Loader2, 
  AlertCircle, 
  User, 
  Mail, 
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../api/client';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton } from '../ui/input-group';
import FormField from '../ui/form-field';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface PerfilEditModalProps {
  onClose: () => void;
  onSaveSuccess: (newUsername: string, newEmail: string) => void;
}

/**
 * Modal de Edição de Perfil (PerfilEditModal).
 * 
 * Por que existe: Permite que qualquer usuário logado atualize suas próprias 
 * informações cadastrais (nome, sobrenome, email e senha com confirmação), 
 * mantendo o nome de usuário (username) fixo para integridade do sistema.
 */
export default function PerfilEditModal({
  onClose,
  onSaveSuccess,
}: PerfilEditModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  // Estado local para os dados do usuário atualmente logado
  const [userId, setUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
  });

  const [loadingUser, setLoadingUser] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  // Por que existe: Controla a visibilidade da nova senha digitada no formulário de edição de perfil.
  const [showPassword, setShowPassword] = useState(false);
  // Por que existe: Controla a visibilidade da confirmação da nova senha digitada no formulário de edição de perfil.
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Carrega os dados do perfil do usuário logado na montagem do modal
  useEffect(() => {
    const fetchMe = async () => {
      try {
        const response = await api.get('/usuarios/api/me/');
        if (response.data && response.data.authenticated && response.data.user) {
          const u = response.data.user;
          setUserId(u.id);
          setFormData({
            username: u.username,
            first_name: u.first_name || '',
            last_name: u.last_name || '',
            email: u.email || '',
            password: '',
            confirm_password: '',
          });
        } else {
          setErrorMsg('Não foi possível obter dados da sessão atual.');
        }
      } catch (err) {
        console.error('Erro ao buscar perfil atual:', err);
        setErrorMsg('Erro ao carregar as informações do seu perfil.');
      } finally {
        setLoadingUser(false);
      }
    };

    fetchMe();
  }, []);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Processa a validação local e envia o payload de atualização ao backend
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setActionLoading(true);

    if (!userId) {
      setErrorMsg('Identificador do usuário ausente.');
      setActionLoading(false);
      return;
    }

    // Se preencher a senha, exige a confirmação idêntica
    if (formData.password.trim()) {
      if (formData.password !== formData.confirm_password) {
        setErrorMsg('As senhas digitadas não coincidem.');
        setActionLoading(false);
        return;
      }
      if (formData.password.length < 4) {
        setErrorMsg('A nova senha deve possuir pelo menos 4 caracteres.');
        setActionLoading(false);
        return;
      }
    }

    const payload: any = {
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      email: formData.email.trim(),
    };

    if (formData.password.trim()) {
      payload.password = formData.password;
    }

    try {
      const res = await api.patch(`/usuarios/${userId}/`, payload);
      if (res.data.success) {
        toast.success('Suas informações de perfil foram atualizadas!');
        onSaveSuccess(res.data.usuario.username, res.data.usuario.email);
      } else {
        setErrorMsg(res.data.error || 'Erro ao atualizar informações.');
      }
    } catch (err: any) {
      console.error('Erro ao atualizar perfil:', err);
      const errors = err.response?.data?.errors;
      const directError = err.response?.data?.error;

      if (directError) {
        setErrorMsg(directError);
      } else if (errors) {
        setErrorMsg(Object.values(errors).flat().join(' '));
      } else {
        setErrorMsg('Erro de comunicação com o servidor backend.');
      }
      toast.error('Erro ao salvar as edições de perfil.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
          <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
            Minhas Informações
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadingUser ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-950 dark:text-white" />
            <span className="text-xs text-neutral-400">Buscando dados cadastrais...</span>
          </div>
        ) : (
          /* Formulário do Modal */
          <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-md text-xs flex gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase mb-1.5">
                Nome de Usuário (Não Editável)
              </label>
              <InputGroup className="w-full">
                <InputGroupAddon align="inline-start">
                  <User className="h-4 w-4 text-neutral-300" />
                </InputGroupAddon>
                <InputGroupInput
                  type="text"
                  value={formData.username}
                  disabled
                  placeholder="Seu usuário"
                />
              </InputGroup>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Nome"
                value={formData.first_name}
                onChange={(val) => handleChange('first_name', val)}
                placeholder="Ex: Guilherme"
              />
              <FormField
                label="Sobrenome"
                value={formData.last_name}
                onChange={(val) => handleChange('last_name', val)}
                placeholder="Ex: Satoru"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1.5">
                E-mail
              </label>
              <InputGroup className="w-full">
                <InputGroupAddon align="inline-start">
                  <Mail className="h-4 w-4 text-neutral-450" />
                </InputGroupAddon>
                <InputGroupInput
                  type="email"
                  value={formData.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange('email', e.target.value)
                  }
                  placeholder="seu.email@empresa.com"
                />
              </InputGroup>
            </div>

            <div className="border-t border-neutral-150 dark:border-neutral-800 my-4 pt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1.5">
                  Nova Senha (Opcional)
                </label>
                <InputGroup className="w-full">
                  <InputGroupAddon align="inline-start">
                    <Lock className="h-4 w-4 text-neutral-450" />
                  </InputGroupAddon>
                  <InputGroupInput
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleChange('password', e.target.value)
                    }
                    placeholder="Mínimo 4 caracteres"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="text-neutral-450 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1.5">
                  Confirmar Nova Senha
                </label>
                <InputGroup className="w-full">
                  <InputGroupAddon align="inline-start">
                    <Lock className="h-4 w-4 text-neutral-450" />
                  </InputGroupAddon>
                  <InputGroupInput
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirm_password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleChange('confirm_password', e.target.value)
                    }
                    placeholder="Redigite a nova senha"
                    disabled={!formData.password.trim()}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={!formData.password.trim()}
                      aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="text-neutral-450 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            </div>

            {/* Ações do Modal */}
            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-full text-xs font-semibold text-neutral-700 dark:text-neutral-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 shadow-xs disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Alterações
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
