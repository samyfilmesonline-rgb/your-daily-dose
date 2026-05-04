## Objetivo

Hoje o "gerenciador" (`/dashboard/*`) usa o tema neutro padrão (claro/escuro genérico shadcn), enquanto a página `/vendas` já está toda no estilo Matrix (verde neon, fundo preto, MatrixRain, GlitchText, cards com borda verde e glow). Vou alinhar o gerenciador ao mesmo estilo visual — tomando como referência o projeto `matrix-farm` (AdminLayout + Dashboard) e a página `/vendas` deste projeto — para que tudo fique coerente.

## Escopo

Áreas afetadas:
- Casca do painel: `DashboardLayout`, `AppSidebar`, header, `QuotaBadge`, `ViewAsBanner`.
- Páginas: `Overview`, `Accounts`, `Licenses`, `Workspaces`, `Users`, `Partners`.
- Diálogos do gerenciador: `LicenseFormDialog`, `LicenseRowActions`, `TabPermissionsDialog`.

Sem mudanças de funcionalidade — só visual/estrutura de classes. Nenhum ajuste de banco, RLS ou edge functions.

## Direção visual (igual à /vendas e ao matrix-farm)

- Tema verde Matrix permanente no `/dashboard/*` (mesma paleta HSL já usada no `matrixThemeStyle` da Vendas):
  - background `120 10% 2%`, foreground `120 80% 90%`, primary `120 100% 45%`, border `120 30% 18%` etc.
- Aplicado via classe `.matrix-theme` no container raiz do `DashboardLayout`, idêntico ao que a Vendas faz (não mexe no `index.css` global, então o resto do app continua igual).
- Fundo: `MatrixRain` sutil + overlay escurecedor + glow orbs no topo/rodapé (mesmos componentes de `src/components/landing/`).
- Tipografia: títulos em `font-mono` com `GlitchText`, body normal. Uppercase tracking em rótulos de seção.
- Cards: `border border-primary/30 rounded-2xl bg-card/40 backdrop-blur` com hover `border-primary/60` e glow `shadow-[0_0_40px_hsl(var(--primary)/0.15)]` — replicando o `StatsCardNew`/`DashboardCard` do matrix-farm.
- KPIs: ícone dentro de quadrado `bg-primary/20 border border-primary/40 rounded-xl`, número grande, label em `text-muted-foreground`.
- Tabelas/listas: linhas `divide-primary/15`, hover `bg-primary/5`, badges de status com cores semânticas (primary/destructive/secondary) já existentes no shadcn aplicadas sobre o tema verde.
- Sidebar: header com selo "M" verde + "Matrix Admin / Console", itens ativos com `bg-primary/15 text-primary border-l-2 border-primary`. Footer com botão Sair em `text-destructive`.
- Header do painel: barra fina translúcida `bg-background/60 backdrop-blur border-b border-primary/20`, breadcrumb/título à esquerda em `font-mono uppercase`.
- Charts (recharts): manter, só trocar cores para `hsl(var(--primary))` e grids/eixos em `hsl(var(--border))` / `hsl(var(--muted-foreground))` (já está assim em parte do Overview).
- Diálogos: `DialogContent` com `border-primary/30 bg-card/95 backdrop-blur`.

## Mudanças por arquivo

1. `src/components/dashboard/DashboardLayout.tsx`
   - Envolver tudo em `<div className="matrix-theme min-h-screen bg-background text-foreground relative overflow-x-hidden">`.
   - Injetar o mesmo bloco `<style>` do `matrixThemeStyle` da Vendas (ou extrair para `src/lib/matrix-theme.ts` para reuso entre Vendas e Dashboard).
   - Adicionar `<MatrixRain />` + overlays/glow orbs (`fixed`, `z-[1/2]`, `pointer-events-none`).
   - Header com classes Matrix (translúcido, borda verde, fonte mono).
   - `main` com `relative z-10`.

2. `src/components/dashboard/AppSidebar.tsx`
   - Trocar selo "L / Lovable Admin" por "M / Matrix Admin · Console" no padrão da Vendas (selo verde, mono, uppercase).
   - Itens ativos com estilo verde neon (via classes no `SidebarMenuButton`/`NavLink`).
   - Footer: e-mail em mono pequeno, badge "Admin" com `Crown` em verde.

3. `src/components/dashboard/QuotaBadge.tsx` e `ViewAsBanner.tsx`
   - Repaginar com borda `primary/30`, fundo `primary/10`, texto `primary`.

4. `src/pages/dashboard/Overview.tsx`
   - Título "Visão geral" → `<GlitchText>VISÃO GERAL</GlitchText>` em `font-mono`.
   - Recriar `KpiCard` e `SectionCard` locais usando o estilo do matrix-farm (glow + ícone em quadrado verde).
   - Ajustar AreaChart já está usando `hsl(var(--primary))` — ok.

5. `src/pages/dashboard/Accounts.tsx`, `Licenses.tsx`, `Workspaces.tsx`, `Users.tsx`, `Partners.tsx`
   - Padronizar cabeçalho da página: título `font-mono` com `GlitchText`, subtítulo em `text-muted-foreground`, botões primários em estilo Matrix (`uppercase tracking-wider`).
   - Trocar `Card` por wrapper `.matrix-card` (helper de classes utilitárias) ou aplicar as classes diretamente.
   - Tabelas: header em `text-primary/80 uppercase tracking-wider text-xs`, linhas com hover verde discreto.
   - Filtros/inputs já usam shadcn, vão herdar o tema do `matrix-theme`.

6. `src/components/dashboard/licenses/LicenseFormDialog.tsx`, `LicenseRowActions.tsx`, `src/components/dashboard/users/TabPermissionsDialog.tsx`
   - Aplicar bordas/fundos verdes nos `DialogContent`, `DropdownMenuContent`, `AlertDialogContent`.
   - Botões destrutivos mantêm vermelho do shadcn (`destructive`), que combina com o tema.

7. (Opcional) `src/lib/matrix-theme.ts`
   - Extrair a string `matrixThemeStyle` e usá-la tanto em `Vendas.tsx` quanto em `DashboardLayout.tsx` para evitar duplicação.

## Detalhes técnicos

- O tema é aplicado via CSS variables sob a classe `.matrix-theme` (padrão já usado em Vendas), isolando o efeito do dashboard sem afetar `/auth`, `/`, `NotFound`, etc.
- Os componentes `MatrixRain`, `GlitchText`, `Marquee` ficam em `src/components/landing/` e são reutilizados — sem necessidade de duplicar código nem mover arquivos.
- Recharts: como tudo lê `hsl(var(--primary))` / `hsl(var(--border))`, não é preciso tocar nos dados, só garantir que estejam dentro do escopo `.matrix-theme`.
- `MatrixRain` é canvas em `position: fixed` z-index baixo + `pointer-events-none`, não interfere no sidebar (que tem fundo sólido via `--sidebar-background`).
- Performance: `MatrixRain` já está em uso na Vendas; carregar no painel é ok. Se ficar pesado em listas grandes, posso trocar por `MatrixRainCSS` mais leve depois.
- Sem mudanças em rotas, hooks, queries, RLS, permissions.

## Fora de escopo

- Página `/auth` e `/` (Index) — manter como estão, salvo pedido.
- Não vou refatorar a lógica de dados nem migrações.
- Não mudo `index.css` global; o tema Matrix continua escopado por classe.

## Resultado esperado

- `/vendas` continua igual.
- Todo `/dashboard/*` aparece em verde Matrix, com a mesma "vibe" da landing e do projeto matrix-farm: fundo preto com chuva de código, cards translúcidos com borda verde e glow no hover, títulos em mono com glitch, sidebar verde neon.
