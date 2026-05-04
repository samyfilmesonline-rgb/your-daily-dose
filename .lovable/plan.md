## Objetivo

Permitir que o admin **crie parceiros manualmente** pelo painel `/dashboard/parceiros`, mantendo todo o gerenciamento já existente (aprovar, suspender, reativar, editar cotas, ver-como, excluir).

## Diagnóstico

A página `src/pages/dashboard/Partners.tsx` já tem CRUD/gestão completa, exceto **criação manual**. Hoje o registro em `public.parceiros` é criado apenas pelo trigger `handle_new_user` quando alguém se cadastra via Auth.

Como `parceiros.user_id` aponta para um usuário do Auth e o frontend **não pode criar usuários no Auth de terceiros** com o anon key, precisamos de uma **edge function** com `SUPABASE_SERVICE_ROLE_KEY` para:
1. Criar (ou convidar) o usuário no Auth.
2. Garantir que `profiles`, `user_roles` e `parceiros` existam (o trigger já faz, mas garantimos idempotência).
3. Aplicar nome, whatsapp, status e cotas escolhidos pelo admin.

Apenas admins poderão chamar essa função (validação dentro da função usando o JWT do chamador + `has_role`).

## Mudanças

### 1. Edge Function: `supabase/functions/admin-create-partner/index.ts`
- Recebe: `{ email, nome?, whatsapp?, status?, limite_clientes?, limite_workspaces?, limite_creditos?, send_invite? }`.
- Lê o JWT do header `Authorization`, valida que o chamador é admin via `has_role(uid, 'admin')`.
- Se `send_invite=true` → `auth.admin.inviteUserByEmail(email)`; senão → `auth.admin.createUser({ email, email_confirm: true, password: <gerada> })` e retorna a senha temporária para o admin copiar.
- Faz upsert em `profiles`, `parceiros` (com cotas/status/nome/whatsapp informados) e garante `user_roles` `user`.
- Retorna `{ user_id, email, temp_password? }`.
- CORS habilitado, listada como `verify_jwt = true` em `supabase/config.toml`.

### 2. `supabase/config.toml`
Adicionar entrada da função (verify_jwt true, padrão).

### 3. `src/pages/dashboard/Partners.tsx`
- Botão **“Novo parceiro”** no header (visível só para admin — a página já é `AdminRoute`).
- Novo `Dialog` de criação com campos:
  - E-mail (obrigatório, validado com `zod`)
  - Nome
  - WhatsApp
  - Status inicial (`pendente` | `ativo`) — default `ativo`
  - Limite de clientes / workspaces / créditos (defaults 50/100/1000)
  - Switch “Enviar convite por e-mail” (se desligado, mostra senha temporária após criação para copiar)
- Chama `supabase.functions.invoke("admin-create-partner", { body })`.
- Em sucesso: toast, reload da lista, se houver `temp_password` mostra modal com botão de copiar.
- Validação client-side com `zod`, mensagens amigáveis para erros (RLS / duplicado / e-mail inválido).

### 4. Sem alterações de schema
RLS, tabelas e triggers existentes cobrem o fluxo. A função usa service_role internamente — nada vaza para o frontend.

## Segurança
- `service_role` permanece apenas na edge function (`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`).
- Função valida `admin` via JWT do chamador antes de qualquer operação.
- Frontend usa apenas o client anon padrão.

## Detalhes técnicos
- Senha temporária: `crypto.randomUUID().slice(0,12) + "Aa1!"` para atender política padrão.
- Idempotência: se o e-mail já existir no Auth, a função recupera o `user_id` existente e apenas atualiza/insere `parceiros` (sem sobrescrever cotas se já houver, a menos que o admin marque “sobrescrever”).
- Trigger `handle_new_user` continua funcionando para auto-cadastros.