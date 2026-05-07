import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Bot, Loader2, Trash2 } from "lucide-react";

type BotRow = {
  id: string;
  email_lovable: string;
  nickname: string | null;
  status: string;
  created_at: string;
};

function parseLines(input: string) {
  return input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      // Aceita: email:senha ou email,senha,nickname ou email|senha|nickname
      const parts = line.split(/[,|:\t]/).map((s) => s.trim());
      const [email, password, nickname] = parts;
      return { email, password, nickname: nickname || undefined };
    })
    .filter((b) => b.email && b.password);
}

export default function PartnerBotsDialog({
  open, onOpenChange, partnerId, partnerName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partnerId: string;
  partnerName?: string | null;
}) {
  const [bots, setBots] = useState<BotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulk, setBulk] = useState("");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Array<{ email: string; ok: boolean; error?: string }>>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("farm_bots")
      .select("id, email_lovable, nickname, status, created_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setBots((data ?? []) as BotRow[]);
    setLoading(false);
  };

  useEffect(() => { if (open && partnerId) load(); /* eslint-disable-next-line */ }, [open, partnerId]);

  const parsed = useMemo(() => parseLines(bulk), [bulk]);

  const importBots = async () => {
    if (parsed.length === 0) return toast.error("Nada para importar");
    setImporting(true);
    setResults([]);
    const { data, error } = await supabase.functions.invoke("admin-create-farm-bots", {
      body: { partnerId, bots: parsed },
    });
    setImporting(false);
    if (error) return toast.error(error.message);
    const r = (data as { results: typeof results; inserted: number; failed: number }) ?? { results: [], inserted: 0, failed: 0 };
    setResults(r.results);
    toast.success(`Importados ${r.inserted}, falharam ${r.failed}`);
    setBulk("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover bot?")) return;
    const { error } = await supabase.from("farm_bots").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-primary" /> Bots de farm</DialogTitle>
          <DialogDescription>
            Bots atribuídos a {partnerName ?? "parceiro"}. O parceiro vê seus bots mas não enxerga as senhas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Adicionar em massa</Label>
          <p className="text-xs text-muted-foreground">
            Uma conta por linha, no formato <code>email:senha</code> ou <code>email,senha,apelido</code>.
          </p>
          <Textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={"bot01@gmail.com:Senha123!\nbot02@gmail.com,Senha123!,Bot 2"}
            className="font-mono text-xs min-h-[120px]"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{parsed.length} válidos</span>
            <Button onClick={importBots} disabled={importing || parsed.length === 0}>
              {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando...</> : `Importar ${parsed.length} bots`}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="text-xs space-y-0.5 max-h-32 overflow-auto rounded border p-2">
              {results.map((r, i) => (
                <div key={i} className={r.ok ? "text-primary" : "text-destructive"}>
                  {r.ok ? "✓" : "✗"} {r.email}{r.error ? ` — ${r.error}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded border overflow-x-auto max-h-72 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Apelido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!loading && bots.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Nenhum bot cadastrado.</TableCell></TableRow>}
              {bots.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.email_lovable}</TableCell>
                  <TableCell className="text-xs">{b.nickname ?? "—"}</TableCell>
                  <TableCell><span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border">{b.status}</span></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(b.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}