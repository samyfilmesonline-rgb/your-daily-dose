SELECT cron.schedule(
  'partner-shop-stalled-watchdog-2min',
  '*/2 * * * *',
  $$select net.http_post(
    url:='https://mdfxwynmmefaipqzdbyf.supabase.co/functions/v1/partner-shop-stalled-watchdog',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZnh3eW5tbWVmYWlwcXpkYnlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MzIwNTYsImV4cCI6MjA5MzIwODA1Nn0.5hHTcu0qPY16mNveCE43V8MyAsbmzckJrwTSGe5T8mo"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;$$
);