## Sistema de Atualização do App Desktop (Python)

Vou montar um **gerenciador de releases** no painel admin + um **canal de push em tempo real** para os clientes detectarem novas versões instantaneamente.

### Arquitetura

```text
[Admin painel web]
    │ cria release (versão, URL R2, changelog, sha256)
    ▼
[Supabase: tabela app_releases]
    │ Realtime (postgres_changes INSERT)
    ▼
[App Python desktop]
    │ assina canal → recebe push instantâneo
    │ compara versão atual × latest
    │ mostra popup "Nova versão X disponível — atualizar agora?"
    │ se sim: baixa ZIP do R2 → valida sha256 → instala
```

Cloudflare R2 continua hospedando o ZIP. Supabase só guarda os **metadados** da release (rápido, barato, com Realtime nativo).

---

### 1. Banco — tabela `app_releases`

Campos:
- `version` (semver, ex: `1.4.2`) — único
- `download_url` (URL pública do R2)
- `sha256` (hash do ZIP, para validar integridade)
- `file_size_bytes`
- `changelog` (markdown — mostrado no popup)
- `is_mandatory` (bool, default false — já deixa pronto pra futuro, mesmo que hoje seja só "opcional")
- `min_supported_version` (opcional — abaixo disso força update)
- `is_published` (bool — admin publica/despublica sem deletar)
- `published_at`, `created_at`, `updated_at`, `created_by`

**RLS:**
- `SELECT` público (anon + authenticated) — apenas releases com `is_published = true`. O app desktop usa a anon key pra ler.
- `INSERT/UPDATE/DELETE` apenas admin (via `has_role`).

**Realtime:** habilitar replicação na tabela (`alter publication supabase_realtime add table app_releases`) e `replica identity full` para o desktop receber o payload completo.

---

### 2. Painel admin — nova aba "Atualizações"

- Rota: `/dashboard/atualizacoes`
- Registrar em `src/lib/sidebar-tabs.ts` (ícone `Download` ou `Package`) — fica automaticamente disponível no painel de permissões.
- Protegida por `AdminRoute`.

**UI (tema Matrix consistente):**
- **Lista de releases** (tabela): versão, status (publicado/rascunho), data, downloads previstos, ações (editar, publicar/despublicar, deletar).
- **Botão "Nova release"** → dialog com:
  - Versão (validação semver)
  - URL do ZIP no R2
  - Changelog (textarea markdown)
  - Botão "Calcular SHA256 da URL" (chama edge function que baixa o head + hash, ou pede pro admin colar manualmente — vamos no manual pra evitar custo de egress; mostro como gerar com `sha256sum` no rodapé do dialog)
  - Tamanho do arquivo (auto-fetch via HEAD na URL, com fallback manual)
  - Toggle "Publicar imediatamente"
- **Badge "Latest"** na release publicada mais recente.

---

### 3. Endpoint para o app Python

Edge function pública `app-version-check` (sem JWT):
- `GET /app-version-check?current=1.3.0`
- Retorna: `{ latest_version, download_url, sha256, file_size, changelog, is_mandatory, update_available: bool }`
- Usado como **fallback de polling** (a cada inicialização do app) caso o Realtime esteja desconectado.

---

### 4. Integração no app desktop Python (instruções)

Como você não me deu acesso ao código Python, vou entregar um **snippet pronto** documentado dentro de um arquivo `docs/desktop-updater.md` com:

- Conexão Realtime via `realtime-py` (oficial Supabase): assina `postgres_changes` na tabela `app_releases` filtrando `event=INSERT` e `is_published=true`.
- Função `check_for_updates()` que chama a edge function no boot.
- Comparação semver com `packaging.version`.
- Download com barra de progresso, validação `hashlib.sha256`, e instalação (descompactar sobre o diretório atual + restart).
- Snippet do popup (Tk/PyQt — adaptável).

---

### 5. Detalhes técnicos

- **Sem custo de storage no Supabase**: ZIP fica no R2, só URL é guardada.
- **Realtime authoritativo**: cliente recebe push em < 1s após admin publicar.
- **Integridade**: sha256 obrigatório evita ZIP corrompido/adulterado.
- **Idempotente**: app guarda última versão vista localmente; se receber duplicata, ignora.
- **Sem segredos no client**: anon key + RLS de leitura pública na tabela cobrem o caso.

---

### Arquivos a criar/editar

**Migração SQL:** tabela `app_releases` + RLS + trigger `updated_at` + habilitar realtime.

**Frontend:**
- `src/pages/dashboard/Atualizacoes.tsx` — listagem
- `src/components/dashboard/atualizacoes/ReleaseFormDialog.tsx` — criar/editar
- `src/components/dashboard/atualizacoes/ReleaseRowActions.tsx` — publicar/despublicar/deletar
- `src/lib/releases.ts` — helpers (semver, fetch, mutations)
- `src/lib/sidebar-tabs.ts` — adicionar entrada
- `src/App.tsx` — registrar rota

**Edge function:** `supabase/functions/app-version-check/index.ts`

**Doc:** `docs/desktop-updater.md` — código Python pronto pra colar no seu app, com exemplo de Realtime + popup + download + instalação.

---

### Fora de escopo (deixados para depois, fáceis de adicionar)

- Canais beta/stable, rollout gradual por licença, telemetria de "quem atualizou".
- Auto-instalação obrigatória — campo `is_mandatory` já fica no schema, é só ligar no app Python depois.