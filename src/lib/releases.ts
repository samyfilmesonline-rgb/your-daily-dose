export type AppRelease = {
  id: string;
  version: string;
  download_url: string;
  sha256: string;
  file_size_bytes: number | null;
  changelog: string | null;
  is_mandatory: boolean;
  min_supported_version: string | null;
  is_published: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+].+)?$/;

export function isValidSemver(v: string): boolean {
  return SEMVER_RE.test(v.trim());
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split(/[-+]/)[0].split(".").map(Number);
  const pb = b.split(/[-+]/)[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function friendlyError(err: unknown): string {
  const m = (err as { message?: string })?.message ?? "";
  if (m.includes("duplicate key")) return "Esta versão já existe.";
  return m || "Erro inesperado.";
}