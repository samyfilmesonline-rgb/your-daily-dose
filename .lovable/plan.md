## Problema

Na página de compra do cliente final (`/comprar/:partnerId`) o layout quebra em larguras intermediárias e mobile:

- O card do pacote usa um título `text-3xl md:text-4xl` que estoura horizontalmente e o painel lateral fixo de 360px convive mal com larguras entre 768–1024px.
- O painel de preço (R$ em `text-5xl`) ocupa espaço demais na coluna direita e força wrap feio.
- O dialog de acompanhamento (`OrderTrackingInline` / `HistoryTrackingDialog`) usa `grid-cols-2` fixos em telas estreitas, gerando textos cortados / colunas espremidas.
- O banner de saldo verde, header e seção de "requisitos" não respiram bem em mobile.
- O histórico de pedidos tem coluna de ações `md:w-44` que quebra em larguras médias.

## O que vai mudar (somente CSS/layout — nenhuma mudança de lógica)

Arquivo único: `src/pages/ComprarParceiro.tsx`.

### 1. Container principal
- Reduzir paddings em mobile (`p-3 sm:p-4 md:p-8`) e ajustar `space-y` responsivo.

### 2. Header da loja
- Reduzir tamanhos em mobile: `text-xl sm:text-2xl md:text-4xl`.
- Padding `p-4 sm:p-6`.

### 3. Banner de saldo verde
- Em mobile: empilhar com botão full-width.
- Reduzir tamanho do número (`text-2xl sm:text-3xl`) e ícone.

### 4. Tabs
- `TabsList` full-width sem `max-w-md` em mobile, recuperar limite só em `sm:`.
- Triggers com texto encurtado em mobile (ícone + label menor).

### 5. Card de pacote (principal foco)
- Trocar grid para `grid-cols-1 lg:grid-cols-[1fr_340px]` (em vez de `md:`), evitando colunas espremidas em tablets.
- Título: `text-2xl sm:text-3xl lg:text-4xl` com `break-words`.
- Painel de preço: padding `p-4 sm:p-5`, valor `text-4xl sm:text-5xl`, alinhamento centralizado em mobile.
- Botão CTA: texto adaptado, `whitespace-normal` para não estourar.
- Lista de features com tamanho menor em mobile.

### 6. Seção "Requisitos"
- Padding e fontes ajustadas para mobile.

### 7. Dialog de tracking (`OrderTrackingInline`)
- `DialogContent` ganhar `w-[calc(100%-1rem)] max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6`.
- Grid de info: `grid-cols-1 sm:grid-cols-2`.
- Painel "Farm em andamento": números menores em mobile, sub-grid `grid-cols-1 xs:grid-cols-2`.
- Bloco "Convide o bot": e-mail com `break-all` e botão full-width em mobile.

### 8. Histórico de pedidos
- Card do pedido: ações em mobile como linha rolável horizontal ou full-width abaixo do conteúdo; em md+ manter coluna lateral mais flexível (`md:w-auto md:min-w-[10rem]`).
- Filtro de e-mail: input + botão empilhados em mobile.

### 9. Outros diálogos (`max-w-sm`/`max-w-md`/`max-w-lg`)
- Adicionar `w-[calc(100%-1rem)]` e `max-h-[90vh] overflow-y-auto` para evitar dialogs cortados em telas pequenas (Android/iOS).

## Verificação

- Conferir no preview com viewports 375px, 414px, 768px, 948px e 1280px.
- Testar abrir o dialog de acompanhamento em cada largura.
- Garantir que nenhum texto fique cortado e que CTAs sejam clicáveis sem rolagem horizontal.

Sem mudanças em business logic, edge functions, schema ou tipos.
