# Corrigir erro do checkout Pix (AbacatePay v2)

## Diagnóstico

Logs da edge `partner-shop-create-pix`:

```
AbacatePay create [422]: {"success":false,"error":"Value should be one of 'object', 'object'"}
```

A v2 (`POST https://api.abacatepay.com/v2/transparents/create`) com `{ "method": "PIX", "data": {...} }` está correta. O 422 vem da validação do `data.customer`: na v2 PIX, **se o `customer` for informado, `name` e `taxId` são obrigatórios e `additionalProperties: false`** — qualquer campo `undefined`/extra ou faltando dispara esse erro genérico.

No código atual (`supabase/functions/_shared/abacate.ts`) o objeto `customer` é montado direto a partir do input com `cellphone: customerWhatsapp` podendo ser `undefined`, e a tipagem permite chaves extras. Quando o WhatsApp não vem, ainda assim a chave existe no objeto serializado em alguns paths e a Abacate v2 reclama.

Além disso, há um bug ortogonal na navegação: a rota é `/comprar/:partnerId` e o usuário abriu o link literal — todos os requests aparecem com `partner_id=eq.%3ApartnerId` (400 invalid uuid). Não é o que quebrou o botão "Comprar", mas precisa de uma mensagem amigável.

## Mudanças

**1. `supabase/functions/_shared/abacate.ts`** — sanitizar o body conforme schema v2:
- Construir `data.customer` apenas se `name` e `taxId` existirem.
- Remover chaves `undefined` (`cellphone`, `email`) antes de enviar.
- Enviar `{ method: "PIX", data: { amount, expiresIn, description, customer?, metadata? } }` sem chaves extras.
- Manter `ABACATE_BASE = https://api.abacatepay.com/v2` e `POST /transparents/create` / `GET /transparents/check?id=...`.
- Logar o body em caso de erro 4xx para facilitar diagnóstico futuro.

**2. `supabase/functions/partner-shop-create-pix/index.ts`** — passar `metadata: { orderRef, partnerId }` para correlação no webhook (opcional, ajuda rastreio) e garantir que `customerWhatsapp` undefined não vire chave do objeto.

**3. `src/pages/ComprarParceiro.tsx`** — quando `partnerId` não for UUID válido, mostrar tela "Link inválido" em vez de fazer requests com `:partnerId`.

## Validação

1. Deploy automático.
2. Acessar `/comprar/<uuid-do-parceiro-real>`, escolher pacote, preencher form e gerar Pix → QR aparece.
3. Conferir logs `partner-shop-create-pix` (esperado 200).
4. Acessar `/comprar/:partnerId` literal → deve mostrar "Link inválido", sem requests 400.