import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import GlitchText from "@/components/landing/GlitchText";
import EditProfileDialog from "@/components/dashboard/minha-conta/EditProfileDialog";
import ChangePasswordDialog from "@/components/dashboard/minha-conta/ChangePasswordDialog";
import { Coins, Copy, KeyRound, LogOut, ShoppingBag, UserCog, Crown, ShieldCheck, Clock } from "lucide-react";
import { toast } from "sonner";

function MatrixCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative backdrop-blur-md bg-card/50 border border-primary/30 rounded-2xl transition-all duration-500 hover:border-primary/60 hover:shadow-[0_0_40px_hsl(var(--primary)/0.15)] ${className}`}
    >
      {children}
    </div>
  );
}

export default function MinhaConta() {
  const { user, profile, parceiro, isAdmin, isActivePartner, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const displayName = profile?.nome || user?.email?.split("@")[0] || "Operador";
  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const limite = Number(parceiro?.limite_creditos) || 0;
  const usados = Number(parceiro?.creditos_consumidos) || 0;
  const disponiveis = Math.max(0, limite - usados);
  const pct = limite > 0 ? Math.min(100, (usados / limite) * 100) : 0;
  const barColor = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary";

  const roleBadge = isAdmin
    ? { label: "ADMIN", icon: Crown, cls: "bg-primary/20 text-primary border-primary/40" }
    : isActivePartner
    ? { label: "PARCEIRO ATIVO", icon: ShieldCheck, cls: "bg-primary/15 text-primary border-primary/40" }
    : parceiro?.status === "pendente"
    ? { label: "PARCEIRO PENDENTE", icon: Clock, cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" }
    : parceiro?.status === "suspenso"
    ? { label: "PARCEIRO SUSPENSO", icon: Clock, cls: "bg-destructive/15 text-destructive border-destructive/40" }
    : { label: "USUÁRIO", icon: ShieldCheck, cls: "bg-muted/40 text-muted-foreground border-muted/40" };

  const copyId = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id);
    toast.success("ID copiado.");
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-primary/70 mb-1">
          // operador
        </div>
        <GlitchText className="text-3xl font-bold text-foreground">MINHA CONTA</GlitchText>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Gerencie seus dados, avatar e visualize seus créditos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Perfil */}
        <MatrixCard className="p-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" />
              <Avatar className="relative h-32 w-32 border-2 border-primary shadow-[0_0_30px_hsl(var(--primary)/0.5)]">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
                <AvatarFallback className="bg-primary/20 text-primary font-mono text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="space-y-1">
              <GlitchText className="text-2xl font-bold text-foreground">{displayName}</GlitchText>
              <p className="text-xs font-mono text-muted-foreground">{user?.email}</p>
              {profile?.whatsapp && (
                <p className="text-xs font-mono text-muted-foreground">{profile.whatsapp}</p>
              )}
            </div>
            <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${roleBadge.cls}`}>
              <roleBadge.icon className="w-3 h-3 mr-1" /> {roleBadge.label}
            </Badge>
            <div className="flex gap-2 w-full pt-2">
              <Button onClick={() => setEditOpen(true)} className="flex-1" variant="default">
                <UserCog className="w-4 h-4 mr-2" /> Editar perfil
              </Button>
              <Button onClick={() => setPwdOpen(true)} variant="outline" className="flex-1 border-primary/40">
                <KeyRound className="w-4 h-4 mr-2" /> Senha
              </Button>
            </div>
          </div>
        </MatrixCard>

        {/* Créditos */}
        <MatrixCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-primary/70">
              Créditos disponíveis
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center">
              <Coins className="h-5 w-5 text-primary" />
            </div>
          </div>

          {parceiro ? (
            <>
              <div className="text-5xl font-bold font-mono text-primary mb-1">
                {disponiveis.toLocaleString("pt-BR")}
              </div>
              <p className="text-xs font-mono text-muted-foreground mb-4">
                {usados.toLocaleString("pt-BR")} usados de {limite.toLocaleString("pt-BR")}
              </p>
              <div className="h-2 bg-muted/40 rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full ${barColor} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <Button asChild className="w-full">
                <Link to="/dashboard/loja">
                  <ShoppingBag className="w-4 h-4 mr-2" /> Comprar mais créditos
                </Link>
              </Button>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono text-muted-foreground mb-2">
                Sem licença ativa
              </div>
              <p className="text-xs font-mono text-muted-foreground mb-4">
                Adquira um pacote de créditos para começar a farmar.
              </p>
              <Button asChild className="w-full">
                <Link to="/dashboard/loja">
                  <ShoppingBag className="w-4 h-4 mr-2" /> Ir para a loja
                </Link>
              </Button>
            </>
          )}
        </MatrixCard>
      </div>

      {/* Conta */}
      <MatrixCard className="p-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-primary/70 mb-4">
          // dados da conta
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              Conta criada em
            </div>
            <div className="font-mono text-sm">
              {profile?.criado_em
                ? new Date(profile.criado_em).toLocaleDateString("pt-BR")
                : "—"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              ID do usuário
            </div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs bg-muted/30 px-2 py-1 rounded border border-primary/20 truncate flex-1">
                {user?.id}
              </code>
              <Button size="icon" variant="ghost" onClick={copyId} className="h-7 w-7">
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-primary/20">
          <Button
            variant="outline"
            onClick={() => signOut()}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sair da conta
          </Button>
        </div>
      </MatrixCard>

      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />
      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  );
}