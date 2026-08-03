import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Store, 
  Users, 
  CalendarCheck, 
  Layers, 
  TrendingUp, 
  TrendingDown,
  Coins, 
  Database, 
  Save, 
  Loader2, 
  Info,
  CircleDollarSign,
  AlertOctagon,
  Plus,
  X
import api from '../../api/client';
import { toast } from 'sonner';
import SearchableSelect from '../ui/searchable-select';

interface PermissionItem {
  id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface RoleData {
  id: string;
  name: string;
  permissions: PermissionItem[];
}

// Mapeamento amigável para exibição dos módulos
const MODULE_CONFIG: Record<string, { label: string; icon: any; desc: string }> = {
  dashboard: { label: 'Início (Dashboard)', icon: LayoutDashboard, desc: 'Visualização de gráficos e resumos gerais' },
  lojas: { label: 'Lojas', icon: Store, desc: 'Gerenciamento de unidades e regras operacionais' },
  apoio: { label: 'Apoio (Limpeza)', icon: CalendarCheck, desc: 'Lançamentos de agenda e histórico de limpeza' },
  colaboradores: { label: 'Colaboradores', icon: Users, desc: 'Base de funcionários e acompanhamento de términos de exp.' },
  turnover: { label: 'Turnover', icon: TrendingDown, desc: 'Análise de turnover e motivos de demissão da equipe' },
  escopos: { label: 'Escopos', icon: Layers, desc: 'Visualização e definição dos escopos de atendimento' },
  comparativo: { label: 'Raio-X (Comparativo)', icon: TrendingUp, desc: 'Relatório comparativo de indicadores por loja' },
  headcount: { label: 'Headcount', icon: Users, desc: 'Quadro de lotação e metas de pessoal por unidade' },
  diarias: { label: 'Diárias', icon: CalendarCheck, desc: 'Controle de custos e lançamentos de diárias extras' },
  premios: { label: 'Prêmios', icon: Coins, desc: 'Apuramento de prêmios mensais e relatórios formatados' },
  importacoes: { label: 'Importações', icon: Database, desc: 'Upload de planilhas para consolidação de dados' },
  usuarios: { label: 'Usuários & Permissões', icon: Users, desc: 'Controle de acessos e configurações de usuários' },
  salarios: { label: 'Salários de Dissídios', icon: CircleDollarSign, desc: 'Configuração de salários base por cargo e região (UF)' },
  testes_promocao: { label: 'Testes de Promoção', icon: Users, desc: 'Controle de testes de promoção e acompanhamento mensal' },
  ausencias: { label: 'Análise de Ausências', icon: AlertOctagon, desc: 'Auditoria de faltas, atestados e suspensões' },
};

/**
 * Componente de Gerenciamento Visual de Permissões.
 * 
 * Por que existe: Fornece aos administradores uma visualização do tipo matriz (grid)
 * para definir dinamicamente as permissões de visualizar, criar, editar e excluir
 * de cada grupo/role do sistema (ex: Administrador, Gestão), eliminando a necessidade
 * de configurações manuais em código.
 */
export default function PermissoesAcesso() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [localPermissions, setLocalPermissions] = useState<PermissionItem[]>([]);

  // States for New Role Modal
  const [showNewRoleModal, setShowNewRoleModal] = useState<boolean>(false);
  const [newRoleName, setNewRoleName] = useState<string>('');
  const [creatingRole, setCreatingRole] = useState<boolean>(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  // Busca as roles e as permissões de cada uma do backend
  const fetchRoles = async () => {
    setLoading(true);
    try {
      const response = await api.get('/usuarios/api/roles/');
      setRoles(response.data || []);
      if (response.data && response.data.length > 0) {
        // Seleciona a primeira role por padrão
        setSelectedRoleId(response.data[0].id);
        setLocalPermissions(JSON.parse(JSON.stringify(response.data[0].permissions)));
      }
    } catch (error) {
      console.error('Erro ao buscar roles e permissões:', error);
      toast.error('Não foi possível carregar a matriz de permissões.');
    } finally {
      setLoading(false);
    }
  };

  // Alterna a role selecionada e carrega as permissões dela para o estado local
  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
    const role = roles.find(r => r.id === roleId);
    if (role) {
      setLocalPermissions(JSON.parse(JSON.stringify(role.permissions)));
    }
  };

  // Atualiza uma permissão específica localmente no estado
  const handleCheckboxChange = (moduleName: string, field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete') => {
    setLocalPermissions(prev => 
      prev.map(perm => {
        if (perm.module === moduleName) {
          const updated = { ...perm, [field]: !perm[field] };
          
          // Se desmarcar "Visualizar", desmarca automaticamente as ações de escrita por lógica
          if (field === 'can_view' && !updated.can_view) {
            updated.can_create = false;
            updated.can_edit = false;
            updated.can_delete = false;
          }
          
          // Se marcar "Criar", "Editar" ou "Excluir", ativa automaticamente "Visualizar" por coerência
          if ((field === 'can_create' || field === 'can_edit' || field === 'can_delete') && updated[field]) {
            updated.can_view = true;
          }
          
          return updated;
        }
        return perm;
      })
    );
  };

  // Salva as permissões da role atual no backend
  const handleSave = async () => {
    const role = roles.find(r => r.id === selectedRoleId);
    if (!role) return;

    setSaving(true);
    try {
      const response = await api.put(`/usuarios/api/roles/${selectedRoleId}/permissions/`, {
        permissions: localPermissions
      });
      if (response.data.success) {
        toast.success(`Permissões do grupo ${role.name} atualizadas com sucesso!`);
        
        // Atualiza a lista geral de roles em memória para refletir a nova realidade
        setRoles(prev => 
          prev.map(r => r.id === selectedRoleId ? { ...r, permissions: localPermissions } : r)
        );
      }
    } catch (error) {
      console.error('Erro ao salvar permissões:', error);
      toast.error('Erro ao tentar salvar as permissões.');
    } finally {
      setSaving(false);
    }
  };

  // Handler para criar nova Role
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) {
      toast.error('O nome da função é obrigatório.');
      return;
    }
    setCreatingRole(true);
    try {
      const response = await api.post('/usuarios/api/roles/nova/', { name: newRoleName });
      if (response.data.success) {
        toast.success(`Função ${response.data.name} criada com sucesso!`);
        setShowNewRoleModal(false);
        setNewRoleName('');
        // Recarrega as roles para incluir a nova e define como selecionada
        fetchRoles().then(() => {
          setSelectedRoleId(response.data.id);
        });
      }
    } catch (error: any) {
      console.error('Erro ao criar função:', error);
      toast.error(error.response?.data?.error || 'Erro ao tentar criar a função.');
    } finally {
      setCreatingRole(false);
    }
  };

  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const isAdministradorRole = selectedRole?.name?.toLowerCase() === 'administrador';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-neutral-500">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-900 dark:text-white" />
        <span className="text-sm">Carregando permissões de acesso...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra superior de seleção da Role */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl">
        <div className="space-y-1">
          <label htmlFor="role-select" className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Função (Role) de Acesso
          </label>
          <div className="flex items-center gap-2">
            <div className="w-full sm:w-64">
              <SearchableSelect
                options={roles.map((role) => ({ value: role.id, label: role.name }))}
                value={selectedRoleId}
                onChange={handleRoleChange}
                placeholder="Selecione a função..."
              />
            </div>
            <button
              onClick={() => setShowNewRoleModal(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer h-full"
              title="Criar Nova Função"
            >
              <Plus className="h-4 w-4" />
              Nova
            </button>
          </div>
        </div>

        {/* Botão de salvar no topo para facilitar */}
        <button
          onClick={handleSave}
          disabled={saving || isAdministradorRole}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Salvar Configurações
            </>
          )}
        </button>
      </div>

      {/* Alerta de aviso sobre privilégios de Administrador */}
      {isAdministradorRole && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 rounded-2xl text-xs flex gap-3 items-center">
          <Info className="h-5 w-5 text-amber-500 shrink-0" />
          <span>
            <strong>Aviso:</strong> A função de <strong>Administrador</strong> possui privilégios de acesso completo
            garantidos e bloqueados por padrão no servidor para evitar perda de acessos ou lockout do sistema.
          </span>
        </div>
      )}

      {/* Matriz de Permissões em Tabela */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                <th className="py-4 px-6 min-w-[280px]">Módulo do Sistema</th>
                <th className="py-4 px-4 text-center">Visualizar</th>
                <th className="py-4 px-4 text-center">Cadastrar</th>
                <th className="py-4 px-4 text-center">Editar</th>
                <th className="py-4 px-4 text-center">Excluir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-sm">
              {localPermissions.map((perm) => {
                const config = MODULE_CONFIG[perm.module] || { 
                  label: perm.module.toUpperCase(), 
                  icon: LayoutDashboard, 
                  desc: 'Módulo do sistema' 
                };
                const IconComponent = config.icon;

                return (
                  <tr key={perm.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/20 transition-colors">
                    {/* Descrição do Módulo */}
                    <td className="py-4 px-6 flex items-start gap-4">
                      <div className="p-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-lg shrink-0">
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="font-semibold text-neutral-850 dark:text-neutral-100">{config.label}</div>
                        <div className="text-[11px] text-neutral-450 leading-tight">{config.desc}</div>
                      </div>
                    </td>

                    {/* Checkbox can_view */}
                    <td className="py-4 px-4 text-center">
                      <label className="inline-flex items-center justify-center p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={perm.can_view}
                          disabled={isAdministradorRole || saving}
                          onChange={() => handleCheckboxChange(perm.module, 'can_view')}
                          className="h-4 w-4 rounded-sm border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer disabled:opacity-50"
                        />
                      </label>
                    </td>

                    {/* Checkbox can_create */}
                    <td className="py-4 px-4 text-center">
                      <label className="inline-flex items-center justify-center p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={perm.can_create}
                          disabled={isAdministradorRole || saving}
                          onChange={() => handleCheckboxChange(perm.module, 'can_create')}
                          className="h-4 w-4 rounded-sm border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer disabled:opacity-50"
                        />
                      </label>
                    </td>

                    {/* Checkbox can_edit */}
                    <td className="py-4 px-4 text-center">
                      <label className="inline-flex items-center justify-center p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={perm.can_edit}
                          disabled={isAdministradorRole || saving}
                          onChange={() => handleCheckboxChange(perm.module, 'can_edit')}
                          className="h-4 w-4 rounded-sm border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer disabled:opacity-50"
                        />
                      </label>
                    </td>

                    {/* Checkbox can_delete */}
                    <td className="py-4 px-4 text-center">
                      <label className="inline-flex items-center justify-center p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={perm.can_delete}
                          disabled={isAdministradorRole || saving}
                          onChange={() => handleCheckboxChange(perm.module, 'can_delete')}
                          className="h-4 w-4 rounded-sm border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer disabled:opacity-50"
                        />
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Nova Role */}
      {showNewRoleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
              <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">Criar Nova Função</h3>
              <button
                type="button"
                onClick={() => setShowNewRoleModal(false)}
                className="p-1 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </div>
            
            <form onSubmit={handleCreateRole} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-450 uppercase tracking-wider block">Nome da Função *</label>
                <input
                  type="text"
                  required
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Ex: Supervisor, Operador..."
                  className="w-full px-4 py-2.5 text-sm bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-neutral-200 focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewRoleModal(false)}
                  className="px-5 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingRole || !newRoleName.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-bold hover:bg-neutral-800 dark:hover:opacity-90 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {creatingRole && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar Função
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
