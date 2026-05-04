import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Ban, LogOut } from "lucide-react";

export default function PartnerGate({ children }: { children: ReactNode }) {
  const { parceiro, isAdmin, loading, signOut, user } = useAuth();

  if (loading) return null;
  // Admins sempre passam
  if (isAdmin) return <>{children}</>;
  // Sem registro de parceiro ainda (criação assíncrona): trata como pendente
  const status = parceiro?.status ?? "pendente";

  if (status === "ativo") return <>{children}</>;

  const isPendente = status === "pendente";
  return (
    <main className="min-h-[80vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            {isPendente ? (
              <Clock className="h-5 w-5 text-amber-500" />
            ) : (
              <Ban className="h-5 w-5 text-destructive" />
            )}
            <CardTitle className="text-xl">
              {isPendente ? "Aguardando aprovação" : "Conta suspensa"}
            </CardTitle>
          </div>
          <CardDescription>
            {isPendente
              ? "Seu cadastro foi recebido. Você terá acesso ao painel assim que o administrador aprovar sua conta."
              : "Sua conta foi suspensa ou atingiu o limite de créditos. Entre em contato com o administrador para reativá-la."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground font-mono">{user?.email}</div>
          {!isPendente && parceiro && (
            <div className="text-sm">
              Créditos consumidos: <strong>{Number(parceiro.creditos_consumidos).toLocaleString("pt-BR")}</strong> / {Number(parceiro.limite_creditos).toLocaleString("pt-BR")}
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={() => signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}