import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { cleanWorkspaceName, isStatusLikeWorkspace } from "../_shared/workspace-name.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  orderId: z.string().uuid(),
  fingerprint: z.string().min(8).max(256),
  workspace: z.string().trim().min(2).max(200),
});

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return json(400, { error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const cleaned = cleanWorkspaceName(parsed.data.workspace);
    if (!cleaned || cleaned.length < 2) {
      return json(400, { error: "Workspace inválido" });
    }
    if (isStatusLikeWorkspace(cleaned)) {
      return json(400, { error: `Workspace inválido: '${cleaned}' parece um rótulo de status` });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await sb.rpc("set_order_target_workspace", {
      _order_id: parsed.data.orderId,
      _fingerprint: parsed.data.fingerprint,
      _workspace: cleaned,
    });
    if (error) return json(400, { error: error.message });

    return json(200, {
      ok: true,
      order: data,
      workspace: cleaned,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    return json(500, { error: msg });
  }
});