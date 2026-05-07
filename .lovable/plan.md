## Diagnóstico

A tentativa mais recente chegou na Edge Function `partner-shop-create-pix`, mas ela respondeu **400 antes de chamar a AbacatePay**. Ou seja: o erro atual não é mais o `422` da AbacatePay; é validação local da função.

Pelo print e pelo payload, o campo mais provável é o **CPF/CNPJ**: foi digitado `045690404202` com 12 dígitos. A função só aceita CPF com 11 dígitos ou CNPJ com 14 dígitos, então retorna erro e o frontend mostra apenas `Edge Function returned a non-2xx status code`.

## Plano de correção

1. **Melhorar validação no frontend em `src/pages/ComprarParceiro.tsx`**
   - Antes de chamar a Edge Function, validar que CPF/CNPJ tem 11 ou 14 dígitos.
   - Se estiver inválido, mostrar toast amigável: `CPF/CNPJ inválido. Use 11 dígitos para CPF ou 14 para CNPJ.`
   - Não disparar a função quando o documento estiver inválido.

2. **Melhorar mensagem de erro da Edge Function**
   - Em `supabase/functions/partner-shop-create-pix/index.ts`, manter a validação atual, mas retornar erro claro quando o CPF/CNPJ tiver tamanho incorreto.
   - Isso evita o erro genérico caso alguém chame a função direto ou o frontend deixe passar.

3. **Exibir erro real no formulário**
   - Ajustar o catch do submit para tentar ler `error.context` / resposta da função quando disponível.
   - Assim, se a função retornar `{ error: "CPF/CNPJ inválido" }`, o usuário verá essa mensagem em vez de `Edge Function returned a non-2xx status code`.

## Validação

- Testar com CPF/CNPJ inválido: deve bloquear no formulário, sem chamar a função.
- Testar com 11 ou 14 dígitos: deve chamar a função normalmente.
- Se a AbacatePay retornar erro depois disso, os logs já vão mostrar o próximo problema real.