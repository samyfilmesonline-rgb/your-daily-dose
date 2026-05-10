# Auto-update do app desktop (Python)

Este guia mostra como integrar seu app Python ao sistema de releases do painel admin.

- **Hospedagem do ZIP:** Cloudflare R2 (você cola a URL pública na release)
- **Notificação:** Supabase Realtime → push instantâneo no segundo em que você publica
- **Fallback:** edge function `app-version-check` consultada no boot
- **Política:** popup "Nova versão disponível — atualizar agora?" (opcional para o usuário)
- **Integridade:** validação SHA256 obrigatória antes de instalar

## Credenciais (públicas, podem ficar no código)

```python
SUPABASE_URL = "https://mdfxwynmmefaipqzdbyf.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZnh3eW5tbWVmYWlwcXpkYnlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MzIwNTYsImV4cCI6MjA5MzIwODA1Nn0.5hHTcu0qPY16mNveCE43V8MyAsbmzckJrwTSGe5T8mo"
CURRENT_VERSION = "1.0.0"  # ler do seu __version__
```

## Dependências

```bash
pip install supabase requests packaging
```

## 1) Verificação no boot (HTTP — fallback simples e confiável)

```python
import requests
from packaging.version import Version

def check_for_updates(current: str) -> dict | None:
    url = f"{SUPABASE_URL}/functions/v1/app-version-check"
    r = requests.get(url, params={"current": current},
                     headers={"apikey": SUPABASE_ANON_KEY,
                              "Authorization": f"Bearer {SUPABASE_ANON_KEY}"},
                     timeout=10)
    r.raise_for_status()
    data = r.json()
    return data if data.get("update_available") else None
```

## 2) Push em tempo real (Supabase Realtime)

```python
from supabase import create_client
import threading

supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

def on_new_release(payload):
    rec = payload.get("data", {}).get("record") or {}
    if not rec.get("is_published"):
        return
    try:
        if Version(rec["version"]) > Version(CURRENT_VERSION):
            show_update_popup(rec)  # disparar na thread de UI
    except Exception as e:
        print(f"[updater] realtime parse falhou: {e}")

def start_realtime_listener():
    channel = supabase.channel("app-releases")
    # supabase-py v2 exige evento explícito. Escutamos INSERT e UPDATE separadamente.
    channel.on_postgres_changes(event="INSERT", schema="public", table="app_releases", callback=on_new_release)
    channel.on_postgres_changes(event="UPDATE", schema="public", table="app_releases", callback=on_new_release)
    channel.subscribe()

# rodar em background ao iniciar o app
threading.Thread(target=start_realtime_listener, daemon=True).start()
```

## 3) Download + validação SHA256 + instalação

```python
import hashlib, os, sys, tempfile, zipfile, shutil, subprocess

def download_and_install(release: dict):
    url = release["download_url"]
    expected_sha = release["sha256"].lower()

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    sha = hashlib.sha256()
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        for chunk in r.iter_content(chunk_size=64 * 1024):
            tmp.write(chunk)
            sha.update(chunk)
    tmp.close()

    if sha.hexdigest() != expected_sha:
        os.unlink(tmp.name)
        raise RuntimeError("SHA256 não confere — arquivo corrompido ou adulterado")

    # extrai sobre o diretório do app (ajuste APP_DIR conforme sua instalação)
    APP_DIR = os.path.dirname(sys.executable)  # ou onde seu app está instalado
    with zipfile.ZipFile(tmp.name) as zf:
        zf.extractall(APP_DIR)
    os.unlink(tmp.name)

    # restart
    subprocess.Popen([sys.executable] + sys.argv)
    sys.exit(0)
```

> **Dica:** No Windows, executáveis em uso não podem ser sobrescritos. Padrão recomendado: extrair para uma pasta temporária, escrever um `updater.bat` que copia os arquivos e relança o app, e sair antes de o batch rodar.

## 4) Popup (Tkinter — adaptável a PyQt/customtkinter)

```python
import tkinter as tk
from tkinter import messagebox

def show_update_popup(release: dict):
    msg = f"Nova versão {release['version']} disponível.\n\n{release.get('changelog') or ''}\n\nAtualizar agora?"
    if messagebox.askyesno("Atualização disponível", msg):
        try:
            download_and_install(release)
        except Exception as e:
            messagebox.showerror("Falha na atualização", str(e))
```

## 5) Fluxo completo no `main`

```python
def main():
    # 1) checagem síncrona no boot
    try:
        update = check_for_updates(CURRENT_VERSION)
        if update:
            show_update_popup(update)
    except Exception as e:
        print(f"[updater] check falhou: {e}")

    # 2) listener realtime durante a sessão
    threading.Thread(target=start_realtime_listener, daemon=True).start()

    # 3) ... resto do app
    run_app()
```

## Como publicar uma nova release

1. Gere o ZIP da nova versão e suba no Cloudflare R2.
2. Calcule o SHA256:
   - Linux/Mac: `sha256sum app-1.4.2.zip`
   - Windows: `certutil -hashfile app-1.4.2.zip SHA256`
3. No painel admin → **Atualizações** → **Nova release** → cole URL + SHA256 + changelog → marque **Publicar agora**.
4. Todos os clientes online recebem o popup em < 1 segundo. Os offline recebem na próxima abertura do app (via fallback HTTP).
---

## Modo multi-workspace (recarga manual)

Pedidos manuais podem ser criados com `multi_workspace_mode = true`. Nesse caso `target_workspace` começa nulo e o worker é responsável por listar todos os workspaces da conta e farmar 200 créditos em cada um, em ordem.

Endpoint: `POST /functions/v1/partner-shop-multi-workspace-tick`

Contrato:

```text
1. Worker recebe pedido com multi_workspace_mode=true.
2. Faz login no Lovable, lista todos os workspaces da conta.
3. POST { action: "start", orderId, fingerprint, workspaces: [...] }
   → resposta: { currentWorkspace, workspacesTotal, workspacesDone, truncated? }
4. Loop:
   - Farma currentWorkspace até bater 200 créditos.
   - Sucesso: POST { action: "next", orderId, fingerprint, finishedWorkspace, farmed: 200 }
     → { next: "<nome>" | null, done: bool, finalStatus? }
   - Erro: POST { action: "fail", orderId, fingerprint, workspace, reason }
     → idem
5. Quando done=true, encerra a sessão.
```

Se o admin chamar `partner-shop-stop-order`, o tick detecta `stop_requested_at` na próxima troca, marca os ws restantes como `skipped`, faz refund da diferença e fecha o pedido como `canceled`.
