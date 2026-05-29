## Objetivo

Deixar a tela `/auth` mais bonita e impactante mantendo a identidade Matrix (verde neon, mono, glitch), focando em **animações e efeitos visuais** — sem mudar layout, copy ou lógica de autenticação.

## O que vai mudar

### 1. Entrada do card (mount animation)
- Card faz `scale-in` + `fade-in` ao carregar (200–400ms, easing suave).
- Título "MATRIX PRO" entra com leve glitch + revelação por letra (stagger).
- Subtítulo e formulário entram em cascata (delays escalonados de 80ms).

### 2. Glitch aprimorado no título
- Reescrever `GlitchText` (ou um wrapper local na Auth) com duas camadas pseudo (`::before` / `::after`) em ciano e magenta deslocadas, ativando em loop sutil a cada ~6s e mais forte no hover.
- Manter o glow verde atual.

### 3. Borda animada do card
- Adicionar um "scan line" verde que percorre a borda do card em loop lento (conic-gradient animado em volta), criando sensação de hologram/perímetro vivo.
- Glow externo pulsando suavemente (box-shadow com `animate-pulse` customizado, 3s).

### 4. Inputs com microinterações
- Ícones (Mail, Lock) ganham glow verde no `:focus-within` do input.
- Borda do input transiciona de `primary/30` → `primary` com glow ao focar (transição 250ms).
- Pequeno underline animado (scan) aparecendo da esquerda → direita quando o input recebe foco.

### 5. Botão "Entrar / Criar conta"
- Hover: shimmer/sweep diagonal (gradiente que cruza o botão em 700ms).
- Loading: substituir texto por um efeito "decoding" (caracteres katakana aleatórios trocando até virar "ENTRANDO…").
- Active: leve `scale-[0.98]`.

### 6. Tabs (Entrar / Cadastrar)
- Indicador ativo desliza entre as abas com transição suave (já existe estado, falta animar a faixa).
- Sublinhado neon abaixo da aba ativa com glow.

### 7. Fundo
- Manter `MatrixRain` mas reduzir levemente a opacidade do overlay para dar mais presença à chuva atrás do card.
- Adicionar 2 orbs verdes desfocados flutuando lentamente atrás do card (já existem gradientes; trocar por divs animadas com `translate` em loop de ~12s).
- Adicionar uma "scanline" horizontal sutil percorrendo a tela inteira em loop (overlay com gradient + animação).

### 8. Rodapé "CONECTAR · DESPERTAR · EVOLUIR"
- Cada palavra com glow pulsando dessincronizado (delays diferentes), reforçando o ritmo Matrix.

## Detalhes técnicos

- **Arquivos a editar**:
  - `src/pages/Auth.tsx` — aplicar classes de animação, refatorar inputs e botão, animar tabs e rodapé.
  - `src/components/landing/GlitchText.tsx` — versão com glitch real (camadas duplicadas, keyframes).
  - `tailwind.config.ts` — adicionar keyframes: `glitch`, `border-scan`, `pulse-glow`, `shimmer`, `float-orb`, `scanline`, `fade-in-up`, e suas `animation` correspondentes.
  - `src/index.css` — utilitários `.glitch-layer`, `.scan-border`, `.shimmer-btn` se necessário (apenas classes utilitárias compostas, sem cores hard-coded; tudo via `hsl(var(--primary))`).

- **Sem mudanças** em: `useAuth`, lógica de submit, rotas, copy, tokens de cor do design system, MatrixRain.

- Performance: usar `transform` e `opacity` (GPU). Respeitar `prefers-reduced-motion` desativando loops contínuos (glitch, scanline, border-scan, orbs).

## Fora do escopo

- Não alterar fluxo de login/cadastro.
- Não trocar paleta nem fontes.
- Não mexer em outras páginas.
