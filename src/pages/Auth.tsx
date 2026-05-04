import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import MatrixRain from "@/components/landing/MatrixRain";
import GlitchText from "@/components/landing/GlitchText";
import { matrixThemeStyle } from "@/lib/matrix-theme";

export default function Auth() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate("/dashboard", { replace: true });
  }, [session, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
    else navigate("/dashboard");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Cadastro recebido! Aguardando aprovação do administrador.");
  };

  return (
    <main className="matrix-theme min-h-screen bg-background text-foreground relative overflow-hidden flex items-center justify-center px-4">
      <style>{matrixThemeStyle}</style>
      <MatrixRain />
      {/* Overlay escurecedor + glow orbs */}
      <div className="fixed inset-0 z-[1] bg-background/80 pointer-events-none" />
      <div className="fixed top-0 left-0 w-full h-[40vh] bg-gradient-to-b from-primary/10 to-transparent z-[2] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-full h-[30vh] bg-gradient-to-t from-primary/10 to-transparent z-[2] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border-2 border-primary/40 bg-card/70 backdrop-blur-xl p-8 shadow-[0_0_60px_hsl(var(--primary)/0.2)]">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black font-mono tracking-[0.15em]">
              <GlitchText>MATRIX PRO</GlitchText>
            </h1>
            <p className="text-sm text-muted-foreground mt-3">
              Acesse sua conta para continuar
            </p>
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full mb-6 bg-background/40 border border-primary/20">
              <TabsTrigger
                value="signin"
                className="font-mono uppercase tracking-wider text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="font-mono uppercase tracking-wider text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
              >
                Cadastrar
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-5">
                <FieldEmail value={email} onChange={setEmail} id="email-in" />
                <FieldPassword value={password} onChange={setPassword} id="pw-in" />
                <Button
                  type="submit"
                  disabled={loading}
                  variant="outline"
                  className="w-full h-12 border-2 border-primary text-primary hover:bg-primary/15 hover:text-primary font-mono font-bold uppercase tracking-[0.2em] shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                >
                  {loading ? "Entrando…" : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-5">
                <FieldEmail value={email} onChange={setEmail} id="email-up" />
                <FieldPassword value={password} onChange={setPassword} id="pw-up" minLength={6} />
                <Button
                  type="submit"
                  disabled={loading}
                  variant="outline"
                  className="w-full h-12 border-2 border-primary text-primary hover:bg-primary/15 hover:text-primary font-mono font-bold uppercase tracking-[0.2em] shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                >
                  {loading ? "Criando…" : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-8 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
            Conectar <span className="text-primary">·</span> Despertar{" "}
            <span className="text-primary">·</span> Evoluir
          </div>
        </div>

        <div className="mt-6 text-center text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground/70">
          Matrix Pro — System v2.0
        </div>
      </div>
    </main>
  );
}

function FieldEmail({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-xs font-mono font-bold uppercase tracking-wider text-primary"
      >
        Email
      </label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70 pointer-events-none" />
        <Input
          id={id}
          type="email"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 pl-10 bg-background/60 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/40 font-mono"
          placeholder="seu@email.com"
          autoComplete="email"
        />
      </div>
    </div>
  );
}

function FieldPassword({
  value,
  onChange,
  id,
  minLength,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
  minLength?: number;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-xs font-mono font-bold uppercase tracking-wider text-primary"
      >
        Senha
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70 pointer-events-none" />
        <Input
          id={id}
          type="password"
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 pl-10 bg-background/60 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/40 font-mono tracking-widest"
          placeholder="••••••••••"
          autoComplete="current-password"
        />
      </div>
    </div>
  );
}
