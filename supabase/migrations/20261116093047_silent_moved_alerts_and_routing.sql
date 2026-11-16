-- =====================================================================
-- IoT alerts, the rest (CTIP-76, CTIP-77, CTIP-48):
--
-- 1. Alert routing (CTIP-48). An admin can choose, per officer or admin,
--    which nodes they hear about and from which severity up. Someone with
--    no row hears about every alert, as before. One row per person.
--
-- 2. alert_created notifications follow that routing (CTIP-77). The API
--    sends the same title and body as a phone push. Texts never hold a
--    coordinate (threat model): only the node name and what it read.
--
-- 3. A reading marks its node seen, and online again if the silent check
--    had marked it offline (CTIP-76). A trigger, so readings from the API
--    and from the gateway's direct Supabase mode both count.
--
-- 4. A node that sends a GPS position far from where it was installed
--    raises "Node moved" (CTIP-48). The alert says how far, never where.
--
-- 5. raise_silent_node_alerts(minutes): an active node with no reading for
--    that long is marked offline and raises "Node silent" (CTIP-76). The API
--    calls it (NODE_SILENT_MINUTES, default 15) on readings and every
--    minute while it runs. When pg_cron is switched on, this
--    migration also schedules it every 5 minutes.
--
-- Same rule as the stable range alerts: while an alert of the same type for
-- the same node is open or acknowledged, no second one is opened.
-- Safe to run more than once.
-- =====================================================================

-- 1. Alert routing ----------------------------------------------------------
create table if not exists public.alert_routes (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  node_ids      uuid[],                        -- null: every node
  min_severity  text not null default 'low' check (min_severity in ('low', 'medium', 'high', 'critical')),
  updated_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);

alter table public.alert_routes enable row level security;

drop policy if exists "alert routes: admin" on public.alert_routes;
create policy "alert routes: admin" on public.alert_routes for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

drop policy if exists "alert routes: own read" on public.alert_routes;
create policy "alert routes: own read" on public.alert_routes for select to authenticated
  using (user_id = auth.uid() and public.my_role() in ('officer', 'admin'));

create or replace function public.severity_rank(p text)
returns int language sql immutable set search_path = '' as $$
  select case p when 'low' then 1 when 'medium' then 2 when 'high' then 3 when 'critical' then 4 else 2 end;
$$;

-- Who hears about an alert on this node with this severity.
create or replace function public.alert_recipients(p_node_id uuid, p_severity text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id
  from public.profiles p
  left join public.alert_routes r on r.user_id = p.id
  where p.role in ('officer', 'admin') and p.is_active
    and (r.user_id is null
         or ((r.node_ids is null or p_node_id = any(r.node_ids))
             and public.severity_rank(p_severity) >= public.severity_rank(r.min_severity)));
$$;

-- 2. Notifications follow the routing -------------------------------------
create or replace function public.notify_on_alert_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_body text;
begin
  select coalesce(new.reading ->> 'node', to_jsonb(n) ->> 'name', 'Node ' || left(n.id::text, 4), 'A sensor node')
         || coalesce(': ' || (select string_agg(initcap(replace(k, '_', ' ')) || ' ' || v, ' · ')
                              from jsonb_each_text(coalesce(new.reading, '{}'::jsonb) - 'node') as e(k, v)
                              where k not in ('lat', 'lng', 'latitude', 'longitude')), '')
    into v_body
  from (select 1) one
  left join public.sensor_nodes n on n.id = new.node_id;

  insert into public.notifications (user_id, type, title, body, related_table, related_id)
  select r, 'alert_created', 'New alert: ' || new.type, v_body, 'alerts', new.id::text
  from public.alert_recipients(new.node_id, new.severity) as r;
  return new;
end;
$$;

-- Distance in metres between two points (haversine).
create or replace function public.metres_between(lat1 double precision, lng1 double precision,
                                                  lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- 3 + 4. A reading: node seen, back online, and the moved check ------------
create or replace function public.on_reading_node_seen()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_node  record;
  v_name  text;
  v_away  double precision;
begin
  select * into v_node from public.sensor_nodes where id = new.node_id;
  if not found then
    return new;
  end if;

  update public.sensor_nodes
     set last_seen = greatest(coalesce(last_seen, '-infinity'::timestamptz), least(new.ts, now())),
         status = case when status = 'offline' then 'active' else status end,
         updated_at = case when status = 'offline' then now() else updated_at end
   where id = new.node_id;

  -- Moved: only a fresh reading with a position, for a node with a known spot.
  if new.lat is null or new.lng is null or v_node.lat is null or v_node.lng is null
     or new.ts < now() - interval '1 day' then
    return new;
  end if;
  v_away := public.metres_between(v_node.lat, v_node.lng, new.lat, new.lng);
  if v_away < 50 then  -- GPS wanders by a few metres; 50 m is a real move
    return new;
  end if;
  if exists (select 1 from public.alerts a
             where a.node_id = new.node_id and a.type = 'Node moved' and a.status in ('open', 'acknowledged')) then
    return new;
  end if;

  v_name := coalesce(to_jsonb(v_node) ->> 'name', 'Node ' || left(v_node.id::text, 4));
  begin
    insert into public.alerts (node_id, type, reading, severity, status, created_at)
    values (new.node_id, 'Node moved',
            jsonb_build_object('moved', 'about ' || round(v_away)::text || ' m from where it was installed', 'node', v_name),
            'high', 'open', now());
  exception when others then
    raise warning 'on_reading_node_seen: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;

drop trigger if exists trg_reading_node_seen on public.telemetry;
create trigger trg_reading_node_seen after insert on public.telemetry
  for each row execute function public.on_reading_node_seen();

-- 5. Silent nodes ------------------------------------------------------------
create or replace function public.raise_silent_node_alerts(p_minutes int default 15)
returns table (alert_id uuid, node_id uuid) language plpgsql security definer set search_path = '' as $$
declare
  v_minutes int := least(greatest(coalesce(p_minutes, 15), 1), 1440);
  v_node    record;
  v_id      uuid;
  v_silent  int;
begin
  for v_node in
    select n.*, coalesce(to_jsonb(n) ->> 'name', 'Node ' || left(n.id::text, 4)) as label
    from public.sensor_nodes n
    where n.status in ('active', 'offline')
      and n.last_seen is not null          -- never reported: not installed yet
      and n.last_seen < now() - make_interval(mins => v_minutes)
    for update skip locked
  loop
    if v_node.status = 'active' then
      update public.sensor_nodes set status = 'offline', updated_at = now() where id = v_node.id;
    end if;

    continue when exists (select 1 from public.alerts a
                          where a.node_id = v_node.id and a.type = 'Node silent' and a.status in ('open', 'acknowledged'));

    v_silent := floor(extract(epoch from now() - v_node.last_seen) / 60);
    insert into public.alerts (node_id, type, reading, severity, status, created_at)
    values (v_node.id, 'Node silent',
            jsonb_build_object(
              'silent_for', case when v_silent >= 120 then (v_silent / 60)::text || ' h' else v_silent::text || ' min' end,
              'node', v_node.label),
            'high', 'open', now())
    returning id into v_id;
    alert_id := v_id;
    node_id := v_node.id;
    return next;
  end loop;
end;
$$;

revoke execute on function public.raise_silent_node_alerts(int) from public, anon, authenticated;
grant execute on function public.raise_silent_node_alerts(int) to service_role;
revoke execute on function public.alert_recipients(uuid, text) from public, anon, authenticated;
revoke execute on function public.on_reading_node_seen() from public, anon, authenticated;
revoke execute on function public.notify_on_alert_created() from public, anon, authenticated;

-- Every 5 minutes, when pg_cron is switched on (Database -> Extensions).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'raise-silent-node-alerts';
    perform cron.schedule('raise-silent-node-alerts', '*/5 * * * *', 'select public.raise_silent_node_alerts(15)');
  end if;
end;
$$;
