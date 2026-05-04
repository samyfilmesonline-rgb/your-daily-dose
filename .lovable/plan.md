## Objetivo

Criar uma área **Licenças** no painel para que parceiros ativos gerenciem registros em `public.app_licenses` (que o app desktop Python lê para liberar acesso). Nenhuma chamada usa `service_role` — apenas o cliente Supabase autenticado, respeitando as policies já existentes.

## Navegação e acesso

- Adicionar item **"Licenças"** (`/dashboard/licencas`, ícone `KeyRound`) na sidebar (`AppSidebar.tsx`), visível para **parceiros ativos e admins** (não só admin).
- Nova rota em `App.tsx` protegida por `ProtectedRoute` + um novo wrapper `ActivePartnerRoute` que:
  - Admin sempre passa.
  - Parceiro com `status === "ativo"` passa.
  - Caso contrário, renderiza tela: *"Seu cadastro de parceiro ainda não está ativo."* (reaproveita visual do `PartnerGate`).
- Quando admin estiver em modo "View As", filtrar licenças por `partner_id = viewAs`.

## Página `src/pages/dashboard/Licenses.tsx`

### Topo — cards de resumo
4 cards calculados a partir do resultado já carregado:
- **Ativas** (`status in ('active','ativo')` e não expirada)
- **Bloqueadas** (`status in ('blocked','bloqueado')`)
- **Expirando em 7 dias** (ativas com `expires_at` entre hoje e +7d)
- **Total de clientes** (count distinct `customer_email`)

### Toolbar
- Busca por nome/e-mail (filtro client-side sobre `customer_name` / `customer_email`).
- Filtro por status (chips: Todos / Ativo / Pendente / Bloqueado / Expirado).
- Botão **"Nova licença"** (abre dialog de criação).
- Botão **Atualizar** (refetch).

### Tabela
Colunas: Cliente · E-mail · Status (badge colorido) · Plano (`plan_name` + código) · Expiração (com destaque âmbar se ≤7d, vermelho se vencida) · Máquinas (`machine_hashes.length / max_machines`) · Última atividade (`last_seen_at`) · Criada em · Ações.

Ações por linha (dropdown menu):
- **Editar** — dialog com nome, plano, expiração, max_machines, observações.
- **Renovar** — popover com seletor de período (+30/+90/+180/+365 dias ou data custom) → update `expires_at` e, se estava expirada, voltar `status = 'active'`.
- **Bloquear / Reativar** — toggle status entre `'blocked'` e `'active'` (com `AlertDialog` de confirmação para bloquear).
- **Resetar máquina** — `AlertDialog` de confirmação → update `machine_hash = null`, `machine_hashes = []`, `activated_at = null`.

Estados: skeleton no carregamento; empty state amigável ("Nenhuma licença ainda — crie a primeira"); toasts (`sonner`) de sucesso/erro. Em erro 42501 (RLS) ou similar, mensagem: *"Você não tem permissão. Verifique se seu cadastro de parceiro está ativo."*

### Dialog "Nova licença"
Formulário validado com **zod** + react-hook-form:
- `customer_name` (string, opcional, máx 120)
- `customer_email` (email obrigatório, normalizado para `lower().trim()`)
- `plan_code` select: `monthly | quarterly | semiannual | annual`
- `plan_name` derivado automaticamente: Mensal / Trimestral / Semestral / Anual (editável)
- `expires_at` (date input; sugestão automática: hoje + duração do plano)
- `max_machines` (number, default 1, min 1, máx 10)
- `notes` (textarea, opcional, máx 500)

Antes do insert, **verificar duplicidade**: `select id from app_licenses where partner_id = auth.uid() and customer_email = <normalized> limit 1`. Se existir → toast "Já existe uma licença para este e-mail" e abortar.

Insert payload:
```ts
{
  customer_email,                  // já normalizado
  customer_name,
  partner_id: user.id,             // trigger preenche partner_name/whatsapp
  status: 'active',
  plan_code, plan_name,
  max_machines,
  expires_at,                      // ISO
  notes,
}
```
(`id_do_usuario`, `machine_hash`, `machine_hashes`, `activated_at`, `last_seen_at` ficam nulos/default — o app desktop preenche.)

## Hook `useAuth`

Expor também `parceiro?.status` já existe — sem mudanças necessárias além de **garantir que parceiros ativos vejam a sidebar** (alterar `AppSidebar` para mostrar "Licenças" quando `isAdmin || parceiro?.status === 'ativo'`).

## Segurança e RLS

Policies já existentes em `app_licenses` cobrem o caso (insert exige `partner_id = auth.uid() AND is_active_partner()`; select/update idem). **Nenhuma migration de banco é necessária** — todas as operações usam o client anon autenticado. Nenhum `service_role` no frontend.

Tratamento de erros:
- Mapear `code === '42501'` ou mensagem "row-level security" → "Sem permissão. Confirme se seu cadastro de parceiro está ativo."
- Demais erros → mostrar `error.message` em toast destrutivo.

## Arquivos a criar / editar

Criar:
- `src/pages/dashboard/Licenses.tsx`
- `src/components/auth/ActivePartnerRoute.tsx`
- `src/components/dashboard/licenses/LicenseFormDialog.tsx` (criar/editar)
- `src/components/dashboard/licenses/LicenseRowActions.tsx`
- `src/lib/licenses.ts` (helpers: normalização de status, cálculo de expiração, mapeamento plan_code→plan_name e duração)

Editar:
- `src/App.tsx` — registrar rota `/dashboard/licencas`.
- `src/components/dashboard/AppSidebar.tsx` — incluir item "Licenças" para admins e parceiros ativos.

## Fora de escopo

- Criação/edição de campos sensíveis (`partner_id`, `id_do_usuario`, `machine_hash*`) — protegidos por trigger; UI não tenta alterá-los exceto no "Resetar máquina".
- Exclusão de licenças (RLS já bloqueia DELETE).
- Painel admin agregado de licenças entre parceiros (pode ser feito depois).
