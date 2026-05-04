import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import PartnerGate from "@/components/auth/PartnerGate";
import ViewAsBanner from "./ViewAsBanner";
import QuotaBadge from "./QuotaBadge";

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/20">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center gap-3 border-b bg-background px-4">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground">Painel administrativo</div>
            <div className="ml-auto flex items-center gap-3">
              <QuotaBadge />
              <ThemeToggle />
            </div>
          </header>
          <ViewAsBanner />
          <main className="flex-1 p-6">
            <PartnerGate>
              <Outlet />
            </PartnerGate>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}