import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  activationToken: z.string().min(8),
  password: z.string().min(8).max(72),
  nome: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  // Avatar: ou URL de preset (string), ou base64 (data URL) para upload
  avatarPreset: z.string().trim().max(255).optional().nullable(),
  avatarBase64: z.string().optional().nullable(),
  avatarMime: z.string().optional().nullable(),
});

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { activationToken, password, nome, whatsapp, avatarPreset, avatarBase64, avatarMime } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Validar charge
    const { data: charge, error: chErr } = await supabase
      .from("pix_charges")
      .select("*")
      .eq("activation_token", activationToken)
      .maybeSingle();

    if (chErr || !charge) {
      return new Response(
        JSON.stringify({ error: "Token de ativação inválido." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (charge.status !== "paid") {
      return new Response(
        JSON.stringify({ error: "Pagamento ainda não confirmado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = String(charge.customer_email).toLowerCase();

    // 2. Verificar se já existe usuário com esse email
    let userId: string | null = null;
    const { data: existingByEmail } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const existing = existingByEmail?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === email
    );

    if (existing) {
      // Atualiza senha (re-ativação)
      userId = existing.id;
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) {
        return new Response(
          JSON.stringify({ error: `Falha ao atualizar usuário: ${updErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome, whatsapp: whatsapp ?? null },
      });
      if (createErr || !created?.user) {
        return new Response(
          JSON.stringify({ error: `Falha ao criar conta: ${createErr?.message ?? "desconhecido"}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = created.user.id;
    }

    // 3. Upload do avatar (se base64)
    let avatarUrl: string | null = avatarPreset ?? null;
    if (avatarBase64 && userId) {
      try {
        const cleanB64 = avatarBase64.replace(/^data:[^;]+;base64,/, "");
        const bytes = decodeBase64(cleanB64);
        const mime = avatarMime || "image/png";
        const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
        const path = `${userId}/avatar-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, bytes, { contentType: mime, upsert: true });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
          avatarUrl = pub.publicUrl;
        } else {
          console.error("upload avatar error", upErr);
        }
      } catch (e) {
        console.error("avatar decode error", e);
      }
    }

    // 4. Upsert profile
    await supabase.from("profiles").upsert(
      {
        id: userId,
        email,
        nome,
        whatsapp: whatsapp ?? null,
        avatar_url: avatarUrl,
        onboarding_completed: true,
      },
      { onConflict: "id" }
    );

    // 5. Vincular licenças desse email ao user_id (se ainda não vinculadas)
    await supabase
      .from("app_licenses")
      .update({ id_do_usuario: userId })
      .eq("customer_email", email)
      .is("id_do_usuario", null);

    return new Response(
      JSON.stringify({ ok: true, email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ativar-conta error", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
