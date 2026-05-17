const PLAN_SUFFIX_RE = /\s+(pro|lite|free|starter|team|business|enterprise)\s*$/i;

export function stripAvatarPrefix(name: string): string {
  if (!name || name.length < 4) return name;
  const a = name[0];
  const b = name[1];
  if (!/[A-Za-zÀ-ÿ]/.test(a)) return name;
  if (a.toLowerCase() !== b.toLowerCase()) return name;
  const c = name[2];
  if (!/[A-Za-zÀ-ÿ'’]/.test(c)) return name;
  return name.slice(1);
}

export function cleanWorkspaceName(name: string | null | undefined): string {
  if (!name) return "";
  let s = String(name).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
  s = stripAvatarPrefix(s);
  return s.trim();
}

export function normalizeWorkspaceKey(name: string | null | undefined): string {
  const cleaned = cleanWorkspaceName(name).toLowerCase();
  const noAccent = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noAccent.replace(PLAN_SUFFIX_RE, "").trim();
}

export function dedupeWorkspaces(list: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const cleaned = cleanWorkspaceName(raw);
    if (!cleaned) continue;
    const key = normalizeWorkspaceKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}