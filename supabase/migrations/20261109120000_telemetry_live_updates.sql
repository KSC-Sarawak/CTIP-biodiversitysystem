-- =====================================================================
-- Monitoring page: live sensor readings.
--
-- GET /v1/workspace now also loads the last 24 hours of telemetry. Give
-- telemetry the same change counter as the other tables it loads
-- (20261105000000_table_versions), so a new reading reaches open
-- Monitoring pages on the next poll, and a poll with no new reading
-- stays one tiny query.
--
-- Safe to run more than once.
-- =====================================================================

drop trigger if exists trg_table_version on public.telemetry;
create trigger trg_table_version after insert or update or delete or truncate on public.telemetry
  for each statement execute function public.bump_table_version();
insert into public.table_versions (table_name) values ('telemetry') on conflict do nothing;
