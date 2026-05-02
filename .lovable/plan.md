## CRM Simples — Clientes Lovable

Vou transformar a tela atual de "Contas" em um CRM enxuto, focado só nos campos que você pediu: **Nome, WhatsApp, Email Lovable, Senha Lovable**.

### O que muda

**1. Banco de dados (migration)**
Adicionar 2 colunas na tabela `contas_lovable` que já existe:
- `nome` (text)
- `whatsapp` (text)

Mantém `email_lovable`, `senha_lovable`, `id_do_usuario` e RLS atual (cada usuário só vê os seus). Sem nova tabela — fica tudo num lugar só, simples.

**2. Tela `/dashboard/accounts` (vira o CRM)**

Layout com tema "Matrix leve" (preto + verde neon, glass cards, grid sutil), inspirado em Linear/Raycast — rápido e bonito sem exagero.

Conteúdo:
- **Header**: título "Clientes" + botão `+ Novo cliente` + busca (nome / whatsapp / email)
- **Cards de KPI** no topo: Total de clientes, Adicionados nos últimos 7 dias
- **Tabela** com colunas:
  - Nome
  - WhatsApp (com botão que abre `wa.me/<numero>`)
  - Email Lovable (com botão copiar)
  - Senha (mascarada `••••••••` + botão olho para revelar + botão copiar)
  - Criado em
  - Ações: Editar / Excluir
- **Modal Novo/Editar cliente** com os 4 campos, validação `zod`:
  - nome: obrigatório, 2–100 chars
  - whatsapp: obrigatório, só dígitos (máscara `(XX) XXXXX-XXXX`)
  - email_lovable: email válido
  - senha_lovable: obrigatório, mínimo 4 chars
- **Confirmação** antes de excluir (já existe)
- **Toasts** de sucesso/erro (sonner)

**3. Sidebar / Overview**
- Renomear item "Contas" → "Clientes"
- Overview mostra os mesmos KPIs + últimos 5 clientes adicionados

### Detalhes técnicos

- Migration: `ALTER TABLE contas_lovable ADD COLUMN nome text, ADD COLUMN whatsapp text;`
- Form: `react-hook-form` + `zod` + componentes `Form/Input/Dialog` do shadcn
- Senha visível: estado local `showPassword` por linha — nada é enviado/logado fora do Supabase
- WhatsApp: normaliza para só dígitos antes de salvar; `wa.me/55${numero}` ao clicar
- Tema: ajustes em `src/index.css` (HSL verde neon `142 76% 45%` em fundo `0 0% 4%`) + utilitário `glass-card` e `cyber-grid`. Mantém tema claro funcionando via toggle existente.

### Observação de segurança
Hoje `senha_lovable` é texto puro no banco (você já validou isso antes). Vou manter assim para esse fluxo de "cofre de credenciais". Se quiser cifragem reversível depois, fazemos numa segunda fase.

Posso seguir?
