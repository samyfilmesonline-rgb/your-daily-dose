import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function cmp(a: string, b: string): number {
  const pa = a.split(/[-+]/)[0].split(".").map((n) => parseInt(n) || 0);
  const pb = b.split(/[-+]/)[0].split(".").map((n) => parseInt(n) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const current = url.searchParams.get("current") ?? "0.0.0";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const { data, error } = await supabase
      .from("app_releases")
      .select("version, download_url, sha256, file_size_bytes, changelog, is_mandatory, min_supported_version, published_at")
      .eq("is_published", true);

    if (error) throw error;

    const releases = (data ?? []).slice().sort((a, b) => cmp(b.version, a.version));
    const latest = releases[0] ?? null;

    if (!latest) {
      return new Response(JSON.stringify({ update_available: false, latest_version: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updateAvailable = cmp(latest.version, current) > 0;
    const forceMandatory = latest.min_supported_version
      ? cmp(current, latest.min_supported_version) < 0
      : false;

    return new Response(JSON.stringify({
      update_available: updateAvailable,
      mandatory: latest.is_mandatory || forceMandatory,
      latest_version: latest.version,
      download_url: latest.download_url,
      sha256: latest.sha256,
      file_size_bytes: latest.file_size_bytes,
      changelog: latest.changelog,
      published_at: latest.published_at,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});