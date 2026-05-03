# Auditoria do banco + frontend — falhas encontradas

Olhei o schema, RLS, dados reais e o código. **A estrutura está OK, mas os dados estão fora de sincronia** e há um bug visual no frontend. Não é nada quebrado de propósito — é falta de "cola" entre as 3 tabelas.

## O que encontrei

### 1. CRÍTICO — `resumo_lovable_workspace` está dessincronizado com `execucoes_lovable`

Os números não batem:

| Workspace | Execuções reais (`execucoes_lovable`) | No resumo | Créditos reais | Resumo |
|---|---|---|---|---|
| `mar's Lovable` | **6** | 3 | **200** | 40 |
| `Eeduardo's LovablePro` | 1 | 1 | 0 | 0 |
| `Lucass2` | **1** | **AUSENTE** | 40 | — |
| `marc's Lovable` | **1** | **AUSENTE** | 0 | — |
| (sem nome) | 1 | (ignorado) | 0 | — |

**Causa:** o resumo é populado por um agente externo (app desktop). Não existe trigger no Postgres que mantenha o resumo atualizado quando uma execução é inserida/atualizada. Se o app falhar uma vez, o resumo nunca recupera.

**O usuário vê dados errados** no painel: "Workspaces" mostra 2 quando há 4 reais; "Créditos farmados" mostra 40 quando o cliente farmou 200.

### 2. CRÍTICO — Status `"falha"` não é reconhecido pelo frontend

No banco os status reais são `falha` e `em_andamento`. Mas o frontend espera `concluido`, `limite`, `erro`, `em_andamento`. Resultado:

- O badge de "Último status" mostra a string crua `"falha"` sem cor/ícone.
- O filtro "Erro" não filtra nada (filtra `erro`, mas o banco tem `falha`).
- Nas execuções concluídas com sucesso, qual é o status? Não há nenhuma no banco hoje, mas o código ainda espera `concluido`. Precisa alinhar com o que o app desktop realmente grava.

### 3. MÉDIO — `execucoes_lovable.conta_id` nunca é preenchido

10/10 execuções têm `conta_id = NULL`. A FK existe mas é inútil. O link entre execução e cliente é feito 100% por `email_lovable` (lookup em memória no frontend). Funciona, mas é frágil (case-sensitive, sem índice).

### 4. BAIXO — Execução com `workspace_nome = NULL`

1 execução não tem workspace. Some completamente do CRM (resumo exige `workspace_nome NOT NULL`). Tudo bem ignorar, mas vale registrar.

### 5. OK — RLS, tipos, auth, layout

Policies estão coerentes. `has_role` está SECURITY DEFINER. Tipos do Supabase estão atualizados. Não há recursão. Sem riscos de segurança novos.

---

## Plano de correção

### A. Banco — criar trigger de sincronização (migration)

Trigger `AFTER INSERT/UPDATE/DELETE` em `execucoes_lovable` que faz UPSERT em `resumo_lovable_workspace` recalculando os totais a partir das execuções reais. Garante que o resumo **nunca mais** fica fora de sincronia, independente do app desktop.

```sql
-- Recalcula a linha do resumo para um (id_do_usuario, email_lovable, workspace_nome)
CREATE OR REPLACE FUNCTION public.recalc_resumo_lovable_workspace(
  p_id_do_usuario uuid, p_email text, p_workspace text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF p_workspace IS NULL THEN RETURN; END IF;

  SELECT
    COUNT(*)::int AS total_execucoes,
    COUNT(*) FILTER (WHERE status IN ('concluido','sucesso'))::int AS total_sucessos,
    COUNT(*) FILTER (WHERE status = 'limite')::int AS total_limites,
    COUNT(*) FILTER (WHERE status IN ('falha','erro'))::int AS total_falhas,
    COALESCE(SUM(creditos_adicionados),0) AS total_creditos_farmados,
    (ARRAY_AGG(creditos_finais ORDER BY iniciado_em DESC))[1] AS ultimo_creditos_finais,
    (ARRAY_AGG(status ORDER BY iniciado_em DESC))[1] AS ultima_execucao_status,
    (ARRAY_AGG(id ORDER BY iniciado_em DESC))[1] AS ultima_execucao_id,
    MAX(atualizado_em) AS atualizado_em
  INTO r
  FROM execucoes_lovable
  WHERE id_do_usuario = p_id_do_usuario
    AND email_lovable = p_email
    AND workspace_nome = p_workspace;

  IF r.total_execucoes = 0 THEN
    DELETE FROM resumo_lovable_workspace
     WHERE id_do_usuario = p_id_do_usuario
       AND email_lovable = p_email
       AND workspace_nome = p_workspace;
    RETURN;
  END IF;

  INSERT INTO resumo_lovable_workspace AS t
    (id_do_usuario, email_lovable, workspace_nome,
     total_execucoes, total_sucessos, total_limites, total_falhas,
     total_creditos_farmados, ultimo_creditos_finais,
     ultima_execucao_status, ultima_execucao_id, atualizado_em)
  VALUES
    (p_id_do_usuario, p_email, p_workspace,
     r.total_execucoes, r.total_sucessos, r.total_limites, r.total_falhas,
     r.total_creditos_farmados, r.ultimo_creditos_finais,
     r.ultima_execucao_status, r.ultima_execucao_id, COALESCE(r.atualizado_em, now()))
  ON CONFLICT (id_do_usuario, email_lovable, workspace_nome) DO UPDATE
    SET total_execucoes = EXCLUDED.total_execucoes,
        total_sucessos = EXCLUDED.total_sucessos,
        total_limites = EXCLUDED.total_limites,
        total_falhas = EXCLUDED.total_falhas,
        total_creditos_farmados = EXCLUDED.total_creditos_farmados,
        ultimo_creditos_finais = EXCLUDED.ultimo_creditos_finais,
        ultima_execucao_status = EXCLUDED.ultima_execucao_status,
        ultima_execucao_id = EXCLUDED.ultima_execucao_id,
        atualizado_em = EXCLUDED.atualizado_em;
END $$;

-- UNIQUE necessário para o ON CONFLICT
ALTER TABLE resumo_lovable_workspace
  ADD CONSTRAINT resumo_lovable_workspace_unico
  UNIQUE (id_do_usuario, email_lovable, workspace_nome);

-- Trigger
CREATE OR REPLACE FUNCTION public.tg_sync_resumo_lovable_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_resumo_lovable_workspace(OLD.id_do_usuario, OLD.email_lovable, OLD.workspace_nome);
  ELSE
    PERFORM recalc_resumo_lovable_workspace(NEW.id_do_usuario, NEW.email_lovable, NEW.workspace_nome);
    IF TG_OP='UPDATE' AND (OLD.email_lovable<>NEW.email_lovable OR COALESCE(OLD.workspace_nome,'')<>COALESCE(NEW.workspace_nome,'')) THEN
      PERFORM recalc_resumo_lovable_workspace(OLD.id_do_usuario, OLD.email_lovable, OLD.workspace_nome);
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_sync_resumo
AFTER INSERT OR UPDATE OR DELETE ON execucoes_lovable
FOR EACH ROW EXECUTE FUNCTION tg_sync_resumo_lovable_workspace();

-- Backfill imediato dos dados existentes
INSERT INTO resumo_lovable_workspace (id_do_usuario,email_lovable,workspace_nome,total_execucoes,total_sucessos,total_limites,total_falhas,total_creditos_farmados,ultimo_creditos_finais,ultima_execucao_status,ultima_execucao_id,atualizado_em)
SELECT id_do_usuario,email_lovable,workspace_nome,
  COUNT(*),
  COUNT(*) FILTER (WHERE status IN ('concluido','sucesso')),
  COUNT(*) FILTER (WHERE status='limite'),
  COUNT(*) FILTER (WHERE status IN ('falha','erro')),
  COALESCE(SUM(creditos_adicionados),0),
  (ARRAY_AGG(creditos_finais ORDER BY iniciado_em DESC))[1],
  (ARRAY_AGG(status ORDER BY iniciado_em DESC))[1],
  (ARRAY_AGG(id ORDER BY iniciado_em DESC))[1],
  MAX(atualizado_em)
FROM execucoes_lovable
WHERE workspace_nome IS NOT NULL
GROUP BY 1,2,3
ON CONFLICT (id_do_usuario,email_lovable,workspace_nome) DO UPDATE SET
  total_execucoes=EXCLUDED.total_execucoes,
  total_sucessos=EXCLUDED.total_sucessos,
  total_limites=EXCLUDED.total_limites,
  total_falhas=EXCLUDED.total_falhas,
  total_creditos_farmados=EXCLUDED.total_creditos_farmados,
  ultimo_creditos_finais=EXCLUDED.ultimo_creditos_finais,
  ultima_execucao_status=EXCLUDED.ultima_execucao_status,
  ultima_execucao_id=EXCLUDED.ultima_execucao_id,
  atualizado_em=EXCLUDED.atualizado_em;

-- Auto-preencher conta_id por email
CREATE OR REPLACE FUNCTION public.tg_set_conta_id_execucoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.conta_id IS NULL AND NEW.email_lovable IS NOT NULL THEN
    SELECT id INTO NEW.conta_id
    FROM contas_lovable
    WHERE id_do_usuario = NEW.id_do_usuario
      AND lower(email_lovable) = lower(NEW.email_lovable)
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_set_conta_id BEFORE INSERT OR UPDATE ON execucoes_lovable
FOR EACH ROW EXECUTE FUNCTION tg_set_conta_id_execucoes();

UPDATE execucoes_lovable e SET conta_id = c.id
  FROM contas_lovable c
 WHERE e.conta_id IS NULL AND e.id_do_usuario=c.id_do_usuario
   AND lower(e.email_lovable)=lower(c.email_lovable);

-- Índices
CREATE INDEX IF NOT EXISTS idx_exec_user_email_ws ON execucoes_lovable(id_do_usuario,email_lovable,workspace_nome);
CREATE INDEX IF NOT EXISTS idx_resumo_email ON resumo_lovable_workspace(lower(email_lovable));
```

### B. Frontend — alinhar status (`Workspaces.tsx`, `Overview.tsx`)

Aceitar tanto `falha` quanto `erro` (mesma cor vermelha) e tanto `concluido` quanto `sucesso`. Fica:

```ts
const statusMeta = {
  em_andamento: { label: "Em andamento", cls: "amber...", Icon: Activity },
  concluido:    { label: "Sucesso",      cls: "primary...", Icon: CheckCircle2 },
  sucesso:      { label: "Sucesso",      cls: "primary...", Icon: CheckCircle2 },
  limite:       { label: "Limite",       cls: "blue...", Icon: AlertCircle },
  erro:         { label: "Erro",         cls: "destructive...", Icon: AlertTriangle },
  falha:        { label: "Falha",        cls: "destructive...", Icon: AlertTriangle },
};
```

E o filtro "Erro" passa a usar `IN ('erro','falha')` em memória. Idem para "Sucesso".

### C. Não muda
- Schema das outras tabelas, RLS, auth, sidebar, página de Usuários.
- O app desktop pode continuar gravando direto no resumo se quiser — a trigger faz UPSERT idempotente, não conflita.

---

## Resumo do que o usuário ganha

- **Painel sempre correto**: créditos, contagens e status no CRM passam a refletir a realidade do banco automaticamente, mesmo que o agente externo falhe.
- **Badges e filtros funcionam**: `falha` deixa de aparecer como texto cru, ganha cor vermelha e o filtro "Erro" passa a achá-lo.
- **Link cliente↔execução firme**: `conta_id` deixa de ser NULL, abrindo caminho para JOINs server-side no futuro (sem mudar nada agora).

Posso aplicar as 3 correções (migration + trigger + ajustes no frontend) numa única passada após sua aprovação.
