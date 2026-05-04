## Plano: Aba "Minha Conta" no sidebar

Adicionar uma nova aba sempre visível no sidebar onde o usuário vê seus dados pessoais, avatar, contato e a quantidade de créditos disponíveis.

### Onde aparece

- Nova entrada no catálogo `src/lib/sidebar-tabs.ts`:
  - `key: "minha-conta"`, `title: "Minha Conta"`, `url: "/dashboard/minha-conta"`, `icon: UserCircle`, `alwaysOn: true`.
- Posicionada logo após "Visão geral" (antes de "Loja").
- Como `alwaysOn: true`, aparece para todo usuário sem necessidade de permissão (segue padrão de `overview` e `loja`).

### Página `/dashboard/minha-conta`

Arquivo novo: `src/pages/dashboard/MinhaConta.tsx`. Estilo Matrix consistente com Overview/Loja (MatrixCard, fonte mono, neon verde).

Layout em duas colunas no desktop, empilhado no mobile:

**Coluna esquerda — Perfil (card)**
- Avatar grande (128px) com glow verde, lido de `profiles.avatar_url`. Fallback: iniciais do nome/email.
- Nome (`profiles.nome`) com `GlitchText`.
- Email (read-only, do `auth.user.email`).
- WhatsApp (`profiles.whatsapp`).
- Badge do papel: "ADMIN", "PARCEIRO ATIVO", "PARCEIRO PENDENTE" ou "USUÁRIO".
- Botão "Editar perfil" → abre dialog para editar `nome`, `whatsapp` e trocar avatar (reusa `AvatarPicker` de `src/components/ativar/AvatarPicker.tsx`).
- Botão secundário "Trocar senha" → dialog simples com `supabase.auth.updateUser({ password })`.

**Coluna direita — Créditos (card)**
- Título "CRÉDITOS DISPONÍVEIS".
- Número grande: `limite_creditos - creditos_consumidos` (do `parceiro` no `useAuth`).
- Linha secundária: `consumidos / limite` (ex.: `1.250 / 5.000`).
- Barra de progresso (verde / âmbar ≥80% / vermelho ≥100%, mesma lógica do `QuotaBadge`).
- Status do parceiro (ativo/pendente/suspenso) como badge.
- CTA "Comprar mais créditos" → `Link` para `/dashboard/loja`.
- Quando não há `parceiro` (usuário comum), mostrar estado "Sem licença ativa" com CTA para a Loja.

**Card inferior — Conta (full width)**
- Data de criação da conta (`profiles.criado_em`).
- ID do usuário (com botão copiar).
- Botão "Sair" (chama `signOut`).

### Edição de perfil (dialog)

Componente novo: `src/components/dashboard/minha-conta/EditProfileDialog.tsx`.
- Campos: `nome` (text), `whatsapp` (text), avatar (via `AvatarPicker`).
- Salvar:
  - Se avatar trocado: upload para bucket `avatars` em `{user_id}/avatar-{timestamp}.{ext}` e pegar `publicUrl`. Avatares preset (importados como asset) são copiados para o bucket no upload, ou salvos como string-key — usar mesma abordagem que `ativar-conta` (upload do blob).
  - `update` em `profiles` com `nome`, `whatsapp`, `avatar_url`.
- Após salvar: chamar `refreshProfile()` (novo no `useAuth`) e fechar dialog.

### Trocar senha (dialog)

Componente novo: `src/components/dashboard/minha-conta/ChangePasswordDialog.tsx`.
- Campos: nova senha + confirmação (mín 8 chars, barra visual reusada).
- `supabase.auth.updateUser({ password })`.

### Ajuste no `useAuth`

`src/hooks/useAuth.tsx`:
- Adicionar estado `profile: { id, email, nome, whatsapp, avatar_url, criado_em, onboarding_completed } | null`.
- Função `fetchProfile(uid)` que faz `select * from profiles where id = uid`.
- Expor `profile` e `refreshProfile()` no contexto.
- Chamar junto com `fetchParceiro` no `onAuthStateChange` e no `getSession`.

### Reflexo no header

Atualizar `src/components/dashboard/AppSidebar.tsx` (footer com email) para mostrar o mini-avatar (24px) ao lado do email quando `profile.avatar_url` existir. Pequeno polimento, opcional mas barato.

### Roteamento

`src/App.tsx`: adicionar `<Route path="minha-conta" element={<MinhaConta />} />` dentro de `/dashboard`.

### Arquivos

**Novos**
- `src/pages/dashboard/MinhaConta.tsx`
- `src/components/dashboard/minha-conta/EditProfileDialog.tsx`
- `src/components/dashboard/minha-conta/ChangePasswordDialog.tsx`

**Modificados**
- `src/lib/sidebar-tabs.ts` — registrar a aba.
- `src/App.tsx` — registrar a rota.
- `src/hooks/useAuth.tsx` — expor `profile` e `refreshProfile`.
- `src/components/dashboard/AppSidebar.tsx` — mini-avatar no footer (opcional).

### Fora de escopo

- Histórico de compras de créditos (pode virar um card depois).
- Gerenciamento de sessões/dispositivos.
- Exclusão de conta.
- Recuperação de senha por email (já existe fluxo separado).

Sem mudanças de banco de dados — a tabela `profiles` já tem `avatar_url`, `nome`, `whatsapp`, `onboarding_completed` (criados no fluxo `/ativar`) e o bucket `avatars` já existe e é público.