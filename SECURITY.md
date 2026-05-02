# Security

## Environment variables

Do not commit `.env` files. Use `.env.example` as the template and configure real values in the deployment provider or in a local ignored `.env` file.

Required frontend variables:

```env
VITE_SUPABASE_URL="https://mdfxwynmmefaipqzdbyf.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your_publishable_or_anon_key"
```

## Lovable account passwords

The browser app must not read, display, create, or update `senha_lovable` values. Password writes should happen only through the desktop automation app, which encrypts new saved values locally before storing them in Supabase.

## If a secret was committed

Treat it as exposed. Remove it from Git history and rotate or revoke it where possible.
