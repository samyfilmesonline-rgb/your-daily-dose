## Modo escuro com switch de alternância

### Arquivos a criar
- `src/hooks/useTheme.tsx` — Context provider que gerencia tema (`light`/`dark`), persiste em `localStorage`, aplica classe `dark` no `<html>`, com fallback para `prefers-color-scheme`. Inicialização síncrona para evitar flash.
- `src/components/ThemeToggle.tsx` — Botão com ícones Sun/Moon (lucide-react) e aria-label para acessibilidade.

### Arquivos a editar
- `src/App.tsx` — Envolver a app com `ThemeProvider` acima do `AuthProvider`.
- `src/components/dashboard/DashboardLayout.tsx` — Adicionar `ThemeToggle` no header (alinhado à direita).
- `src/pages/Auth.tsx` — Adicionar `ThemeToggle` no canto superior direito da tela de login.
- `src/index.css` — Adicionar `transition-colors` no body para troca suave entre temas.

### Por que funciona sem mais nada
- Tailwind já está configurado com `darkMode: ["class"]`.
- `src/index.css` já define todas as variáveis HSL para `.dark` (background, card, sidebar, border, primary, etc.), então sidebar, KPIs, gráfico Recharts (usa `hsl(var(--primary))` e `hsl(var(--border))`), tabela, dialogs e toasts vão se adaptar automaticamente.
- Sem dependência nova: não vou adicionar `next-themes` (o `sonner.tsx` o importa mas cai no fallback "system" e continua funcionando).

### Resultado
Switch sol/lua visível no header do dashboard e na tela de auth, alternância instantânea, preferência salva entre sessões, todos os componentes seguindo o tema automaticamente.