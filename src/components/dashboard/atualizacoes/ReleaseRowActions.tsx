import { useState } from "react";
import { toast } from "sonner";
import { Pencil, MoreHorizontal, Trash2, Eye, EyeOff, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AppRelease, friendlyError } from "@/lib/releases";

type Props = {
  release: AppRelease;
  onEdit: (r: AppRelease) => void;
  onChanged: () => void;
};

export default function ReleaseRowActions({ release, onEdit, onChanged }: Props) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const togglePublish = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("app_releases")
        .update({ is_published: !release.is_published, published_at: !release.is_published ? new Date().toISOString() : release.published_at })
        .eq("id", release.id);
      if (error) throw error;
      toast.success(!release.is_published ? "Publicado — clientes notificados" : "Despublicado");
      onChanged();
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("app_releases").delete().eq("id", release.id);
      if (error) throw error;
      toast.success("Release removida");
      setConfirmDel(false);
      onChanged();
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(release.download_url);
    toast.success("URL copiada");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(release)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
          <DropdownMenuItem onClick={togglePublish} disabled={busy}>
            {release.is_published ? <><EyeOff className="h-4 w-4 mr-2" /> Despublicar</> : <><Eye className="h-4 w-4 mr-2" /> Publicar</>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyUrl}><Copy className="h-4 w-4 mr-2" /> Copiar URL</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setConfirmDel(true)} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" /> Deletar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar release {release.version}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O ZIP no R2 não é apagado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={busy}>Deletar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}