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
    throw new Error("Workspace inválido: nome ausente");
  }
  if (isStatusLikeWorkspace(cleaned)) {
    throw new Error(`Workspace inválido: '${cleaned}' parece um rótulo de status`);
  }
  return cleaned;
}