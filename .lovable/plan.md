# Corrigir tela branca no projeto publicado

## Causa

O `src/integrations/supabase/client.ts` lança erro se `VITE_SUPABASE_URL` ou `VITE_SUPABASE_PUBLISHABLE_KEY` não estiverem definidas no momento do build. O `.gitignore` atual ignora **todos** os arquivos `.env` (exceto `.env.example`), então o `.env` real não vai para o build de produção, e a app sobe sem as chaves → exceção no carregamento → tela branca.

Esse é um padrão conhecido em projetos Vite/Lovable clássicos: variáveis públicas `VITE_*` precisam estar disponíveis no build.

## Mudanças

1. **`.gitignore`** — remover a linha `.env` (manter `.env.*` e `*.local` ignorados, exceto `.env.example`). Assim o `.env` raiz contendo as chaves públicas do Supabase é incluído no build de publicação.

2. **`.env`** — garantir que existe na raiz com:
   ```
   VITE_SUPABASE_PROJECT_ID="mdfxwynmmefaipqzdbyf"
   VITE_SUPABASE_URL="https://mdfxwynmmefaipqzdbyf.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="<anon key do projeto>"
   ```
   (As chaves `VITE_*` e `anon` são públicas por design — seguras para irem ao bundle. A segurança real vem das RLS policies no Supabase, que já estão configuradas.)

3. **Republicar** o projeto após o ajuste para o build novo subir com as variáveis.

## Por que é seguro

A `anon key` do Supabase já é exposta em qualquer app frontend conectado — ela só dá acesso ao que as RLS policies permitirem. O projeto já tem RLS ativo em `contas_lovable`, `execucoes_lovable`, `user_roles` e `profiles`.

## Após aprovar

Vou ajustar `.gitignore`, garantir o `.env`, e te avisar para clicar em **Publish → Update** para republicar. Aí a tela branca some.
