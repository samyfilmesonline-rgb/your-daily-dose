# Your Daily Dose

Painel React/Vite conectado ao Supabase do projeto `mdfxwynmmefaipqzdbyf`.

## Configuracao

Copie `.env.example` para `.env` no ambiente local ou configure as mesmas variaveis no provedor de deploy:

```env
VITE_SUPABASE_URL="https://mdfxwynmmefaipqzdbyf.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sua_chave_publishable_ou_anon_do_supabase"
```

Nao envie `.env` para o GitHub.

## Seguranca

A tela de contas consulta apenas metadados seguros da tabela `contas_lovable`. Senhas Lovable nao sao lidas, exibidas, criadas ou atualizadas pelo navegador. O aplicativo desktop deve continuar sendo responsavel por salvar credenciais, usando criptografia local antes de gravar no Supabase.
