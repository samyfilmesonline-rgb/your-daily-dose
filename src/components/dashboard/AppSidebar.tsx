import { LogOut, Crown } from "lucide-react";
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
import { SIDEBAR_TABS, canAccessTab } from "@/lib/sidebar-tabs";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { signOut, user, isAdmin, isActivePartner, tabPermissions } = useAuth();
  const items = SIDEBAR_TABS.filter((t) =>
    canAccessTab(t, { isAdmin, isActivePartner, tabPermissions })
  );

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-primary/20 bg-sidebar/80 backdrop-blur"
    >
      <SidebarHeader className="px-3 py-4 border-b border-primary/20">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-black shadow-[0_0_18px_hsl(var(--primary)/0.6)]">
            M
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-mono font-bold uppercase tracking-wider leading-none text-primary">
                Matrix Admin
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-1">
                Console
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono uppercase tracking-wider text-[10px] text-primary/70">
            Plataforma
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.end ? pathname === item.url : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={
                        active
                          ? "bg-primary/15 text-primary border-l-2 border-primary rounded-l-none data-[active=true]:bg-primary/15 data-[active=true]:text-primary"
                          : "text-foreground/80 hover:text-primary hover:bg-primary/10"
                      }
                    >
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
      <SidebarFooter className="px-3 py-3 border-t border-primary/20">
        {!collapsed && user?.email && (
          <div className="mb-2">
            <div className="text-xs font-mono text-muted-foreground truncate">
              {user.email}
            </div>
            {isAdmin && (
              <div className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-primary mt-1">
                <Crown className="h-3 w-3" /> Admin
              </div>
            )}
          </div>
        )}
        <SidebarMenuButton
          onClick={() => signOut()}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
