import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export default function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const strength = Math.min(100, (pwd.length / 12) * 100);
  const strengthColor =
    pwd.length >= 12 ? "bg-primary" : pwd.length >= 8 ? "bg-amber-500" : "bg-destructive";

  const submit = async () => {
    if (pwd.length < 8) {
      toast.error("Senha precisa de pelo menos 8 caracteres.");
      return;
    }
    if (pwd !== confirm) {
      toast.error("Senhas não conferem.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha atualizada.");
    setPwd("");
    setConfirm("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-primary/30">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-primary flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Trocar Senha
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider">Nova senha</Label>
            <Input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              className="bg-background/50 border-primary/30 font-mono"
            />
            <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
              <div className={`h-full transition-all ${strengthColor}`} style={{ width: `${strength}%` }} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider">Confirmar senha</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="bg-background/50 border-primary/30 font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando..." : "Atualizar senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}