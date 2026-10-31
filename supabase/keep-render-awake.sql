-- Keeps the Render API awake so searches don't wait 30-60 s for a cold start.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- (A GitHub scheduled workflow only fired every few hours, so Supabase's own scheduler does the pinging.)
-- Not in migrations/: the PGlite migration tests don't have these extensions.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 10 minutes: ~744 instance hours a month, inside Render's 750 free hours if it's the only free service.
select cron.schedule(
  'keep-render-awake',
  '*/10 * * * *',
  $$ select net.http_get('https://carmatch-api-tygz.onrender.com/health', timeout_milliseconds := 60000) $$
);

-- Check it's running:   select * from cron.job_run_details order by start_time desc limit 5;
-- Stop it:              select cron.unschedule('keep-render-awake');
