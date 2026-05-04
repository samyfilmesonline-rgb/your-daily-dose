import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Users, CalendarDays, Boxes, Coins, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import GlitchText from "@/components/landing/GlitchText";

// Wrappers de card no estilo Matrix (referência: matrix-farm Dashboard).
function MatrixCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative backdrop-blur-md bg-card/50 border border-primary/30 rounded-2xl transition-all duration-500 hover:border-primary/60 hover:shadow-[0_0_40px_hsl(var(--primary)/0.15)] ${className}`}
    >
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <MatrixCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
            {label}
          </p>
          <p className="text-3xl font-bold text-foreground font-mono">
            {loading ? "—" : value.toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </MatrixCard>
  );
}

type Conta = {
  id: string;
  nome: string | null;
  email_lovable: string;
  criado_em: string | null;
};

type ResumoWS = {
  id: string;
  workspace_nome: string;
  email_lovable: string;
  total_execucoes: number;
  total_creditos_farmados: number;
  ultima_execucao_status: string | null;
  atualizado_em: string;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Overview() {
  const { viewAs } = useAuth();
  const [contas, setContas] = useState<Conta[]>([]);
  const [workspaces, setWorkspaces] = useState<ResumoWS[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let cQ = supabase.from("contas_lovable").select("id,nome,email_lovable,criado_em").order("criado_em", { ascending: false });
      let wQ = supabase
        .from("resumo_lovable_workspace")
        .select("id,workspace_nome,email_lovable,total_execucoes,total_creditos_farmados,ultima_execucao_status,atualizado_em")
        .order("atualizado_em", { ascending: false });
      if (viewAs) {
        cQ = cQ.eq("id_do_usuario", viewAs);
        wQ = wQ.eq("id_do_usuario", viewAs);
      }
      const [c, w] = await Promise.all([cQ, wQ]);
      setContas(c.data ?? []);
      setWorkspaces((w.data as ResumoWS[]) ?? []);
      setLoading(false);
    })();
  }, [viewAs]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now).getTime();
    const weekAgo = today - 6 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let t = 0,
      w = 0,
      m = 0;
    contas.forEach((c) => {
      if (!c.criado_em) return;
      const ts = new Date(c.criado_em).getTime();
      if (ts >= today) t++;
      if (ts >= weekAgo) w++;
      if (ts >= monthStart) m++;
    });
    return { total: contas.length, today: t, week: w, month: m };
  }, [contas]);

  const wsStats = useMemo(() => {
    const total = workspaces.length;
    const execucoes = workspaces.reduce((s, w) => s + (Number(w.total_execucoes) || 0), 0);
    const creditos = workspaces.reduce((s, w) => s + (Number(w.total_creditos_farmados) || 0), 0);
    return { total, execucoes, creditos };
  }, [workspaces]);

  const contasByEmail = useMemo(() => {
    const m = new Map<string, Conta>();
    contas.forEach((c) => m.set(c.email_lovable.toLowerCase(), c));
    return m;
  }, [contas]);

  const chartData = useMemo(() => {
    const days: { date: string; label: string; total: number }[] = [];
    const now = startOfDay(new Date());
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        total: 0,
      });
    }
    const map = new Map(days.map((d) => [d.date, d]));
    contas.forEach((c) => {
      if (!c.criado_em) return;
      const k = new Date(c.criado_em).toISOString().slice(0, 10);
      const item = map.get(k);
      if (item) item.total += 1;
    });
    return days;
  }, [contas]);

  const kpis = [
    { label: "Total de clientes", value: stats.total, icon: Users },
    { label: "Workspaces", value: wsStats.total, icon: Boxes },
    { label: "Execuções totais", value: wsStats.execucoes, icon: TrendingUp },
    { label: "Créditos farmados", value: wsStats.creditos, icon: Coins },
    { label: "Clientes este mês", value: stats.month, icon: CalendarDays },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold font-mono tracking-tight">
          <GlitchText>VISÃO GERAL</GlitchText>
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Acompanhe o crescimento dos seus clientes em tempo real.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard
            key={k.label}
            label={k.label}
            value={k.value}
            icon={k.icon}
            loading={loading}
          />
        ))}
      </div>

      <MatrixCard>
        <div className="p-5 border-b border-primary/15">
          <h3 className="text-sm font-mono uppercase tracking-wider text-primary/90">
            Clientes adicionados — últimos 30 dias
          </h3>
        </div>
        <div className="p-5">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#cf)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </MatrixCard>

      <MatrixCard>
        <div className="p-5 border-b border-primary/15">
          <h3 className="text-sm font-mono uppercase tracking-wider text-primary/90">
            Clientes recentes
          </h3>
        </div>
        <div className="p-5">
          <ul className="divide-y divide-primary/10">
            {contas.slice(0, 5).map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between text-sm hover:bg-primary/5 -mx-2 px-2 rounded">
                <span className="font-medium truncate">{c.nome ?? c.email_lovable}</span>
                <span className="text-muted-foreground">
                  {c.criado_em ? new Date(c.criado_em).toLocaleString("pt-BR") : "—"}
                </span>
              </li>
            ))}
            {!loading && contas.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground text-center">
                Nenhum cliente cadastrado ainda.
              </li>
            )}
          </ul>
        </div>
      </MatrixCard>

      <MatrixCard>
        <div className="p-5 border-b border-primary/15 flex flex-row items-center justify-between">
          <h3 className="text-sm font-mono uppercase tracking-wider text-primary/90">
            Workspaces recentes
          </h3>
          <Link to="/dashboard/workspaces" className="text-xs text-primary hover:underline font-mono uppercase tracking-wider">
            Ver todos
          </Link>
        </div>
        <div className="p-5">
          <ul className="divide-y divide-primary/10">
            {workspaces.slice(0, 5).map((w) => {
              const conta = contasByEmail.get(w.email_lovable.toLowerCase());
              const variant =
                (w.ultima_execucao_status === "concluido" || w.ultima_execucao_status === "sucesso") ? "default" :
                (w.ultima_execucao_status === "erro" || w.ultima_execucao_status === "falha") ? "destructive" : "secondary";
              const label =
                w.ultima_execucao_status === "concluido" || w.ultima_execucao_status === "sucesso" ? "Sucesso" :
                w.ultima_execucao_status === "erro" || w.ultima_execucao_status === "falha" ? "Falha" :
                w.ultima_execucao_status === "limite" ? "Limite" :
                w.ultima_execucao_status === "em_andamento" ? "Em andamento" :
                (w.ultima_execucao_status ?? "—");
              return (
                <li key={w.id} className="py-3 flex items-center justify-between text-sm gap-3 hover:bg-primary/5 -mx-2 px-2 rounded">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{w.workspace_nome}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {conta?.nome ?? w.email_lovable}
                    </div>
                  </div>
                  <Badge variant={variant as any}>{label}</Badge>
                </li>
              );
            })}
            {!loading && workspaces.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground text-center">
                Nenhum workspace registrado ainda.
              </li>
            )}
          </ul>
        </div>
      </MatrixCard>
    </div>
  );
}