import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  email: string;
  nome?: string | null;
  whatsapp?: string | null;
  status?: "pendente" | "ativo" | "suspenso";
  limite_clientes?: number;
  limite_workspaces?: number;
  limite_creditos?: number;
  send_invite?: boolean;
};

function generatePassword() {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return rand + "Aa1!";
}

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

  // Validate caller
  const callerClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await callerClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json(401, { error: "Unauthorized" });
  const callerId = claimsData.claims.sub as string;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Check admin role
  const { data: isAdminData, error: roleErr } = await admin.rpc("has_role", {
    _user_id: callerId,
    _role: "admin",
  });
  if (roleErr) return json(500, { error: roleErr.message });
  if (!isAdminData) return json(403, { error: "Apenas admins podem criar parceiros." });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "E-mail inválido" });
  }
  const status = body.status ?? "ativo";
  if (!["pendente", "ativo", "suspenso"].includes(status)) {
    return json(400, { error: "Status inválido" });
  }
  const nome = (body.nome ?? "").trim() || null;
  const whatsapp = (body.whatsapp ?? "").trim() || null;
  const limite_clientes = Number.isFinite(body.limite_clientes) ? Number(body.limite_clientes) : 50;
  const limite_workspaces = Number.isFinite(body.limite_workspaces) ? Number(body.limite_workspaces) : 100;
  const limite_creditos = Number.isFinite(body.limite_creditos) ? Number(body.limite_creditos) : 1000;
  const sendInvite = !!body.send_invite;

  let userId: string | null = null;
  let tempPassword: string | null = null;
  let invited = false;
  let alreadyExisted = false;

  // Try to find existing user by email (paginate)
  try {
    let page = 1;
    while (page <= 20) {
      const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const found = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) {
        userId = found.id;
        alreadyExisted = true;
        break;
      }
      if (list.users.length < 200) break;
      page++;
    }
  } catch (_) {
    // ignore, will try create
  }

  if (!userId) {
    if (sendInvite) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error || !data?.user) {
        return json(400, { error: error?.message ?? "Falha ao convidar usuário" });
      }
      userId = data.user.id;
      invited = true;
    } else {
      tempPassword = generatePassword();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (error || !data?.user) {
        return json(400, { error: error?.message ?? "Falha ao criar usuário" });
      }
      userId = data.user.id;
    }
  }

  // Ensure profile
  await admin.from("profiles").upsert({ id: userId, email }, { onConflict: "id" });

  // Ensure user role
  await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "user" }, { onConflict: "user_id,role" });

  // Upsert parceiro
  const parceiroPayload: Record<string, unknown> = {
    user_id: userId,
    nome,
    whatsapp,
    status,
    limite_clientes,
    limite_workspaces,
    limite_creditos,
  };
  if (status === "ativo") {
    parceiroPayload.aprovado_em = new Date().toISOString();
    parceiroPayload.aprovado_por = callerId;
  }

  const { error: pErr } = await admin
    .from("parceiros")
    .upsert(parceiroPayload, { onConflict: "user_id" });
  if (pErr) return json(500, { error: pErr.message });

  return json(200, {
    user_id: userId,
    email,
    already_existed: alreadyExisted,
    invited,
    temp_password: tempPassword,
  });
});
