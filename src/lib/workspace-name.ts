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

const STATUS_LIKE_NAMES = new Set([
  "em andamento",
  "processando",
  "aguardando",
  "aguardando pagamento",
  "aguardando worker",
  "aguardando workspace",
  "aguardando convite",
  "pending",
  "processing",
  "queued",
  "paid",
  "waiting",
  "waiting_invite",
  "waiting_workspace",
  "delivered",
  "failed",
  "refunded",
  "expired",
]);

export function isStatusLikeWorkspace(name: string | null | undefined): boolean {
  const cleaned = cleanWorkspaceName(name).toLowerCase();
  if (!cleaned) return true;
  return STATUS_LIKE_NAMES.has(cleaned);
}

/** Lança quando o nome é vazio ou parece um rótulo de status. Retorna o nome limpo. */
export function assertRealWorkspaceName(name: string | null | undefined): string {
  const cleaned = cleanWorkspaceName(name);
  if (!cleaned || cleaned.length < 2) {
    throw new Error("Workspace inválido: informe um nome real");
  }
  if (isStatusLikeWorkspace(cleaned)) {
    throw new Error(`Workspace inválido: '${cleaned}' parece um rótulo de status`);
  }
  return cleaned;
}