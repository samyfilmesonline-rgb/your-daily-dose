import { useEffect, useMemo, useState } from "react";
import { Package, Plus, RefreshCw, Copy, Zap, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ReleaseFormDialog from "@/components/dashboard/atualizacoes/ReleaseFormDialog";
import ReleaseRowActions from "@/components/dashboard/atualizacoes/ReleaseRowActions";
import { AppRelease, compareSemver, formatBytes, friendlyError } from "@/lib/releases";

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function Atualizacoes() {
  const [items, setItems] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<AppRelease | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("app_releases").select("*").order("created_at", { ascending: false });
    if (error) { toast.error(friendlyError(error)); setItems([]); }
    else setItems((data as AppRelease[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const latestPublished = useMemo(() => {
    const pub = items.filter((r) => r.is_published);
    if (pub.length === 0) return null;
    return [...pub].sort((a, b) => compareSemver(b.version, a.version))[0];
  }, [items]);

  const openNew = () => { setEditing(null); setOpenForm(true); };
  const openEdit = (r: AppRelease) => { setEditing(r); setOpenForm(true); };

  const copyPayload = () => {
    if (!latestPublished) return;
    const payload = {
      update_available: true,
      mandatory: latestPublished.is_mandatory,
      latest_version: latestPublished.version,
      download_url: latestPublished.download_url,
      sha256: latestPublished.sha256,
      file_size_bytes: latestPublished.file_size_bytes,
      changelog: latestPublished.changelog,
      published_at: latestPublished.published_at,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success("Payload copiado");
  };

  const testEdgeFn = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("app-version-check?current=0.0.0", { method: "GET" } as never);
      if (error) throw error;
      console.log("[app-version-check]", data);
      toast.success(`OK — latest: v${(data as { latest_version?: string })?.latest_version ?? "-"} (veja console)`);
    } catch (e) { toast.error(friendlyError(e)); }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border neon-border cyber-grid">
        <div className="p-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary/80">
              <Package className="h-3.5 w-3.5" /> Atualizações • Desktop
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-2">
              <span className="neon-text">Releases do app</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Hospede o ZIP no Cloudflare R2, registre aqui e os clientes recebem a atualização em tempo real.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova release</Button>
          </div>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Versão atual em produção</CardTitle>
          <CardDescription>É a maior versão semver dentre as releases publicadas.</CardDescription>
        </CardHeader>
        <CardContent>
          {latestPublished ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className="text-base px-3 py-1 font-mono">v{latestPublished.version}</Badge>
                <span className="text-sm text-muted-foreground">publicada em {fmtDate(latestPublished.published_at)}</span>
                {latestPublished.is_mandatory && <Badge variant="destructive">obrigatória</Badge>}
                {latestPublished.min_supported_version && (
                  <Badge variant="outline" className="font-mono text-[10px]">min: v{latestPublished.min_supported_version}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={copyPayload}><Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar payload</Button>
                <Button size="sm" variant="outline" onClick={testEdgeFn}><Zap className="h-3.5 w-3.5 mr-1.5" /> Testar edge function</Button>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <div className="text-muted-foreground">
                  Defina <span className="font-mono text-foreground">min_supported_version</span> para forçar a atualização em todos os clientes abaixo dessa versão (vira obrigatória mesmo sem o flag).
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma release publicada ainda.</p>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Todas as releases</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Versão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Publicada</TableHead>
                  <TableHead>Criada</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
                {!loading && items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma release ainda.</TableCell></TableRow>}
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">v{r.version}</span>
                        {latestPublished?.id === r.id && <Badge variant="outline" className="border-primary/40 bg-primary/15 text-primary text-[10px]">LATEST</Badge>}
                        {r.is_mandatory && <Badge variant="destructive" className="text-[10px]">obrig.</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.is_published
                        ? <Badge variant="outline" className="border-primary/40 bg-primary/15 text-primary">Publicada</Badge>
                        : <Badge variant="outline">Rascunho</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{formatBytes(r.file_size_bytes)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(r.published_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-right"><ReleaseRowActions release={r} onEdit={openEdit} onChanged={load} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ReleaseFormDialog open={openForm} onOpenChange={setOpenForm} release={editing} onSaved={load} />
    </div>
  );
}