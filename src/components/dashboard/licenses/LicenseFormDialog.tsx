import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  AppLicense, PLAN_OPTIONS, addDays, dateInputToIso, friendlySupabaseError,
  planDaysFromCode, planNameFromCode, toDateInputValue,
} from "@/lib/licenses";

const schema = z.object({
  customer_name: z.string().trim().max(120).optional().or(z.literal("")),
  customer_email: z.string().trim().toLowerCase().email("E-mail inválido").max(255),
  plan_code: z.enum(["monthly", "quarterly", "semiannual", "annual"]),
  plan_name: z.string().trim().max(80),
  expires_at: z.string().min(1, "Informe a data de expiração"),
  max_machines: z.number().int().min(1).max(10),
  notes: z.string().max(500).optional().or(z.literal("")),
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  license?: AppLicense | null;
  onSaved: () => void;
};

export default function LicenseFormDialog({ open, onOpenChange, license, onSaved }: Props) {
  const { user } = useAuth();
  const isEdit = !!license;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    plan_code: "monthly" as "monthly" | "quarterly" | "semiannual" | "annual",
    plan_name: "Mensal",
    expires_at: toDateInputValue(addDays(new Date(), 30).toISOString()),
    max_machines: 1,
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    if (license) {
      setForm({
        customer_name: license.customer_name ?? "",
        customer_email: license.customer_email,
        plan_code: (license.plan_code as any) || "monthly",
        plan_name: license.plan_name ?? planNameFromCode(license.plan_code || "monthly"),
        expires_at: toDateInputValue(license.expires_at),
        max_machines: license.max_machines || 1,
        notes: license.notes ?? "",
      });
    } else {
      setForm({
        customer_name: "",
        customer_email: "",
        plan_code: "monthly",
        plan_name: "Mensal",
        expires_at: toDateInputValue(addDays(new Date(), 30).toISOString()),
        max_machines: 1,
        notes: "",
      });
    }
  }, [open, license]);

  const handlePlanChange = (code: string) => {
    const c = code as typeof form.plan_code;
    setForm((f) => ({
      ...f,
      plan_code: c,
      plan_name: planNameFromCode(c),
      expires_at: isEdit ? f.expires_at : toDateInputValue(addDays(new Date(), planDaysFromCode(c)).toISOString()),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Dados inválidos");
      return;
    }
    const data = parsed.data;
    const expiresIso = dateInputToIso(data.expires_at);
    if (!expiresIso) {
      toast.error("Data de expiração inválida");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && license) {
        const { error } = await supabase
          .from("app_licenses")
          .update({
            customer_name: data.customer_name || null,
            plan_code: data.plan_code,
            plan_name: data.plan_name,
            max_machines: data.max_machines,
            expires_at: expiresIso,
            notes: data.notes || null,
          })
          .eq("id", license.id);
        if (error) throw error;
        toast.success("Licença atualizada");
      } else {
        // Verificar duplicidade
        const { data: existing, error: selErr } = await supabase
          .from("app_licenses")
          .select("id")
          .eq("partner_id", user.id)
          .eq("customer_email", data.customer_email)
          .limit(1)
          .maybeSingle();
        if (selErr) throw selErr;
        if (existing) {
          toast.error("Já existe uma licença para este e-mail");
          setSubmitting(false);
          return;
        }
        const { error } = await supabase.from("app_licenses").insert({
          customer_email: data.customer_email,
          customer_name: data.customer_name || null,
          partner_id: user.id,
          status: "active",
          plan_code: data.plan_code,
          plan_name: data.plan_name,
          max_machines: data.max_machines,
          expires_at: expiresIso,
          notes: data.notes || null,
        });
        if (error) throw error;
        toast.success("Licença criada");
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(friendlySupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar licença" : "Nova licença"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Atualize os dados da licença do cliente." : "Crie uma nova licença para o seu cliente."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="customer_name">Nome do cliente</Label>
              <Input id="customer_name" value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                placeholder="Ex.: João Silva" maxLength={120} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="customer_email">E-mail do cliente</Label>
              <Input id="customer_email" type="email" value={form.customer_email}
                onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                placeholder="cliente@exemplo.com" required disabled={isEdit} maxLength={255} />
              {isEdit && <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado.</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Plano</Label>
                <Select value={form.plan_code} onValueChange={handlePlanChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((p) => (
                      <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expires_at">Expira em</Label>
                <Input id="expires_at" type="date" value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })} required />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="max_machines">Máximo de máquinas</Label>
              <Input id="max_machines" type="number" min={1} max={10} value={form.max_machines}
                onChange={(e) => setForm({ ...form, max_machines: Math.max(1, Number(e.target.value) || 1) })} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" value={form.notes} maxLength={500}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Anotações internas (opcional)" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : isEdit ? "Salvar" : "Criar licença"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}