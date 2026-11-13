-- Phase 9: automatic updates. pg_cron fires on a schedule; pg_net POSTs to the app's /api/cron
-- endpoint, which does the CFBD syncs and the sheet import (see src/lib/scheduled.ts).
--
-- The endpoint URL and its secret live in Supabase Vault, not in this file:
--   select vault.create_secret('https://<app>/api/cron', 'pickem_cron_url');
--   select vault.create_secret('<same value as CRON_SECRET in Vercel>', 'pickem_cron_secret');
-- Until both exist, the scheduled calls simply do nothing useful (no URL) or get a 401.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.sync_runs drop constraint sync_runs_kind_check;
alter table public.sync_runs
  add constraint sync_runs_kind_check check (kind in ('teams', 'games', 'rosters', 'lines', 'results', 'import', 'scheduled'));

-- Not in `public`, so the REST API can't call it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.trigger_scheduled_job(job text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'pickem_cron_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'pickem_cron_secret');
begin
  if url is null or secret is null then
    raise warning 'pickem: vault secrets pickem_cron_url / pickem_cron_secret not set; skipping %', job;
    return null;
  end if;
  return net.http_post(
    url := url || '?job=' || job,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000 -- the app answers 202 straight away and works after responding
  );
end;
$$;

-- Times are UTC. 10:00 UTC = 6 AM ET (EDT) / 5 AM (EST): last night's results, today's lines.
select cron.schedule('pickem-daily', '0 10 * * *', $$select private.trigger_scheduled_job('daily')$$);
-- Saturday evening refreshes: 21:00 UTC Sat, 01:00 and 05:00 UTC Sun (≈ 5 PM, 9 PM, 1 AM ET).
select cron.schedule('pickem-gameday-sat', '0 21 * * 6', $$select private.trigger_scheduled_job('gameday')$$);
select cron.schedule('pickem-gameday-sun', '0 1,5 * * 0', $$select private.trigger_scheduled_job('gameday')$$);
