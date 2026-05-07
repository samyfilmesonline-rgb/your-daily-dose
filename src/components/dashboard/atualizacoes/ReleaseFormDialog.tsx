import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AppRelease, friendlyError, isValidSemver } from "@/lib/releases";

const schema = z.object({
  version: z.string().trim().refine(isValidSemver, "Use semver, ex: 1.4.2"),
  download_url: z.string().trim().url("URL inválida"),
  sha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/, "SHA256 deve ter 64 caracteres hex"),
  file_size_bytes: z.number().int().nonnegative().nullable(),
  changelog: z.string().max(5000).optional().or(z.literal("")),
  is_mandatory: z.boolean(),
  min_supported_version: z.string().trim().refine((v) => v === "" || isValidSemver(v), "Semver inválido").optional().or(z.literal("")),
  is_published: z.boolean(),
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release?: AppRelease | null;
  onSaved: () => void;
};

const empty = {
  version: "",
  download_url: "",
  sha256: "",
  file_size_bytes: null as number | null,
  changelog: "",
  is_mandatory: false,
  min_supported_version: "",
  is_published: true,
};

export default function ReleaseFormDialog({ open, onOpenChange, release, onSaved }: Props) {
  const { user } = useAuth();
  const isEdit = !!release;
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingSize, setFetchingSize] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (release) {
      setForm({
        version: release.version,
        download_url: release.download_url,
        sha256: release.sha256,
        file_size_bytes: release.file_size_bytes,
        changelog: release.changelog ?? "",
        is_mandatory: release.is_mandatory,
        min_supported_version: release.min_supported_version ?? "",
        is_published: release.is_published,
      });
    } else {
      setForm(empty);
    }
  }, [open, release]);

  const fetchSize = async () => {
    if (!form.download_url) return;
    setFetchingSize(true);
    try {
      const res = await fetch(form.download_url, { method: "HEAD" });
      const len = res.headers.get("content-length");
      if (len) {
        setForm((f) => ({ ...f, file_size_bytes: Number(len) }));
        toast.success("Tamanho detectado");
      } else {
        toast.error("Não foi possível detectar (sem content-length)");
      }
    } catch {
      toast.error("Falha ao consultar URL (CORS no R2?)");
    } finally {
      setFetchingSize(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Dados inválidos");
      return;
    }
    const d = parsed.data;
    setSubmitting(true);
    try {
      const payload = {
        version: d.version,
        download_url: d.download_url,
        sha256: d.sha256.toLowerCase(),
        file_size_bytes: d.file_size_bytes,
        changelog: d.changelog || null,
        is_mandatory: d.is_mandatory,
        min_supported_version: d.min_supported_version || null,
        is_published: d.is_published,
      };
      if (isEdit && release) {
        const { error } = await supabase.from("app_releases").update(payload).eq("id", release.id);
        if (error) throw error;
        toast.success("Release atualizada");
      } else {
        const { error } = await supabase.from("app_releases").insert({ ...payload, created_by: user.id });
        if (error) throw error;
        toast.success(d.is_published ? "Release publicada — clientes serão notificados" : "Rascunho salvo");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar release" : "Nova release"}</DialogTitle>
            <DialogDescription>
              Hospede o ZIP no Cloudflare R2 e cole a URL pública aqui. Ao publicar, todos os clientes online recebem a notificação em tempo real.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="version">Versão (semver)</Label>
                <Input id="version" placeholder="1.4.2" value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })} required disabled={isEdit} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="min">Versão mínima suportada</Label>
                <Input id="min" placeholder="1.0.0 (opcional)" value={form.min_supported_version}
                  onChange={(e) => setForm({ ...form, min_supported_version: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="url">URL do ZIP (Cloudflare R2)</Label>
              <Input id="url" type="url" placeholder="https://cdn.seudominio.com/app-1.4.2.zip" value={form.download_url}
                onChange={(e) => setForm({ ...form, download_url: e.target.value })} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sha">SHA256 do arquivo</Label>
              <Input id="sha" placeholder="64 caracteres hex" className="font-mono text-xs" value={form.sha256}
                onChange={(e) => setForm({ ...form, sha256: e.target.value })} required />
              <p className="text-xs text-muted-foreground">
                Gere com <code className="font-mono">sha256sum app-1.4.2.zip</code> (Linux/Mac) ou <code className="font-mono">certutil -hashfile app-1.4.2.zip SHA256</code> (Windows).
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Tamanho do arquivo</Label>
              <div className="flex gap-2">
                <Input type="number" min={0} value={form.file_size_bytes ?? ""} placeholder="bytes"
                  onChange={(e) => setForm({ ...form, file_size_bytes: e.target.value ? Number(e.target.value) : null })} />
                <Button type="button" variant="outline" onClick={fetchSize} disabled={fetchingSize || !form.download_url}>
                  {fetchingSize ? "..." : "Auto-detectar"}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="changelog">Changelog (markdown)</Label>
              <Textarea id="changelog" rows={5} maxLength={5000}
                placeholder="- Correção do bug X&#10;- Nova feature Y"
                value={form.changelog}
                onChange={(e) => setForm({ ...form, changelog: e.target.value })} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Atualização obrigatória</Label>
                <p className="text-xs text-muted-foreground">Se ativo, o app não permite continuar na versão antiga.</p>
              </div>
              <Switch checked={form.is_mandatory} onCheckedChange={(v) => setForm({ ...form, is_mandatory: v })} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Publicar agora</Label>
                <p className="text-xs text-muted-foreground">Ao publicar, clientes online recebem notificação push instantânea.</p>
              </div>
              <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Salvando…" : isEdit ? "Salvar" : "Criar release"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}