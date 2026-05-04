import { useEffect, useMemo, useState } from "react";
import { Activity, Ban, CalendarClock, KeyRound, Plus, RefreshCw, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import LicenseFormDialog from "@/components/dashboard/licenses/LicenseFormDialog";
import LicenseRowActions from "@/components/dashboard/licenses/LicenseRowActions";
import { AppLicense, daysUntil, friendlySupabaseError, normalizeStatus, planNameFromCode } from "@/lib/licenses";
import { useAuth } from "@/hooks/useAuth";

const statusLabel = {
  ativo: "Ativa",
  pendente: "Pendente",
  bloqueado: "Bloqueada",
  expirado: "Expirada",
};

const statusClass = {
  ativo: "border-primary/40 bg-primary/15 text-primary",
  pendente: "border-border bg-secondary text-secondary-foreground",
  bloqueado: "border-destructive/40 bg-destructive/15 text-destructive",
  expirado: "border-muted bg-muted text-muted-foreground",
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function Licenses() {
  const { viewAs } = useAuth();
  const [items, setItems] = useState<AppLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<AppLicense | null>(null);

  const load = async () => {
    setLoading(true);
    let query = supabase.from("app_licenses").select("*").order("created_at", { ascending: false });
    if (viewAs) query = query.eq("partner_id", viewAs);
    const { data, error } = await query;
    if (error) {
      toast.error(friendlySupabaseError(error));
      setItems([]);
    } else {
      setItems((data as AppLicense[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [viewAs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((license) => {
      const normalized = normalizeStatus(license);
      const matchesStatus = status === "todos" || normalized === status;
      const matchesSearch = !q || [license.customer_name, license.customer_email, license.plan_name, license.partner_name]
        .some((value) => (value ?? "").toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [items, search, status]);

  const stats = useMemo(() => ({
    active: items.filter((license) => normalizeStatus(license) === "ativo").length,
    blocked: items.filter((license) => normalizeStatus(license) === "bloqueado").length,
    expiring: items.filter((license) => {
      const days = daysUntil(license.expires_at);
      return normalizeStatus(license) === "ativo" && days !== null && days >= 0 && days <= 7;
    }).length,
    total: new Set(items.map((license) => license.customer_email.toLowerCase())).size,
  }), [items]);

  const openNew = () => {
    setEditing(null);
    setOpenForm(true);
  };

  const openEdit = (license: AppLicense) => {
    setEditing(license);
    setOpenForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border neon-border cyber-grid">
        <div className="p-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary/80">
              <KeyRound className="h-3.5 w-3.5" /> Licenças • Desktop
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-2">
              <span className="neon-text">Licenças</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Gerencie acessos do app desktop por cliente, plano, expiração e máquinas ativadas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Nova licença
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card"><CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0"><CardTitle className="text-sm font-medium text-muted-foreground">Ativas</CardTitle><KeyRound className="h-4 w-4 text-primary" /></CardHeader><CardContent><div className="text-3xl font-semibold tracking-tight">{stats.active}</div></CardContent></Card>
        <Card className="glass-card"><CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0"><CardTitle className="text-sm font-medium text-muted-foreground">Bloqueadas</CardTitle><Ban className="h-4 w-4 text-destructive" /></CardHeader><CardContent><div className="text-3xl font-semibold tracking-tight">{stats.blocked}</div></CardContent></Card>
        <Card className="glass-card"><CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0"><CardTitle className="text-sm font-medium text-muted-foreground">Expirando em 7d</CardTitle><CalendarClock className="h-4 w-4 text-primary" /></CardHeader><CardContent><div className="text-3xl font-semibold tracking-tight">{stats.expiring}</div></CardContent></Card>
        <Card className="glass-card"><CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0"><CardTitle className="text-sm font-medium text-muted-foreground">Total clientes</CardTitle><Users className="h-4 w-4 text-primary" /></CardHeader><CardContent><div className="text-3xl font-semibold tracking-tight">{stats.total}</div></CardContent></Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Lista de licenças</CardTitle>
              <CardDescription>Busque por cliente, e-mail, plano ou parceiro</CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="relative w-full sm:w-80">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativo">Ativas</SelectItem>
                  <SelectItem value="bloqueado">Bloqueadas</SelectItem>
                  <SelectItem value="expirado">Expiradas</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Expiração</TableHead>
                  <TableHead>Máquinas</TableHead>
                  <TableHead>Última atividade</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
                {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma licença encontrada.</TableCell></TableRow>}
                {filtered.map((license) => {
                  const normalized = normalizeStatus(license);
                  const machines = license.machine_hashes?.length || (license.machine_hash ? 1 : 0);
                  const days = daysUntil(license.expires_at);
                  return (
                    <TableRow key={license.id}>
                      <TableCell>
                        <div className="leading-tight">
                          <div className="font-medium">{license.customer_name || <span className="text-muted-foreground italic">(sem nome)</span>}</div>
                          <div className="text-xs text-muted-foreground font-mono">{license.customer_email}</div>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={statusClass[normalized]}>{statusLabel[normalized]}</Badge></TableCell>
                      <TableCell>{license.plan_name || planNameFromCode(license.plan_code)}</TableCell>
                      <TableCell>
                        <div className="leading-tight">
                          <div>{formatDate(license.expires_at)}</div>
                          {days !== null && <div className="text-xs text-muted-foreground">{days < 0 ? "expirada" : `${days} dia(s)`}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{machines} / {license.max_machines}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(license.last_seen_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(license.created_at)}</TableCell>
                      <TableCell className="text-right"><LicenseRowActions license={license} onEdit={openEdit} onChanged={load} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <LicenseFormDialog open={openForm} onOpenChange={setOpenForm} license={editing} onSaved={load} />
    </div>
  );
}
