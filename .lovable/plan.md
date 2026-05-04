
# Onboarding pós-compra — Matrix Hacker Style

Hoje, quando o cliente paga via Pix em `/vendas`, o webhook cria uma `app_licenses` vinculada ao email — mas o cliente não tem conta no Supabase Auth nem senha. Ele cai no `/auth` sem como entrar. Vamos resolver criando um fluxo de ativação gameficado.

## Fluxo proposto

```text
[Pix confirmado em CheckoutPixDialog]
        │
        ▼
[CTA "Ativar minha conta" → /ativar?tx=<txId>]
        │
        ▼
Step 1: Confirmar dados (nome, email, whatsapp já preenchidos)
Step 2: Escolher avatar (9 da galeria + upload do PC/celular)
Step 3: Criar senha + confirmar
        │
        ▼
[Edge function ativa-conta]
  - valida que pix_charges.tx_id está "paid"
  - cria usuário no auth (email já confirmado)
  - linka app_licenses.id_do_usuario ao novo user
  - salva avatar_url no profiles
        │
        ▼
[Login automático → /dashboard]
```

## Mudanças

### 1. Banco
- Adicionar colunas em `profiles`:
  - `avatar_url text`
  - `nome text`
  - `whatsapp text`
  - `onboarding_completed boolean default false`
- Storage bucket público `avatars` (RLS: dono pode insert/update no próprio path `<user_id>/...`).
- Adicionar `pix_charges.activation_token text unique` (gerado no webhook quando pagar) — usado como chave de ativação na URL, evita expor `tx_id`.

### 2. Assets (galeria de avatares Matrix)
- Copiar 9 avatares da imagem enviada para `src/assets/avatars/anon-01.png` ... `anon-09.png` (a imagem é referência — precisaremos gerar/usar imagens equivalentes; vou usar a foto enviada como base e cortar cada avatar).

### 3. Edge functions
- **Modificar `abacatepay-webhook` e `abacatepay-check-status`**: ao marcar como `paid` no fluxo público (sem `partner_user_id`), gerar `activation_token` (uuid) e gravar em `pix_charges`.
- **Nova `ativar-conta`** (sem JWT, pública): recebe `{ activationToken, password, nome, whatsapp, avatarUrl }`. Valida charge `paid` + token, cria usuário com `supabase.auth.admin.createUser({ email, password, email_confirm: true })`, atualiza `app_licenses.id_do_usuario`, faz upsert em `profiles` (avatar/nome/whatsapp/onboarding_completed=true). Retorna `email` para login automático no client.

### 4. Frontend
- **`CheckoutPixDialog.tsx`**: no step "paid", trocar botão "Acessar painel" por "Ativar minha conta" → `/ativar?token=<activationToken>` (retornado pelo `check-status`).
- **`abacatepay-check-status`** já retorna o token agora; ajustar `CheckoutPixDialog` pra capturar.
- **Nova página `src/pages/Ativar.tsx`** (rota pública `/ativar`):
  - Tema matrix (MatrixRain, GlitchText, mesmo `matrixThemeStyle`).
  - 3 steps com indicador estilo terminal: `[01/03] IDENTIFICAÇÃO → [02/03] AVATAR → [03/03] SENHA`.
  - Step 1: mostra dados do `pix_charges` (read-only email; editáveis nome/whatsapp), texto "BEM-VINDO À MATRIX, OPERADOR".
  - Step 2: grid 3×3 com 9 avatares (border verde glow no selecionado) + card "Importar foto" (input file → upload pro bucket `avatars`, preview circular com glow). Um avatar custom também aparece selecionável.
  - Step 3: input senha + confirmação, validação min 8 chars, força visual (barra que enche em verde matrix). Botão "INICIAR SISTEMA →".
  - Após sucesso: chama `supabase.auth.signInWithPassword`, redireciona pra `/dashboard`.
- **Novo componente `src/components/ativar/AvatarPicker.tsx`** com a galeria + upload.
- **Atualizar `useAuth.tsx`**: expor `profile.avatar_url` (opcional, pra mostrar no header/sidebar futuramente — escopo mínimo só carregar).

### 5. Detalhes técnicos
- Validação client + server com `zod` (senha min 8, email válido, whatsapp opcional).
- Upload de avatar: `supabase.storage.from("avatars").upload("<token>/<uuid>.png", file)` antes de criar conta (usando token como prefixo pra permitir antes do signup; depois mover/renomear opcional). Alternativa mais simples: edge function recebe arquivo base64 e faz upload com service role — vamos por essa pra não precisar de RLS complexa pré-auth.
- Token de ativação tem TTL implícito (sempre válido enquanto charge `paid` e `app_licenses.id_do_usuario` IS NULL — uma única ativação).
- Reidempotência: se token já foi usado, retornar erro amigável "Conta já ativada — faça login".

## Fora de escopo
- Recuperação de senha (já existe fluxo padrão Supabase).
- Editar avatar depois do onboarding (pode vir num "Meu Perfil" futuro).
- Notificação por WhatsApp/email com o link de ativação (cliente recebe direto na tela do checkout — mas o link pode ser reaberto via `/ativar?token=...`).

## Arquivos
- **DB migration**: alter `profiles` + alter `pix_charges` + bucket `avatars`.
- **Novos**: `src/pages/Ativar.tsx`, `src/components/ativar/AvatarPicker.tsx`, `src/assets/avatars/anon-0[1-9].png`, `supabase/functions/ativar-conta/index.ts`.
- **Modificados**: `src/App.tsx` (rota `/ativar`), `src/components/landing/CheckoutPixDialog.tsx`, `supabase/functions/abacatepay-webhook/index.ts`, `supabase/functions/abacatepay-check-status/index.ts`, `src/integrations/supabase/types.ts` (regenerado).
