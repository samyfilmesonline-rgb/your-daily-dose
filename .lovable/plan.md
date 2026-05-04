## Objetivo

Atualizar a página `/vendas` com os 8 pacotes oficiais da tabela enviada e deixar bem claro o limite de **200 créditos por conta a cada 24h**, reforçando o ângulo de "compre pacotes maiores e use em várias contas / revenda".

## 1. Atualizar pacotes no banco (`credit_packs`)

Substituir os pacotes existentes pelos da imagem:

| Créditos | Preço     | R$/crédito | Marcar popular? |
|----------|-----------|------------|-----------------|
| 100      | R$ 15,00  | R$ 0,150   | —               |
| 200      | R$ 25,00  | R$ 0,125   | —               |
| 300      | R$ 35,00  | R$ 0,117   | —               |
| 500      | R$ 55,00  | R$ 0,110   | ✓ (popular)     |
| 1000     | R$ 85,00  | R$ 0,085   | —               |
| 2000     | R$ 155,00 | R$ 0,078   | —               |
| 3000     | R$ 215,00 | R$ 0,072   | —               |
| 5000     | R$ 300,00 | R$ 0,060   | ✓ (melhor custo)|

Operação: `DELETE` nos `credit_packs` atuais e `INSERT` dos 8 novos com `display_order` 1–8, `price_cents` em centavos e `is_active=true`. (Feito via tool de insert/update — não é alteração de schema.)

> Nota: o tipo `CreditPack` no front já cobre `is_popular`. Para diferenciar "Mais popular" (500) de "Melhor custo" (5000), adiciono um campo opcional `badge_label` no card vindo de uma coluna nova `badge_label text` em `credit_packs` (migration mínima). Se preferir não mexer no schema, uso só `is_popular` e marco apenas o 500.

## 2. Aviso do limite 200/dia (sem banner no topo)

Conforme escolhido: **apenas nos cards + FAQ**.

### `PricingCard.tsx`
- Adicionar uma faixa destacada dentro de cada card:
  > "Limite Lovable: 200 créditos/conta a cada 24h. Use o pacote em **várias contas** ou revenda."
- Calcular e mostrar **"≈ X dias para consumir em 1 conta"** = `Math.ceil(credits / 200)` (ex.: 1000 créditos = ~5 dias em 1 conta, ou 1 dia distribuindo em 5 contas).
- Reorganizar a lista de features para incluir:
  - `{credits} créditos Lovable`
  - `{R$/crédito} por crédito` (já existe)
  - `Use em várias contas Lovable`
  - `Ideal para revenda` (apenas em pacotes ≥ 1000)
  - `Liberação automática via Pix`

### `Vendas.tsx` — FAQ
Adicionar 2 novas perguntas no array `faqs`:
1. **"Existe limite de quantos créditos posso usar por dia?"**
   Resposta: a Lovable libera no máximo **200 créditos por conta a cada 24h**. Você pode recarregar valores menores que 200 quando quiser, desde que não ultrapasse esse teto por conta no período.
2. **"Posso usar o mesmo pacote em mais de uma conta Lovable?"**
   Resposta: sim. O limite de 200/dia é **por conta**, não por compra. Comprando pacotes maiores você garante o melhor custo por crédito e pode distribuir entre várias contas próprias ou revender.

Também ajustar o subtítulo da seção de pricing para:
> "Quanto maior o pacote, menor o custo por crédito. Use em várias contas (limite Lovable: 200/conta a cada 24h)."

## 3. Layout dos cards

Hoje o grid é `lg:grid-cols-4` e funcionava com 4 pacotes. Com 8, mudar para:
- `sm:grid-cols-2 lg:grid-cols-4` (2 linhas de 4)
- Marcar **500 créditos** como `is_popular` (badge "Mais popular")
- Marcar **5000 créditos** com badge "Melhor custo" (via novo `badge_label` ou via flag local no front baseada em `credits === 5000`)

## Detalhes técnicos

- **DB**: opção A (recomendada) — migration adicionando `badge_label text` em `credit_packs` + reset dos dados via insert tool. Opção B — sem migration, hardcode "Melhor custo" no `PricingCard` quando `pack.credits >= 5000`.
- **Edge functions**: nenhuma alteração — `abacatepay-create-pix` continua lendo `credit_packs` por `id`, e `plan_code` no `app_licenses` será `credits_{n}` automaticamente (já implementado).
- **Tipos**: regenerados automaticamente após a migration; `src/lib/credit-packs.ts` ganha o campo opcional `badge_label?: string | null`.

## Fora de escopo

- Não mexo no fluxo de checkout, webhook, ou Auth.
- Não crio painel admin para editar pacotes (já dá para editar direto na tabela `credit_packs`).
