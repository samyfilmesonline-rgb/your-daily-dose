import { useEffect, useMemo, useRef, useState } from "react";
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
      {/* Overlay escurecedor + glow orbs flutuantes */}
      <div className="fixed inset-0 z-[1] bg-background/70 pointer-events-none" />
      <div className="fixed top-[10%] -left-32 w-[420px] h-[420px] rounded-full bg-primary/15 blur-[120px] z-[2] pointer-events-none animate-float-orb" />
      <div
        className="fixed bottom-[5%] -right-32 w-[480px] h-[480px] rounded-full bg-primary/10 blur-[140px] z-[2] pointer-events-none animate-float-orb"
        style={{ animationDelay: "-6s" }}
      />
      {/* Scanline horizontal */}
      <div className="fixed inset-0 z-[3] pointer-events-none overflow-hidden">
        <div className="absolute left-0 right-0 h-24 bg-gradient-to-b from-transparent via-primary/10 to-transparent animate-scanline" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-scale-in">
        <div className="scan-border rounded-2xl border-2 border-primary/40 bg-card/70 backdrop-blur-xl p-8 animate-pulse-glow">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black font-mono tracking-[0.15em] animate-fade-in-up" style={{ animationDelay: "120ms" }}>
              <GlitchText>MATRIX PRO</GlitchText>
            </h1>
            <p className="text-sm text-muted-foreground mt-3 animate-fade-in-up" style={{ animationDelay: "240ms" }}>
              Acesse sua conta para continuar
            </p>
          </div>

          <Tabs defaultValue="signin" className="animate-fade-in-up" style={{ animationDelay: "340ms" }}>
            <TabsList className="grid grid-cols-2 w-full mb-6 bg-background/40 border border-primary/20">
              <TabsTrigger
                value="signin"
                className="font-mono uppercase tracking-wider text-xs transition-all duration-300 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-2px_0_0_hsl(var(--primary)),0_0_18px_-6px_hsl(var(--primary))]"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="font-mono uppercase tracking-wider text-xs transition-all duration-300 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-2px_0_0_hsl(var(--primary)),0_0_18px_-6px_hsl(var(--primary))]"
              >
                Cadastrar
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-5">
                <FieldEmail value={email} onChange={setEmail} id="email-in" />
                <FieldPassword value={password} onChange={setPassword} id="pw-in" />
                <MatrixSubmit loading={loading} label="Entrar" loadingLabel="Entrando" />
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-5">
                <FieldEmail value={email} onChange={setEmail} id="email-up" />
                <FieldPassword value={password} onChange={setPassword} id="pw-up" minLength={6} />
                <MatrixSubmit loading={loading} label="Criar conta" loadingLabel="Criando" />
              </form>
            </TabsContent>
          </Tabs>

          <div
            className="mt-8 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground animate-fade-in-up"
            style={{ animationDelay: "460ms" }}
          >
            <span className="inline-block animate-pulse [animation-duration:2.4s]">Conectar</span>
            <span className="text-primary mx-2">·</span>
            <span className="inline-block animate-pulse [animation-duration:2.4s] [animation-delay:0.6s]">Despertar</span>
            <span className="text-primary mx-2">·</span>
            <span className="inline-block animate-pulse [animation-duration:2.4s] [animation-delay:1.2s]">Evoluir</span>
          </div>
        </div>

        <div className="mt-6 text-center text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground/70 animate-fade-in-up" style={{ animationDelay: "560ms" }}>
          Matrix Pro — System v2.0
        </div>
      </div>
    </main>
  );
}

const KATAKANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789".split("");

function MatrixSubmit({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  const [decoded, setDecoded] = useState(loadingLabel);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!loading) {
      setDecoded(loadingLabel);
      return;
    }
    let i = 0;
    const tick = () => {
      i++;
      const scrambled = loadingLabel
        .split("")
        .map((ch, idx) => {
          if (ch === " ") return " ";
          if (idx < Math.floor(i / 4) % (loadingLabel.length + 4)) return ch;
          return KATAKANA[Math.floor(Math.random() * KATAKANA.length)];
        })
        .join("");
      setDecoded(scrambled + "…");
      frameRef.current = window.setTimeout(tick, 70) as unknown as number;
    };
    tick();
    return () => {
      if (frameRef.current) clearTimeout(frameRef.current);
    };
  }, [loading, loadingLabel]);

  return (
    <Button
      type="submit"
      disabled={loading}
      variant="outline"
      className="group relative w-full h-12 overflow-hidden border-2 border-primary text-primary hover:bg-primary/15 hover:text-primary font-mono font-bold uppercase tracking-[0.2em] shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-transform active:scale-[0.98]"
    >
      <span className="shimmer-overlay" aria-hidden />
      <span className="relative">{loading ? decoded : label}</span>
    </Button>
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
    <div className="space-y-2 group">
      <label
        htmlFor={id}
        className="block text-xs font-mono font-bold uppercase tracking-wider text-primary"
      >
        Email
      </label>
      <FieldShell>
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70 pointer-events-none transition-all duration-300 group-focus-within:text-primary group-focus-within:drop-shadow-[0_0_6px_hsl(var(--primary))]" />
        <Input
          id={id}
          type="email"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 pl-10 bg-background/60 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/40 focus-visible:shadow-[0_0_18px_-4px_hsl(var(--primary))] transition-all duration-300 font-mono"
          placeholder="seu@email.com"
          autoComplete="email"
        />
      </FieldShell>
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
    <div className="space-y-2 group">
      <label
        htmlFor={id}
        className="block text-xs font-mono font-bold uppercase tracking-wider text-primary"
      >
        Senha
      </label>
      <FieldShell>
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70 pointer-events-none transition-all duration-300 group-focus-within:text-primary group-focus-within:drop-shadow-[0_0_6px_hsl(var(--primary))]" />
        <Input
          id={id}
          type="password"
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 pl-10 bg-background/60 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/40 focus-visible:shadow-[0_0_18px_-4px_hsl(var(--primary))] transition-all duration-300 font-mono tracking-widest"
          placeholder="••••••••••"
          autoComplete="current-password"
        />
      </FieldShell>
    </div>
  );
}

function FieldShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      {/* Underline scan ao focar */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 bottom-0 h-[2px] origin-left scale-x-0 bg-gradient-to-r from-transparent via-primary to-transparent transition-transform duration-500 group-focus-within:scale-x-100"
      />
    </div>
  );
}
