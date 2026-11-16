-- =====================================================================
-- Monitoring page, team decision (2026-11-15):
--
-- 1. Personal node names. A sensor node keeps its technical name (set by
--    IoT management), and each officer or admin can give it their own
--    name, seen only by them. One row per person and node.
--
-- 2. Rule-based alerts from a fixed stable range. Every new reading is
--    checked against a stable range for temperature, air humidity and
--    soil moisture. A reading outside it opens an alert, and the existing
--    trg_notify_on_alert_created trigger notifies every active officer and
--    admin. The fixed stable range is set in ONE settings file,
--      apps/shared/config/sensorStableRanges.json
--    and copied into public.sensor_stable_ranges by
--      npm run sensor-ranges:push    (or: npm run sensor-ranges, then paste the SQL)
--    The values seeded below are only the first copy; change the file, not
--    this migration. The apps read the same table, so what they show is what
--    the alert rule uses. A reading with no range in the table is not checked.
--    Every node uses this one preset range. Per-node limits
--    (sensor_nodes.thresholds) are NOT used: the team has not decided on
--    per-node ranges yet (2026-11-16). They stay stored, untouched.
--
--    No alert storms: while an alert of the same type for the same node is
--    still open or acknowledged, further readings do not open another.
--    Readings older than a day (a gateway catching up) are not checked.
--
--    It runs as a trigger, so readings from both the API (POST /telemetry)
--    and the gateway's direct Supabase mode are checked.
--
-- Safe to run more than once.
-- =====================================================================

-- 1. Personal node names --------------------------------------------------
create table if not exists public.sensor_node_nicknames (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  node_id     uuid not null references public.sensor_nodes(id) on delete cascade,
  nickname    text not null check (char_length(btrim(nickname)) between 1 and 60),
  updated_at  timestamptz not null default now(),
  primary key (user_id, node_id)
);

alter table public.sensor_node_nicknames enable row level security;

-- Only your own names, and only for people who can see the nodes at all.
drop policy if exists "node nicknames: own" on public.sensor_node_nicknames;
create policy "node nicknames: own" on public.sensor_node_nicknames for all to authenticated
  using (user_id = auth.uid() and public.my_role() in ('officer', 'admin'))
  with check (user_id = auth.uid() and public.my_role() in ('officer', 'admin'));

-- 2. Fixed stable range (from apps/shared/config/sensorStableRanges.json) --
create table if not exists public.sensor_stable_ranges (
  field       text primary key check (field in ('temperature', 'humidity', 'soil_moisture')),
  min_value   double precision not null,
  max_value   double precision not null,
  updated_at  timestamptz not null default now(),
  check (min_value < max_value)
);

alter table public.sensor_stable_ranges enable row level security;

-- Officers and admins read it (the Monitoring page shows it). Nobody changes it
-- through the API: only the push script (secret key) or the SQL editor does.
drop policy if exists "stable ranges: staff read" on public.sensor_stable_ranges;
create policy "stable ranges: staff read" on public.sensor_stable_ranges for select to authenticated
  using (public.my_role() in ('officer', 'admin'));

-- First copy only; an existing row (already pushed) is kept.
insert into public.sensor_stable_ranges (field, min_value, max_value) values
  ('temperature', 18, 35),
  ('humidity', 40, 100),
  ('soil_moisture', 20, 80)
on conflict (field) do nothing;

-- Same change counter as the other tables the workspace loads, if present,
-- so a new name or a pushed range reaches open pages on the next poll.
do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'bump_table_version' and pronamespace = 'public'::regnamespace) then
    foreach t in array array['sensor_node_nicknames', 'sensor_stable_ranges'] loop
      execute format('drop trigger if exists trg_table_version on public.%I', t);
      execute format('create trigger trg_table_version after insert or update or delete or truncate on public.%I
                      for each statement execute function public.bump_table_version()', t);
      insert into public.table_versions (table_name) values (t) on conflict do nothing;
    end loop;
  end if;
end;
$$;

-- 3. Stable range alerts --------------------------------------------------
create or replace function public.check_reading_stable_range()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name   text;
  v_check  record;
  v_lo     double precision;
  v_hi     double precision;
  v_type   text;
begin
  if new.ts < now() - interval '1 day' then
    return new;
  end if;

  select coalesce(to_jsonb(n) ->> 'name', 'Node ' || left(n.id::text, 4))
    into v_name
  from public.sensor_nodes n where n.id = new.node_id;
  if not found then
    return new;
  end if;

  -- variable, its reading, label, unit; the preset range from sensor_stable_ranges
  for v_check in
    select c.*, r.min_value, r.max_value
    from (values
      ('temperature',   new.temperature,   'Temperature',   '°C'),
      ('humidity',      new.humidity,      'Air humidity',  '%'),
      ('soil_moisture', new.soil_moisture, 'Soil moisture', '%')
    ) as c(field, val, title, unit)
    left join public.sensor_stable_ranges r on r.field = c.field
  loop
    continue when v_check.val is null;
    v_lo := v_check.min_value;
    v_hi := v_check.max_value;
    continue when v_lo is null or v_hi is null; -- no range for this reading

    if v_check.val < v_lo then
      v_type := v_check.title || ' too low';
    elsif v_check.val > v_hi then
      v_type := v_check.title || ' too high';
    else
      continue;
    end if;

    continue when exists (
      select 1 from public.alerts a
      where a.node_id = new.node_id and a.type = v_type and a.status in ('open', 'acknowledged'));

    -- An alert must never stop a reading being stored.
    begin
      insert into public.alerts (node_id, type, reading, severity, status, created_at)
      values (
        new.node_id, v_type,
        jsonb_build_object(
          v_check.field, round(v_check.val::numeric, 1),
          'stable_range', trim(to_char(v_lo, 'FM999990.0')) || ' to ' || trim(to_char(v_hi, 'FM999990.0')) || ' ' || v_check.unit,
          'node', v_name),
        -- Far outside the range (by a quarter of its width or more) is high.
        case when greatest(v_lo - v_check.val, v_check.val - v_hi) >= (v_hi - v_lo) / 4 then 'high' else 'medium' end,
        'open', now());
    exception when others then
      raise warning 'check_reading_stable_range: % (%)', sqlerrm, sqlstate;
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_check_reading_stable_range on public.telemetry;
create trigger trg_check_reading_stable_range after insert on public.telemetry
  for each row execute function public.check_reading_stable_range();

-- Tell every active officer and admin, with which node and what it read
-- (before, the body was the alert's outcome, which is empty for a new alert).
create or replace function public.notify_on_alert_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_body text;
begin
  select coalesce(new.reading ->> 'node', to_jsonb(n) ->> 'name', 'Node ' || left(n.id::text, 4), 'A sensor node')
         || coalesce(': ' || (select string_agg(initcap(replace(k, '_', ' ')) || ' ' || v, ' · ')
                              from jsonb_each_text(coalesce(new.reading, '{}'::jsonb) - 'node') as e(k, v)), '')
    into v_body
  from (select 1) one
  left join public.sensor_nodes n on n.id = new.node_id;

  insert into public.notifications (user_id, type, title, body, related_table, related_id)
  select id, 'alert_created', 'New alert: ' || new.type, v_body, 'alerts', new.id::text
  from public.profiles
  where role in ('officer', 'admin') and is_active;
  return new;
end;
$$;

revoke execute on function public.check_reading_stable_range() from public, anon, authenticated;
-- An earlier draft of this migration had a helper for per-node limits.
drop function if exists public.limit_value(jsonb, text);
revoke execute on function public.notify_on_alert_created() from public, anon, authenticated;
