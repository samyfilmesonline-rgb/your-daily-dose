SELECT cron.unschedule('partner-shop-schedule-tick-5min');

SELECT cron.schedule(
  'partner-shop-schedule-tick-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mdfxwynmmefaipqzdbyf.supabase.co/functions/v1/partner-shop-schedule-tick',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZnh3eW5tbWVmYWlwcXpkYnlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MzIwNTYsImV4cCI6MjA5MzIwODA1Nn0.5hHTcu0qPY16mNveCE43V8MyAsbmzckJrwTSGe5T8mo"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);