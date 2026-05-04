import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AvatarPicker, { type AvatarSelection } from "@/components/ativar/AvatarPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { UserCog } from "lucide-react";

export default function EditProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, profile, refreshProfile } = useAuth();
  const [nome, setNome] = useState(profile?.nome ?? "");
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? "");
  const [avatar, setAvatar] = useState<AvatarSelection>(
    profile?.avatar_url ? { type: "preset", url: profile.avatar_url } : null
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;

      if (avatar?.type === "upload") {
        const ext = avatar.mime.split("/")[1] || "png";
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const bytes = Uint8Array.from(atob(avatar.base64), (c) => c.charCodeAt(0));
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, bytes, { contentType: avatar.mime, upsert: true });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = data.publicUrl;
      } else if (avatar?.type === "preset") {
        avatarUrl = avatar.url;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ nome: nome || null, whatsapp: whatsapp || null, avatar_url: avatarUrl })
        .eq("id", user.id);
      if (error) throw error;

      await refreshProfile();
      toast.success("Perfil atualizado.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-primary/30 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-primary flex items-center gap-2">
            <UserCog className="w-4 h-4" /> Editar Perfil
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider">Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="bg-background/50 border-primary/30 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider">WhatsApp</Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+55 11 99999-9999"
              className="bg-background/50 border-primary/30 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider">Avatar</Label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}