// Helpers compartilhados para a integração AbacatePay.
// Docs: https://docs.abacatepay.com

export const ABACATE_BASE = "https://api.abacatepay.com/v1";

export function authHeaders() {
  const key = Deno.env.get("ABACATEPAY_API_KEY");
  if (!key) throw new Error("ABACATEPAY_API_KEY não configurada");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export type AbacatePixIn = {
  amount: number; // em centavos
  expiresIn?: number; // segundos
  description?: string;
  customer: {
    name: string;
    cellphone?: string;
    email: string;
    taxId?: string;
  };
};

export type AbacatePixOut = {
  id: string;
  amount: number;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED" | string;
  brCode: string; // copia e cola
  brCodeBase64: string; // imagem QR em base64 (data URL ou base64 cru)
  expiresAt?: string;
};

export async function createPixCharge(input: AbacatePixIn): Promise<AbacatePixOut> {
  const res = await fetch(`${ABACATE_BASE}/pixQrCode/create`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`AbacatePay create [${res.status}]: ${JSON.stringify(json)}`);
  }
  return (json.data ?? json) as AbacatePixOut;
}

export async function checkPixStatus(id: string): Promise<AbacatePixOut> {
  const res = await fetch(`${ABACATE_BASE}/pixQrCode/check?id=${encodeURIComponent(id)}`, {
    method: "GET",
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`AbacatePay check [${res.status}]: ${JSON.stringify(json)}`);
  }
  return (json.data ?? json) as AbacatePixOut;
}

export function normalizeQrImage(brCodeBase64: string | undefined | null): string {
  if (!brCodeBase64) return "";
  if (brCodeBase64.startsWith("data:")) return brCodeBase64;
  return `data:image/png;base64,${brCodeBase64}`;
}