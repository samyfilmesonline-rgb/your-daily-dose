import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import Vendas from "./pages/Vendas.tsx";
import Ativar from "./pages/Ativar.tsx";
import DashboardLayout from "./components/dashboard/DashboardLayout.tsx";
import Overview from "./pages/dashboard/Overview.tsx";
import Accounts from "./pages/dashboard/Accounts.tsx";
import Workspaces from "./pages/dashboard/Workspaces.tsx";
import Users from "./pages/dashboard/Users.tsx";
import Partners from "./pages/dashboard/Partners.tsx";
import Licenses from "./pages/dashboard/Licenses.tsx";
import Loja from "./pages/dashboard/Loja.tsx";
import MinhaConta from "./pages/dashboard/MinhaConta.tsx";
import Atualizacoes from "./pages/dashboard/Atualizacoes.tsx";
import ProtectedRoute from "./components/auth/ProtectedRoute.tsx";
import AdminRoute from "./components/auth/AdminRoute.tsx";
import ActivePartnerRoute from "./components/auth/ActivePartnerRoute.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
          <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/vendas" element={<Vendas />} />
          <Route path="/ativar" element={<Ativar />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Overview />} />
            <Route path="loja" element={<Loja />} />
            <Route path="minha-conta" element={<MinhaConta />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="workspaces" element={<Workspaces />} />
            <Route path="licencas" element={<ActivePartnerRoute><Licenses /></ActivePartnerRoute>} />
            <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
            <Route path="parceiros" element={<AdminRoute><Partners /></AdminRoute>} />
            <Route path="atualizacoes" element={<AdminRoute><Atualizacoes /></AdminRoute>} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
          </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
