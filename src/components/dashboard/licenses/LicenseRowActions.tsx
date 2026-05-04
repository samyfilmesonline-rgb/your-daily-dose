import { useState } from "react";
import { MoreHorizontal, Pencil, Ban, Play, RotateCcw, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppLicense, addDays, friendlySupabaseError, normalizeStatus } from "@/lib/licenses";

type LicenseUpdate = Database["public"]["Tables"]["app_licenses"]["Update"];

type Props = {
  license: AppLicense;
  onEdit: (license: AppLicense) => void;
  onChanged: () => void;
};

export default function LicenseRowActions({ license, onEdit, onChanged }: Props) {
  const [confirm, setConfirm] = useState<"block" | "reset" | null>(null);
  const [loading, setLoading] = useState(false);
  const status = normalizeStatus(license);
  const isBlocked = status === "bloqueado";

  const updateLicense = async (payload: LicenseUpdate, success: string) => {
    setLoading(true);
    const { error } = await supabase.from("app_licenses").update(payload).eq("id", license.id);
    setLoading(false);
    if (error) return toast.error(friendlySupabaseError(error));
    toast.success(success);
    onChanged();
  };

  const renew = (days: number) => {
    const base = license.expires_at && new Date(license.expires_at).getTime() > Date.now()
      ? new Date(license.expires_at)
      : new Date();
    updateLicense({ expires_at: addDays(base, days).toISOString(), status: "active" }, "Licença renovada");
  };

  const toggleBlocked = () => {
    updateLicense({ status: isBlocked ? "active" : "blocked" }, isBlocked ? "Licença desbloqueada" : "Licença bloqueada");
    setConfirm(null);
  };

  const resetMachine = () => {
    updateLicense({ machine_hash: null, machine_hashes: [], activated_at: null }, "Máquina resetada");
    setConfirm(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={loading} aria-label="Abrir ações da licença">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(license)}>
            <Pencil className="mr-2 h-4 w-4" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => renew(30)}>
            <CalendarClock className="mr-2 h-4 w-4" /> Renovar +30 dias
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => renew(90)}>
            <CalendarClock className="mr-2 h-4 w-4" /> Renovar +90 dias
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => renew(365)}>
            <CalendarClock className="mr-2 h-4 w-4" /> Renovar +365 dias
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setConfirm("block")}>
            {isBlocked ? <Play className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}
            {isBlocked ? "Desbloquear" : "Bloquear"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setConfirm("reset")}>
            <RotateCcw className="mr-2 h-4 w-4" /> Resetar máquina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm === "block"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isBlocked ? "Desbloquear licença?" : "Bloquear licença?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked ? "O cliente poderá voltar a usar o app desktop." : "O app desktop deixará de aceitar esta licença."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={toggleBlocked}>{isBlocked ? "Desbloquear" : "Bloquear"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "reset"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar máquina?</AlertDialogTitle>
            <AlertDialogDescription>
              A licença ficará livre para ativação novamente em outro computador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={resetMachine}>Resetar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
