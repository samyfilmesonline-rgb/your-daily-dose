import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Lock, Loader2, ShieldCheck, User, Phone, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import MatrixRain from "@/components/landing/MatrixRain";
import GlitchText from "@/components/landing/GlitchText";
import { matrixThemeStyle } from "@/lib/matrix-theme";
import AvatarPicker, { AvatarSelection } from "@/components/ativar/AvatarPicker";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

type ChargeInfo = {
  email: string;
  nome: string;
  whatsapp: string;
};

export default function Ativar() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ChargeInfo | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [avatar, setAvatar] = useState<AvatarSelection>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!token) {
        setError("Token de ativação ausente.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("pix_charges")
        .select("customer_email, customer_name, customer_whatsapp, status")
        .eq("activation_token", token)
        .maybeSingle();
      if (cancel) return;
      if (error || !data) {
        setError("Link inválido ou expirado.");
      } else if (data.status !== "paid") {
        setError("Pagamento ainda não confirmado.");
      } else {
        setInfo({
          email: data.customer_email ?? "",
          nome: data.customer_name ?? "",
          whatsapp: data.customer_whatsapp ?? "",
        });
        setNome(data.customer_name ?? "");
        setWhatsapp(data.customer_whatsapp ?? "");
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [token]);

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  }, [password]);

  const canNext1 = nome.trim().length >= 2;
  const canNext2 = !!avatar;
  const canSubmit =
    password.length >= 8 && password === confirm && canNext1 && canNext2;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        activationToken: token,
        password,
        nome: nome.trim(),
        whatsapp: whatsapp.trim() || null,
      };
      if (avatar?.type === "preset") {
        payload.avatarPreset = avatar.url;
      } else if (avatar?.type === "upload") {
        payload.avatarBase64 = avatar.base64;
        payload.avatarMime = avatar.mime;
      }
      const { data, error } = await supabase.functions.invoke("ativar-conta", {
        body: payload,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha na ativação");

      // Login automático
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: data.email as string,
        password,
      });
      if (loginErr) {
        toast.success("Conta ativada! Faça login para continuar.");
        navigate("/auth", { replace: true });
        return;
      }
      toast.success("Bem-vindo à Matrix, operador.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao ativar";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="matrix-theme min-h-screen bg-background text-foreground relative overflow-hidden flex items-center justify-center px-4 py-10">
      <style>{matrixThemeStyle}</style>
      <MatrixRain />
      <div className="fixed inset-0 z-[1] bg-background/85 pointer-events-none" />
      <div className="fixed top-0 left-0 w-full h-[40vh] bg-gradient-to-b from-primary/10 to-transparent z-[2] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-full h-[30vh] bg-gradient-to-t from-primary/10 to-transparent z-[2] pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-primary font-mono text-sm">
            <Loader2 className="w-6 h-6 animate-spin" />
            CONECTANDO À MATRIX...
          </div>
        ) : error ? (
          <div className="rounded-2xl border-2 border-destructive/50 bg-card/70 backdrop-blur-xl p-8 text-center">
            <h1 className="font-mono text-xl text-destructive mb-2">ACESSO NEGADO</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              className="mt-6 border-primary/40 text-primary"
              onClick={() => navigate("/vendas")}
            >
              Voltar à página de vendas
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-primary/40 bg-card/70 backdrop-blur-xl p-6 sm:p-8 shadow-[0_0_60px_hsl(var(--primary)/0.2)]">
            <div className="text-center mb-6">
              <h1 className="text-3xl sm:text-4xl font-black font-mono tracking-[0.15em]">
                <GlitchText>MATRIX PRO</GlitchText>
              </h1>
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-[0.25em] mt-2">
                Ativação · Operador {info?.email && `· ${info.email}`}
              </p>
            </div>

            <StepIndicator step={step} />

            {step === 1 && (
              <div className="space-y-5">
                <SectionTitle text="[01/03] IDENTIFICAÇÃO" />
                <Field label="Email" icon={<Mail className="w-4 h-4" />}>
                  <Input
                    value={info?.email ?? ""}
                    readOnly
                    className="h-11 pl-10 bg-background/40 border-primary/20 font-mono text-muted-foreground"
                  />
                </Field>
                <Field label="Nome do operador" icon={<User className="w-4 h-4" />}>
                  <Input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Como você quer ser chamado"
                    className="h-11 pl-10 bg-background/60 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/40 font-mono"
                  />
                </Field>
                <Field label="WhatsApp" icon={<Phone className="w-4 h-4" />}>
                  <Input
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="h-11 pl-10 bg-background/60 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/40 font-mono"
                  />
                </Field>
                <NavButtons
                  onNext={() => setStep(2)}
                  nextDisabled={!canNext1}
                  nextLabel="Continuar"
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <SectionTitle text="[02/03] ESCOLHA SEU AVATAR" />
                <p className="text-xs text-muted-foreground font-mono">
                  Selecione uma máscara da galeria ou importe sua própria foto.
                </p>
                <AvatarPicker value={avatar} onChange={setAvatar} />
                <NavButtons
                  onBack={() => setStep(1)}
                  onNext={() => setStep(3)}
                  nextDisabled={!canNext2}
                  nextLabel="Continuar"
                />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <SectionTitle text="[03/03] CHAVE DE ACESSO" />
                <Field label="Senha" icon={<Lock className="w-4 h-4" />}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    placeholder="Mínimo 8 caracteres"
                    className="h-11 pl-10 bg-background/60 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/40 font-mono tracking-widest"
                  />
                </Field>
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 h-1.5 rounded-full transition-all",
                        i < passwordStrength
                          ? "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                          : "bg-primary/15"
                      )}
                    />
                  ))}
                </div>
                <Field label="Confirmar senha" icon={<ShieldCheck className="w-4 h-4" />}>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={8}
                    placeholder="Repita a senha"
                    className="h-11 pl-10 bg-background/60 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/40 font-mono tracking-widest"
                  />
                </Field>
                {confirm && confirm !== password && (
                  <p className="text-xs text-destructive font-mono">
                    As senhas não coincidem.
                  </p>
                )}
                <NavButtons
                  onBack={() => setStep(2)}
                  onNext={submit}
                  nextDisabled={!canSubmit || submitting}
                  nextLabel={submitting ? "INICIANDO..." : "INICIAR SISTEMA"}
                  loading={submitting}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={cn(
            "h-1.5 rounded-full transition-all",
            n === step ? "w-10 bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)]" : "w-6 bg-primary/20"
          )}
        />
      ))}
    </div>
  );
}

function SectionTitle({ text }: { text: string }) {
  return (
    <div className="text-xs font-mono font-bold uppercase tracking-[0.25em] text-primary border-l-2 border-primary pl-3">
      {text}
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/70 pointer-events-none">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextDisabled,
  nextLabel,
  loading,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel: string;
  loading?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-2">
      {onBack && (
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="h-11 border-primary/30 text-primary hover:bg-primary/10 font-mono uppercase tracking-wider text-xs"
        >
          Voltar
        </Button>
      )}
      <Button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        variant="outline"
        className="flex-1 h-11 border-2 border-primary text-primary hover:bg-primary/15 hover:text-primary font-mono font-bold uppercase tracking-[0.2em] shadow-[0_0_20px_hsl(var(--primary)/0.3)] disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <ArrowRight className="w-4 h-4 mr-2" />
        )}
        {nextLabel}
      </Button>
    </div>
  );
}
