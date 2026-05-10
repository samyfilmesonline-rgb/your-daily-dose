import { LayoutDashboard, Users as UsersIcon, Boxes, Shield, Handshake, KeyRound, ShoppingBag, UserCircle, Package, Bot, Coins, Activity, Receipt, CalendarClock, type LucideIcon } from "lucide-react";

export type TabVisibility =
  | "always"
  | "partnerOrAdmin"
  | "adminOrActivePartner"
  | "adminOnly";

export type SidebarTab = {
  key: string;
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
  defaultVisibility: TabVisibility;
  /** se true, não aparece no painel de permissões do admin (sempre visível) */
  alwaysOn?: boolean;
};

/**
 * Catálogo único de abas do sidebar.
 * Para adicionar uma nova aba: registre-a aqui. Ela aparecerá automaticamente
 * no painel de permissões do admin (Usuários → botão Permissões).
 */
export const SIDEBAR_TABS: SidebarTab[] = [
  {
    key: "overview",
    title: "Visão geral",
    url: "/dashboard",
    icon: LayoutDashboard,
    end: true,
    defaultVisibility: "always",
    alwaysOn: true,
  },
  {
    key: "minha-conta",
    title: "Minha Conta",
    url: "/dashboard/minha-conta",
    icon: UserCircle,
    defaultVisibility: "always",
    alwaysOn: true,
  },
  {
    key: "loja",
    title: "Loja",
    url: "/dashboard/loja",
    icon: ShoppingBag,
    defaultVisibility: "always",
    alwaysOn: true,
  },
  {
    key: "accounts",
    title: "Clientes",
    url: "/dashboard/accounts",
    icon: UsersIcon,
    defaultVisibility: "partnerOrAdmin",
  },
  {
    key: "workspaces",
    title: "Workspaces",
    url: "/dashboard/workspaces",
    icon: Boxes,
    defaultVisibility: "partnerOrAdmin",
  },
  {
    key: "licencas",
    title: "Licenças",
    url: "/dashboard/licencas",
    icon: KeyRound,
    defaultVisibility: "adminOrActivePartner",
  },
  {
    key: "parceiros",
    title: "Parceiros",
    url: "/dashboard/parceiros",
    icon: Handshake,
    defaultVisibility: "adminOnly",
  },
  {
    key: "users",
    title: "Usuários",
    url: "/dashboard/users",
    icon: Shield,
    defaultVisibility: "adminOnly",
  },
  {
    key: "atualizacoes",
    title: "Atualizações",
    url: "/dashboard/atualizacoes",
    icon: Package,
    defaultVisibility: "adminOnly",
  },
  {
    key: "bots",
    title: "Bots de Farm",
    url: "/dashboard/bots",
    icon: Bot,
    defaultVisibility: "adminOrActivePartner",
  },
  {
    key: "pacotes",
    title: "Pacotes",
    url: "/dashboard/pacotes",
    icon: Coins,
    defaultVisibility: "adminOrActivePartner",
  },
  {
    key: "pedidos",
    title: "Pedidos",
    url: "/dashboard/pedidos",
    icon: Activity,
    defaultVisibility: "adminOrActivePartner",
  },
  {
    key: "programacoes",
    title: "Programações",
    url: "/dashboard/programacoes",
    icon: CalendarClock,
    defaultVisibility: "adminOrActivePartner",
  },
  {
    key: "checkout",
    title: "Checkout",
    url: "/dashboard/checkout",
    icon: Receipt,
    defaultVisibility: "adminOnly",
  },
];

export type TabAccessContext = {
  isAdmin: boolean;
  isActivePartner: boolean;
  tabPermissions: Set<string>;
};

export function canAccessTab(tab: SidebarTab, ctx: TabAccessContext): boolean {
  if (tab.alwaysOn) return true;
  if (ctx.isAdmin) return true;
  return ctx.tabPermissions.has(tab.key);
}

export function getTabByKey(key: string): SidebarTab | undefined {
  return SIDEBAR_TABS.find((t) => t.key === key);
}