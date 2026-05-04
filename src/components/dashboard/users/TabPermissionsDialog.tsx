import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SIDEBAR_TABS } from "@/lib/sidebar-tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  userEmail?: string;
};

export default function TabPermissionsDialog({ open, onOpenChange, userId, userEmail }: Props) {
  const { user, refreshTabPermissions } = useAuth();
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const editableTabs = SIDEBAR_TABS.filter((t) => !t.alwaysOn);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_permissions")
        .select("tab_key")
        .eq("user_id", userId);
      if (cancelled) return;
      if (error) toast.error(error.message);
      setGranted(new Set((data ?? []).map((r: any) => r.tab_key as string)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const toggle = (key: string) => {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    const { data: existing } = await supabase
      .from("tab_permissions")
      .select("tab_key")
      .eq("user_id", userId);
    const current = new Set((existing ?? []).map((r: any) => r.tab_key as string));

    const toAdd: string[] = [];
    const toRemove: string[] = [];
    editableTabs.forEach((t) => {
      const wants = granted.has(t.key);
      const has = current.has(t.key);
      if (wants && !has) toAdd.push(t.key);
      if (!wants && has) toRemove.push(t.key);
    });

    if (toRemove.length) {
      const { error } = await supabase
        .from("tab_permissions")
        .delete()
        .eq("user_id", userId)
        .in("tab_key", toRemove);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }
    if (toAdd.length) {
      const rows = toAdd.map((tab_key) => ({ user_id: userId, tab_key, granted_by: user?.id }));
      const { error } = await supabase.from("tab_permissions").insert(rows);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }

    toast.success("Permissões atualizadas");
    if (user?.id === userId) await refreshTabPermissions();
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Permissões de abas</DialogTitle>
          <DialogDescription>
            {userEmail ? <span className="font-medium">{userEmail}</span> : "Usuário"} — marque as abas
            que este usuário poderá ver no menu lateral.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {editableTabs.map((t) => {
              const Icon = t.icon;
              const id = `tabperm-${t.key}`;
              return (
                <div key={t.key} className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    id={id}
                    checked={granted.has(t.key)}
                    onCheckedChange={() => toggle(t.key)}
                  />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor={id} className="flex-1 cursor-pointer">
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.url}</div>
                  </Label>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}