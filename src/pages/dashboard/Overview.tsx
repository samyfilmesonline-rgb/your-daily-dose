import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, CalendarDays, Activity } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Conta = {
  id: string;
  nome: string | null;
  email_lovable: string;
  criado_em: string | null;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Overview() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("contas_lovable")
        .select("id,nome,email_lovable,criado_em")
        .order("criado_em", { ascending: false });
      setContas(data ?? []);
      setLoading(false);
    })();
  }, []);

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
    { label: "Hoje", value: stats.today, icon: Activity },
    { label: "Últimos 7 dias", value: stats.week, icon: TrendingUp },
    { label: "Este mês", value: stats.month, icon: CalendarDays },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o crescimento dos seus clientes em tempo real.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {k.label}
              </CardTitle>
              <k.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tracking-tight">
                {loading ? "—" : k.value.toLocaleString("pt-BR")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes adicionados — últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {contas.slice(0, 5).map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between text-sm">
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
        </CardContent>
      </Card>
    </div>
  );
}