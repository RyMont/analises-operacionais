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
import type { Usuario } from './UsuariosTable';
import FormField from '../ui/form-field';
import SearchableSelect from '../ui/searchable-select';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface UsuarioFormModalProps {
  usuario: Usuario | null;
  currentUsername: string;
  onClose: () => void;
  onSaveSuccess: () => void;
}

/**
 * Modal de formulário para criação e edição de usuários.
 * 
 * Por que existe: Centraliza os estados e envios de cadastro/edição de usuários,
 * utilizando um único objeto de estado (formData) para otimizar a legibilidade.
 */
export default function UsuarioFormModal({
  usuario,
  currentUsername,
  onClose,
  onSaveSuccess,
}: UsuarioFormModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  // Estado agrupado para os campos do formulário
  const [formData, setFormData] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    is_active: true,
    role: 'administrador',
  });

  // Por que existe: Controla a visibilidade da senha no formulário de criação/edição de usuário.
  const [showPassword, setShowPassword] = useState(false);
  // Estados locais de controle de envio e erro
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Inicializa os campos quando o modal abre (para criação ou edição)
  useEffect(() => {
    if (usuario) {
      let mappedRole = 'administrador';
      if (usuario.role === 'Gestão') {
        mappedRole = 'gestao';
      } else if (usuario.role === 'Aprendiz') {
        mappedRole = 'aprendiz';
      }
      setFormData({
        username: usuario.username,
        first_name: usuario.first_name || '',
        last_name: usuario.last_name || '',
        email: usuario.email || '',
        password: '', // Senha inicia vazia para edição
        is_active: usuario.is_active,
        role: mappedRole,
      });
    } else {
      setFormData({
        username: '',
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        is_active: true,
        role: 'administrador',
      });
    }
    setErrorMsg(null);
  }, [usuario]);

  // Atualizador genérico para os campos do formulário
  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Função responsável por enviar o payload de cadastro/edição ao backend
  const handleSaveUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setActionLoading(true);

    if (!formData.username.trim()) {
      setErrorMsg('O nome de usuário é obrigatório.');
      setActionLoading(false);
      return;
    }

    if (!usuario && !formData.password.trim()) {
      setErrorMsg('A senha é obrigatória para novos usuários.');
      setActionLoading(false);
      return;
    }

    const payload: any = {
      username: formData.username.trim(),
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      email: formData.email.trim(),
      is_active: formData.is_active,
      role: formData.role,
    };

    if (formData.password.trim()) {
      payload.password = formData.password;
    }

    try {
      if (usuario) {
        // Envia PATCH para atualizar os dados cadastrais
        const res = await api.patch(`/usuarios/${usuario.id}/`, payload);
        if (res.data.success) {
          toast.success('Usuário atualizado com sucesso!');
          onSaveSuccess();
        } else {
          setErrorMsg(res.data.error || 'Erro ao atualizar usuário.');
        }
      } else {
        // Envia POST para cadastrar novo administrador
        const res = await api.post('/usuarios/novo/', payload);
        if (res.data.success) {
          toast.success('Usuário cadastrado com sucesso!');
          onSaveSuccess();
        } else {
          setErrorMsg(res.data.error || 'Erro ao cadastrar usuário.');
        }
      }
    } catch (err: any) {
      console.error('Erro ao salvar usuário:', err);
      const errors = err.response?.data?.errors;
      const directError = err.response?.data?.error;

      if (directError) {
        setErrorMsg(directError);
      } else if (errors) {
        setErrorMsg(Object.values(errors).flat().join(' '));
      } else {
        setErrorMsg('Erro de comunicação com o servidor backend.');
      }
      toast.error('Erro ao salvar usuário.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
          <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
            {usuario ? 'Editar Usuário' : 'Cadastrar Novo Usuário'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulário do Modal */}
        <form onSubmit={handleSaveUsuario} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-md text-xs flex gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1.5">
              Usuário *
            </label>
            <InputGroup className="w-full">
              <InputGroupAddon align="inline-start">
                <User className="h-4 w-4 text-neutral-450" />
              </InputGroupAddon>
              <InputGroupInput
                type="text"
                required
                value={formData.username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange('username', e.target.value)
                }
                placeholder="Ex: joao.silva"
                disabled={usuario !== null} // Usuário não pode mudar o username após criação
              />
            </InputGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Nome"
              value={formData.first_name}
              onChange={(val) => handleChange('first_name', val)}
              placeholder="Ex: João"
            />
            <FormField
              label="Sobrenome"
              value={formData.last_name}
              onChange={(val) => handleChange('last_name', val)}
              placeholder="Ex: Silva"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1.5">
              Email
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
                placeholder="Ex: joao@empresa.com"
              />
            </InputGroup>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1.5">
              Papel (Role)
            </label>
            <SearchableSelect
              options={[
                { value: 'administrador', label: 'Administrador' },
                { value: 'gestao', label: 'Gestão' },
                { value: 'aprendiz', label: 'Aprendiz' },
              ]}
              value={formData.role}
              onChange={(val) => handleChange('role', val)}
              disabled={usuario !== null && usuario.username === currentUsername}
              placeholder="Selecione o papel..."
            />
            {usuario !== null && usuario.username === currentUsername && (
              <p className="text-[10px] text-neutral-400 mt-1">
                Você não pode alterar o seu próprio papel de acesso.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1.5">
              Senha {usuario && '(Opcional — Preencha para redefinir)'}
            </label>
            <InputGroup className="w-full">
              <InputGroupAddon align="inline-start">
                <Lock className="h-4 w-4 text-neutral-450" />
              </InputGroupAddon>
              <InputGroupInput
                type={showPassword ? 'text' : 'password'}
                required={!usuario}
                value={formData.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange('password', e.target.value)
                }
                placeholder={usuario ? 'Nova senha' : 'Senha de acesso'}
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

          {usuario && (
            <div className="flex items-center gap-2.5 pt-2">
              <input
                type="checkbox"
                id="user_active"
                checked={formData.is_active}
                onChange={(e) => handleChange('is_active', e.target.checked)}
                disabled={usuario.username === currentUsername} // Não deixa o usuário desativar a si próprio
                className="rounded border-neutral-200 dark:border-neutral-800 text-primary focus:ring-primary h-4 w-4 disabled:opacity-50"
              />
              <label
                htmlFor="user_active"
                className={`text-sm select-none ${
                  usuario.username === currentUsername
                    ? 'text-neutral-400'
                    : 'text-neutral-700'
                }`}
              >
                Usuário Ativo{' '}
                {usuario.username === currentUsername &&
                  '(Você não pode desativar seu próprio acesso)'}
              </label>
            </div>
          )}

          {/* Ações do Modal */}
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-full text-xs font-bold text-neutral-700 dark:text-neutral-300 text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 shadow-xs disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Usuário
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
