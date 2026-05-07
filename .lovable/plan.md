
## Auditoria — sistema de atualização do app desktop

### O que já está pronto (verificado)

- **Tabela `public.app_releases`** com colunas `version` (unique), `download_url`, `sha256`, `file_size_bytes`, `changelog`, `is_mandatory`, `min_supported_version`, `is_published`, `published_at`, `created_by`, timestamps.
- **RLS**: anon + authenticated leem somente `is_published = true`; admin tem CRUD total.
- **Realtime** ativo: `app_releases` está em `supabase_realtime` com `replica identity full`.
- **Trigger** `set_app_releases_updated_at` atualiza `updated_at` e seta `published_at = now()` ao publicar.
- **Painel admin** `/dashboard/atualizacoes` com tabela, badge LATEST, criar/editar/publicar/despublicar/deletar.
- **Edge function** `app-version-check` (GET, pública) retorna `{ update_available, mandatory, latest_version, download_url, sha256, file_size_bytes, changelog, published_at }`.
- **Documentação Python** em `docs/desktop-updater.md` com listener Realtime + fallback HTTP + verificação SHA256.

### Gaps encontrados que ainda atrapalham o "100% funcional"

1. **Despublicar sem zerar `published_at`** — hoje, ao despublicar uma release o `published_at` é mantido; ao republicar, o trigger não reseta o timestamp porque a coluna não está nula. Resultado: badge "publicada em" mostra data antiga. Ajustar trigger.
2. **`min_supported_version` no form aceita string vazia, mas zod marca `.optional()` junto com `.refine`** — string vazia entra no caminho do refine e às vezes barra o submit. Validar antes do trim.
3. **Edge function não valida o param `current`** — se o cliente enviar lixo, `cmp` retorna `NaN`, e a comparação vira `false`. Validar com regex semver e tratar como `0.0.0`.
4. **Edge function com cache** — desktop pode receber resposta cacheada por proxies/CDN. Adicionar `Cache-Control: no-store`.
5. **Doc Python desatualizada** — a chamada `channel.on_postgres_changes` da `supabase-py` v2 exige `event` com valor explícito (`INSERT` ou `UPDATE`), não `*`. Também filtramos `is_published = true` no callback para evitar disparar em rascunho.
6. **Sem feedback visual de "release ativa hoje"** — adicionar destaque do `latest_published` no topo da página com botão "Copiar payload de teste" (útil para validar o fluxo no app desktop).
7. **Reaproveitar a função para forçar versão mínima** — quando admin sobe `min_supported_version`, qualquer cliente abaixo recebe `mandatory=true`. Já está implementado, apenas documentar no painel para o admin entender.

### Mudanças propostas

#### Banco (1 migration)

```sql
-- Trigger: ao despublicar, zerar published_at; ao republicar, setar de novo.
CREATE OR REPLACE FUNCTION public.set_app_releases_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_published = true AND NEW.published_at IS NULL THEN
      NEW.published_at = now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_published = true AND OLD.is_published = false THEN
      NEW.published_at = now();
    ELSIF NEW.is_published = false AND OLD.is_published = true THEN
      NEW.published_at = NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
```

#### Edge function `app-version-check`

- Validar `current` com regex semver, fallback `0.0.0`.
- Adicionar `Cache-Control: no-store, max-age=0` no header da resposta.
- Retornar `current_version` ecoado para debug.

#### Painel `/dashboard/atualizacoes`

- Card destacado para a release LATEST com:
  - botão "Copiar payload JSON" (formato igual ao do edge function);
  - botão "Testar edge function" (faz GET com `current=0.0.0` e mostra a resposta em toast).
- Aviso explicando que `min_supported_version` força atualização para todos abaixo dessa versão.

#### Form `ReleaseFormDialog.tsx`

- Tratar `min_supported_version` vazio antes do refine.
- Toast específico para erro de versão duplicada (`23505`).

#### Doc Python `docs/desktop-updater.md`

- Atualizar listener para `event="INSERT"` + filtro `is_published=true` no callback.
- Adicionar exemplo de updater Windows (extrair em pasta temp + `updater.bat`).
- Adicionar comparação semver via `packaging.version.Version` para evitar bugs de string.

### Como funciona ponta-a-ponta (recap para o admin)

```text
[Admin] painel /dashboard/atualizacoes
   │
   ├── insere row em app_releases (version, download_url, sha256, …, is_published=true)
   │
   ▼
[Postgres] trigger seta published_at=now()
   │
   ├──► supabase_realtime envia INSERT em app_releases
   │       │
   │       ▼
   │   [App desktop] listener recebe → compara semver → popup "Atualizar agora?"
   │
   └──► fallback: app no boot chama GET /functions/v1/app-version-check?current=X
           ▼
       resposta JSON com download_url + sha256 → app baixa, valida hash, instala, reinicia.
```

### Fora de escopo
- Canais beta/stable separados.
- Rollout gradual por % de usuários.
- Telemetria de quem atualizou.
- Auto-instalação silenciosa (mantém apenas o flag `is_mandatory`).
