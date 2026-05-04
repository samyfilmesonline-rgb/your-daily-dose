import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Shield, ShieldOff, Users as UsersIcon, Crown, RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import TabPermissionsDialog from "@/components/dashboard/users/TabPermissionsDialog";

type Profile = { id: string; email: string; criado_em: string };
type Role = { user_id: string; role: "admin" | "user" };

export default function Users() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [counts, setCounts] = useState<Record<string, { contas: number; ws: number }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [permTarget, setPermTarget] = useState<{ id: string; email: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [p, r, c, w] = await Promise.all([
      supabase.from("profiles").select("*").order("criado_em", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("contas_lovable").select("id_do_usuario"),
      supabase.from("execucoes_lovable").select("id_do_usuario"),
    ]);
    if (p.error) toast.error(p.error.message);
    setProfiles((p.data as Profile[]) ?? []);
    setRoles((r.data as Role[]) ?? []);
    const map: Record<string, { contas: number; ws: number }> = {};
    (c.data ?? []).forEach((x: any) => {
      map[x.id_do_usuario] = map[x.id_do_usuario] || { contas: 0, ws: 0 };
      map[x.id_do_usuario].contas++;
    });
    (w.data ?? []).forEach((x: any) => {
      map[x.id_do_usuario] = map[x.id_do_usuario] || { contas: 0, ws: 0 };
      map[x.id_do_usuario].ws++;
    });
    setCounts(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isAdminOf = useMemo(() => {
    const s = new Set(roles.filter((r) => r.role === "admin").map((r) => r.user_id));
    return s;
  }, [roles]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return profiles;
    return profiles.filter((p) => p.email.toLowerCase().includes(q));
  }, [profiles, search]);

  const stats = useMemo(() => {
    const monthAgo = Date.now() - 30 * 86400000;
    return {
      total: profiles.length,
      admins: isAdminOf.size,
      novos: profiles.filter((p) => new Date(p.criado_em).getTime() >= monthAgo).length,
    };
  }, [profiles, isAdminOf]);

  const toggleAdmin = async (userId: string, currentlyAdmin: boolean) => {
    if (userId === user?.id && currentlyAdmin) {
      return toast.error("Você não pode remover seu próprio acesso admin.");
    }
    if (currentlyAdmin) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Admin removido");
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (error) return toast.error(error.message);
      toast.success("Promovido a admin");
    }
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">Gerencie quem tem acesso administrativo ao CRM.</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de usuários</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Admins</CardTitle>
            <Crown className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold">{stats.admins}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Novos (30d)</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold">{stats.novos}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Lista de usuários</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por email" className="pl-9" />
            </div>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="text-center">Contas</TableHead>
                  <TableHead className="text-center">Workspaces</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum usuário encontrado.</TableCell></TableRow>
                )}
                {filtered.map((p) => {
                  const admin = isAdminOf.has(p.id);
                  const c = counts[p.id] ?? { contas: 0, ws: 0 };
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.criado_em).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {admin ? (
                          <Badge className="gap-1"><Crown className="h-3 w-3" /> Admin</Badge>
                        ) : (
                          <Badge variant="secondary">Usuário</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{c.contas}</TableCell>
                      <TableCell className="text-center">{c.ws}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPermTarget({ id: p.id, email: p.email })}
                          >
                            <SlidersHorizontal className="h-4 w-4 mr-1" /> Permissões
                          </Button>
                          <Button
                            size="sm"
                            variant={admin ? "outline" : "default"}
                            onClick={() => toggleAdmin(p.id, admin)}
                            disabled={admin && p.id === user?.id}
                          >
                            {admin ? (<><ShieldOff className="h-4 w-4 mr-1" /> Remover admin</>) : (<><Shield className="h-4 w-4 mr-1" /> Promover</>)}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <TabPermissionsDialog
        open={!!permTarget}
        onOpenChange={(v) => !v && setPermTarget(null)}
        userId={permTarget?.id ?? null}
        userEmail={permTarget?.email}
      />
    </div>
  );
}