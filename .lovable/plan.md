# Sistema de Parceiros (revendedores) — plano

## Conceito

```text
Admin (você)
  └─► gerencia Parceiros
        ├─ aprova / desativa / exclui
        ├─ define cotas (clientes, workspaces, créditos)
        ├─ vê dashboard agregado de cada um
        └─ "Ver como parceiro X" — entra na ótica dele
Parceiro (revendedor)
  └─► só vê e edita os próprios clientes/workspaces (RLS)
        ├─ bloqueado até admin aprovar
        ├─ bloqueado se atingir limite de créditos
        └─ nunca acessa /dashboard/users nem dados de outros
```

## Mudanças no banco (1 migration)

Nova tabela `parceiros` (1 linha por usuário, criada automaticamente no signup):

| campo | propósito |
|---|---|
| `user_id` (PK, FK auth.users) | o usuário |
| `nome`, `whatsapp` | exibição no painel admin |
| `status` enum: `pendente` / `ativo` / `suspenso` | sign-up cai em `pendente` |
| `limite_clientes` int (default 50) | cota |
| `limite_workspaces` int (default 100) | cota |
| `limite_creditos` numeric (default 1000) | quanto pode farmar |
| `creditos_consumidos` numeric (recalculado) | soma de `total_creditos_farmados` do resumo |
| `aprovado_em`, `aprovado_por`, `criado_em`, `atualizado_em` | auditoria |

**RLS**:
- Parceiro: SELECT/UPDATE só do próprio (campos editáveis: nome/whatsapp). Não pode mudar status nem cotas.
- Admin: tudo.

**Triggers**:
- No signup (`handle_new_user`): cria linha em `parceiros` com `status='pendente'`.
- Em `execucoes_lovable` BEFORE INSERT: bloqueia se parceiro está `pendente`/`suspenso` ou se já atingiu `limite_creditos`. (Defesa em profundidade — o frontend também checa.)
- Em `resumo_lovable_workspace` AFTER INSERT/UPDATE/DELETE: recalcula `creditos_consumidos` no `parceiros`.
- Quando `creditos_consumidos >= limite_creditos`, vira `suspenso` automaticamente.

**Função helper**:
```sql
public.parceiro_ativo(uuid) returns boolean  -- usada em RLS de inserts
```

**Bloqueio no front também** (rápido + UX): adicionar à RLS de INSERT em `contas_lovable`/`execucoes_lovable` o predicado `AND public.parceiro_ativo(auth.uid())`.

## Mudanças no frontend

### Hook `useAuth`
Buscar também o registro `parceiros` e expor:
```ts
{ session, user, isAdmin, parceiro: { status, limites, creditos_consumidos }, loading }
```

### Telas novas / alteradas

1. **`/dashboard/parceiros`** (nova, admin-only)
   - Lista todos os parceiros com: nome, email, status, clientes (count), workspaces (count), créditos consumidos / limite (barra de progresso), botão "Ver como".
   - Ações: Aprovar (pendente→ativo), Suspender, Reativar, Excluir, Editar cotas.
   - Cards no topo: Total / Pendentes / Ativos / Suspensos.

2. **`/dashboard/parceiros/:id`** (admin-only)
   - Detalhes de um parceiro: cotas editáveis, KPIs, atalho "Ver dados deste parceiro" (vai para Overview com `?as=<user_id>`).

3. **Sidebar**: nova entrada "Parceiros" só aparece se `isAdmin`. A entrada "Usuários" fica para gestão de roles (já existe).

4. **Modo "Ver como" (admin)**
   - Query param `?as=<user_id>` em qualquer página do dashboard.
   - Banner amarelo no topo: "Vendo como Fulano · sair desse modo".
   - As queries de admin filtram por `id_do_usuario = paramAs`. Não muda permissão real, só ponto de vista.

5. **Tela de bloqueio para parceiro**
   - Se `parceiro.status === 'pendente'`: mostra "Aguardando aprovação do administrador" em vez do dashboard.
   - Se `parceiro.status === 'suspenso'`: mostra "Conta suspensa — limite de créditos atingido / contate admin".
   - Aplicado no `ProtectedRoute` (ou novo wrapper `PartnerGate`).

6. **Indicador de cota no header**
   - Pequena barra "Créditos: 320 / 1000" sempre visível para parceiro. Vermelha quando >80%.

7. **Bloqueio de criação**
   - Botão "Novo cliente" desabilitado se atingiu `limite_clientes`. Idem para criar workspace/execução.

### Auth (`/auth`)
- Já tem signup. Após `signUp`, mostra mensagem: "Cadastro recebido. Aguardando aprovação do administrador. Você receberá acesso assim que aprovado."
- Login funciona normalmente, mas o gate decide o que mostrar.

## Nomenclatura
- Tabela: `parceiros`. Texto na UI: **"Parceiro"** / "Parceiros".
- A página atual `/dashboard/users` continua existindo só para gestão de **roles do sistema** (admin/user). Renomear visualmente para "Administradores" para evitar confusão.

## Não muda
- Estrutura de `contas_lovable`, `execucoes_lovable`, `resumo_lovable_workspace`, `user_roles`, `profiles`.
- RLS existente continua válido (parceiros já só viam o próprio por `id_do_usuario`).
- App desktop não precisa mudar — ele continua escrevendo execuções, e a trigger de bloqueio o impede automaticamente quando o parceiro estourar a cota.

## Ordem de execução
1. Migration: tabela `parceiros` + função `parceiro_ativo` + triggers + RLS + backfill (criar linha pendente para usuários existentes; **você fica `ativo` automaticamente por ser admin**).
2. Hook `useAuth` retorna `parceiro`.
3. `PartnerGate` (bloqueia pendente/suspenso).
4. Página `/dashboard/parceiros` (admin) + sidebar item.
5. Modo "Ver como" + banner.
6. Indicador de cota + bloqueios de criação no front.

Posso seguir direto após sua aprovação.
