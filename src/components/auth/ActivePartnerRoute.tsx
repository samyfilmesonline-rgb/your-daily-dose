import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function ActivePartnerRoute({ children }: { children: ReactNode }) {
  const { loading, session, isAdmin, parceiro } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (isAdmin || parceiro?.status === "ativo") return <>{children}</>;

  return (
    <main className="min-h-[70vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-xl">Cadastro de parceiro inativo</CardTitle>
          </div>
          <CardDescription>
            Seu cadastro de parceiro ainda não está ativo. Aguarde a aprovação do administrador para gerenciar licenças.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </main>
  );
}