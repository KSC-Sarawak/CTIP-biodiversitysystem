-- =====================================================================
-- Scheduled jobs, now that pg_cron is switched on (16 Nov 2026).
--
-- The migrations that planned these only schedule them when pg_cron was
-- already on when they ran, and it was not:
--   raise-silent-node-alerts   every 5 minutes (CTIP-76, migration 20261116093047)
--     An active node with no reading for 15 minutes is marked offline and
--     raises "Node silent". The in-app notifications follow the alert routing.
--     The API also runs it every minute while it is awake, and sends the
--     phone pushes for what it finds; this job covers the times it sleeps.
--   purge-deleted-users        daily at 03:17 (migration 20261105120000)
--     Accounts deleted more than 30 days ago are removed for good, as the
--     API already does when an admin opens the Users page.
--
-- Does nothing where pg_cron is off. Safe to run more than once.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not turned on: no jobs scheduled';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname in ('raise-silent-node-alerts', 'purge-deleted-users');
  perform cron.schedule('raise-silent-node-alerts', '*/5 * * * *', 'select public.raise_silent_node_alerts(15)');
  perform cron.schedule('purge-deleted-users', '17 3 * * *', 'select public.purge_deleted_users()');
end;
$$;
