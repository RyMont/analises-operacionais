import { Link } from 'react-router-dom';
import { 
  Store, 
  Users, 
  Clock, 
  ArrowRight,
  Layers,
  TrendingUp,
  Database,
  CalendarCheck,
  Coins,
  CircleDollarSign,
  TrendingDown,
  AlertOctagon,
  Map,
  CalendarDays
} from 'lucide-react';

interface DashboardProps {
  permissions?: Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }>;
}

/**
 * Página de Início da Plataforma (Painel Principal).
 * 
 * Por que existe: Serve como a tela de boas-vindas inicial para o usuário logado,
 * fornecendo um panorama geral da plataforma com atalhos para todas as seções
 * administrativas da plataforma de auditorias de turnover e headcount.
 */
export default function Dashboard({ permissions }: DashboardProps) {
  // Lista estática com todas as opções de recursos da plataforma
  const cards = [
    {
      title: 'Gerenciamento de Lojas',
      description: 'Cadastre e gerencie filiais, informações de endereço, coordenadores e supervisores.',
      path: '/lojas',
      icon: Store,
    },
    {
      title: 'Mapa de Lojas',
      description: 'Visualize a localização geográfica de todas as lojas e filiais ativas no mapa.',
      path: '/lojas/mapa',
      icon: Map,
    },
    {
      title: 'Agenda de Apoio (Limpeza)',
      description: 'Cadastre lançamentos operacionais de serviços de limpeza e acompanhe a agenda de escalas.',
      path: '/agenda',
      icon: CalendarCheck,
    },
    {
      title: 'Histórico de Limpeza',
      description: 'Consulte o histórico detalhado de todas as agendas de apoio e limpezas realizadas.',
      path: '/agenda/historico',
      icon: CalendarDays,
    },
    {
      title: 'Base de Colaboradores',
      description: 'Visualize listagens de colaboradores ativos e demitidos, com informações salariais e contratuais.',
      path: '/colaboradores',
      icon: Users,
    },
    {
      title: 'Términos de Experiência',
      description: 'Acompanhe os prazos de vencimento dos contratos de experiência para tomadas de decisão.',
      path: '/terminos',
      icon: Clock,
    },
    {
      title: 'Testes de Promoção',
      description: 'Controle o fluxo mensal de testes de promoção e avaliações práticas de auxiliares e operadores.',
      path: '/testes',
      icon: Users,
    },
    {
      title: 'Análise de Ausências',
      description: 'Monitore faltas, atestados e suspensões por colaborador, loja ou região em tempo real.',
      path: '/ausencias',
      icon: AlertOctagon,
    },
    {
      title: 'Escopos Mensais',
      description: 'Defina o quadro planejado de funcionários por loja, cargos e turnos com estimativa orçamentária.',
      path: '/escopos',
      icon: Layers,
    },
    {
      title: 'Raio-X de Custos',
      description: 'Compare em tempo real os custos orçados (escopo) com os custos reais (folha de pagamento SRD).',
      path: '/comparativo',
      icon: TrendingUp,
    },
    {
      title: 'Auditoria de Headcount',
      description: 'Monitore e compare o quadro planejado de funcionários (escopo) com o headcount real alocado na Gestão de Pessoas.',
      path: '/headcount',
      icon: Users,
    },
    {
      title: 'Painel de Diárias',
      description: 'Acompanhe o desempenho, custos e conciliação de diárias operacionais nas filiais.',
      path: '/diarias',
      icon: CalendarCheck,
    },
    {
      title: 'Painel de Prêmios',
      description: 'Monitore as premiações pagas, tipos de pedidos e faça a auditoria financeira.',
      path: '/premios',
      icon: Coins,
    },
    {
      title: 'Painel de Turnover',
      description: 'Monitore os motivos de desligamento da equipe, a evolução mensal e o ranking de lojas com mais saídas.',
      path: '/turnover',
      icon: TrendingDown,
    },
    {
      title: 'Salários de Dissídios',
      description: 'Configure e gerencie salários base por cargo e por estado (UF) para auditar desvios de folha.',
      path: '/salarios',
      icon: CircleDollarSign,
    },
    {
      title: 'Central de Importações',
      description: 'Realize o upload dos arquivos SRA (TOTVS), SRD (Folha) e planilhas de Gestão de Pessoas.',
      path: '/importacoes',
      icon: Database,
    },
    {
      title: 'Controle de Usuários',
      description: 'Gerencie os usuários do sistema, permissões de acesso e perfis administrativos.',
      path: '/usuarios',
      icon: Users,
    },
  ];

  // Filtra os atalhos exibidos na página inicial com base no objeto de permissões do usuário
  const filteredCards = cards.filter(card => {
    if (!permissions) return false;

    // Mapeamento dos caminhos das rotas para as chaves correspondentes de permissão
    const pathMap: Record<string, string> = {
      '/lojas': 'lojas',
      '/lojas/mapa': 'lojas',
      '/agenda': 'apoio',
      '/agenda/historico': 'apoio',
      '/colaboradores': 'colaboradores',
      '/terminos': 'colaboradores',
      '/testes': 'testes_promocao',
      '/ausencias': 'ausencias',
      '/escopos': 'escopos',
      '/comparativo': 'comparativo',
      '/headcount': 'headcount',
      '/diarias': 'diarias',
      '/premios': 'premios',
      '/turnover': 'turnover',
      '/salarios': 'salarios',
      '/importacoes': 'importacoes',
      '/usuarios': 'usuarios',
    };

    const modulo = pathMap[card.path];
    if (modulo) {
      return permissions[modulo]?.view === true;
    }
    return true; // Se for alguma rota livre ou não mapeada
  });

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Cards de Atalho */}
      <div>
        <h2 className="text-lg font-bold mb-6 text-neutral-800 dark:text-neutral-200 tracking-tight">
          Acesso Rápido aos Recursos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.path}
                to={card.path}
                className="flex flex-col justify-between p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-all duration-300 group shadow-xs hover:shadow-md hover:border-primary/40"
              >
                <div>
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 inline-block text-primary mb-4 shadow-2xs group-hover:bg-primary group-hover:text-white transition-all duration-300">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-bold mb-2 text-neutral-800 dark:text-neutral-100 tracking-tight group-hover:text-primary transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-neutral-500 dark:text-neutral-400 text-xs leading-relaxed mb-6">
                    {card.description}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary group-hover:gap-2.5 transition-all mt-auto pt-2">
                  <span>Acessar Painel</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
