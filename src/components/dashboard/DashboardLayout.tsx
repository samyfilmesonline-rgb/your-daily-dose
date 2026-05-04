import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import PartnerGate from "@/components/auth/PartnerGate";
import ViewAsBanner from "./ViewAsBanner";
import QuotaBadge from "./QuotaBadge";
import MatrixRain from "@/components/landing/MatrixRain";
import { matrixThemeStyle } from "@/lib/matrix-theme";

export default function DashboardLayout() {
  return (
    <div className="matrix-theme min-h-screen bg-background text-foreground relative overflow-x-hidden">
      <style>{matrixThemeStyle}</style>
      <MatrixRain />
      {/* Overlay escurecedor + glow orbs */}
      <div className="fixed inset-0 z-[1] bg-background/85 pointer-events-none" />
      <div className="fixed top-0 left-0 w-full h-[40vh] bg-gradient-to-b from-primary/10 to-transparent z-[2] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-full h-[30vh] bg-gradient-to-t from-primary/10 to-transparent z-[2] pointer-events-none" />

      <SidebarProvider>
        <div className="relative z-10 min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 flex items-center gap-3 border-b border-primary/20 bg-background/60 backdrop-blur px-4 sticky top-0 z-20">
              <SidebarTrigger className="text-primary hover:text-primary" />
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-primary/80">
                Painel · Matrix Admin
              </div>
              <div className="ml-auto flex items-center gap-3">
                <QuotaBadge />
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
    </div>
  );
}
