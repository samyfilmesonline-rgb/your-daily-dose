import { LayoutDashboard, Users, LogOut, Boxes, Shield, Crown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

const baseItems = [
  { title: "Visão geral", url: "/dashboard", icon: LayoutDashboard, end: true },
  { title: "Clientes", url: "/dashboard/accounts", icon: Users, end: false },
  { title: "Workspaces", url: "/dashboard/workspaces", icon: Boxes, end: false },
];
const adminItems = [
  { title: "Usuários", url: "/dashboard/users", icon: Shield, end: false },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { signOut, user, isAdmin } = useAuth();
  const items = isAdmin ? [...baseItems, ...adminItems] : baseItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-semibold">
            L
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-none">Lovable Admin</span>
              <span className="text-xs text-muted-foreground mt-1">Console</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.end ? pathname === item.url : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink to={item.url} end={item.end} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 py-3 border-t">
        {!collapsed && user?.email && (
          <div className="mb-2">
            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
            {isAdmin && (
              <div className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-primary mt-1">
                <Crown className="h-3 w-3" /> Admin
              </div>
            )}
          </div>
        )}
        <SidebarMenuButton onClick={() => signOut()} className="text-destructive">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}