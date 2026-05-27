const FRIENDLY: Array<[RegExp, string]> = [
  [/card[_-]?declined/i, "Cartão recusado pelo provedor"],
  [/insufficient[_-]?funds/i, "Saldo insuficiente no cartão"],
  [/checkout[_-]?failed/i, "Falha no checkout da Lovable"],
  [/stripe[_-]?error/i, "Erro retornado pelo Stripe"],
  [/billing[_-]?upgrade[_-]?failed/i, "Falha ao fazer upgrade do plano PRO"],
  [/billing[_-]?downgrade[_-]?failed/i, "Falha ao corrigir downgrade do plano"],
  [/billing[_-]?manage[_-]?missing/i, "Botão Manage indisponível no Billing"],
  [/workspace_not_found(:.+)?/i, "Workspace não encontrado na conta do bot"],
  [/captcha[_-]?required/i, "Captcha pendente — resolva no worker"],
  [/stopped[_-]?by[_-]?customer/i, "Cancelado pelo cliente"],
  [/partial[_-]?only/i, "Entrega parcial — restante reembolsado"],
  [/worker[_-]?failure/i, "Falha do worker"],
  [/manual[_-]?refund/i, "Reembolso manual"],
];

const PAYMENT_REASONS = /card[_-]?declined|insufficient[_-]?funds|checkout[_-]?failed|stripe[_-]?error|billing[_-]?(upgrade|downgrade|manage)/i;

export function friendlyReason(raw?: string | null): string | null {
  if (!raw) return null;
  for (const [re, msg] of FRIENDLY) {
    if (re.test(raw)) return msg;
  }
  return raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
}

export function isPaymentRetryable(raw?: string | null): boolean {
  if (!raw) return false;
  return PAYMENT_REASONS.test(raw);
}