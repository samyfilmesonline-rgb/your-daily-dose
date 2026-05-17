const PLAN_SUFFIX_RE = /\s+(pro|lite|free|starter|team|business|enterprise)\s*$/i;

/**
 * Remove a primeira letra quando ela é uma duplicação do avatar colado no início.
 * Ex: "Cclose's Lovablee" -> "close's Lovablee"
 *     "AAlex's Lovable"   -> "Alex's Lovable"
 * Só age quando o nome tem >= 4 chars e os 2 primeiros são a mesma letra (case-insensitive).
 */
export function stripAvatarPrefix(name: string): string {
  if (!name || name.length < 4) return name;
  const a = name[0];
  const b = name[1];
  if (!/[A-Za-zÀ-ÿ]/.test(a)) return name;
  if (a.toLowerCase() !== b.toLowerCase()) return name;
  // terceiro char deve ser letra/apóstrofo para evitar "AA" sozinho
  const c = name[2];
  if (!/[A-Za-zÀ-ÿ'’]/.test(c)) return name;
  return name.slice(1);
}

/** Limpeza visual: remove avatar duplicado, normaliza aspas curvas, colapsa espaços. */
export function cleanWorkspaceName(name: string | null | undefined): string {
  if (!name) return "";
  let s = String(name).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
  s = stripAvatarPrefix(s);
  return s.trim();
}

/** Chave canônica para comparação/dedupe: lower + sem acento + sem sufixo de plano. */
export function normalizeWorkspaceKey(name: string | null | undefined): string {
  const cleaned = cleanWorkspaceName(name).toLowerCase();
  const noAccent = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noAccent.replace(PLAN_SUFFIX_RE, "").trim();
}

/** Dedupe preservando a primeira ocorrência por chave normalizada. Descarta vazios. */
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