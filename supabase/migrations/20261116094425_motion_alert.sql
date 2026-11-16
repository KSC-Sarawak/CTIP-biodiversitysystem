-- =====================================================================
-- Motion alert (CTIP-38: threat detection). A fresh reading with
-- motion_detected = true (the node's ultrasonic distance changed by more than
-- its threshold: someone or something near the plant) opens "Motion detected",
-- severity high. Same rule as the other alerts: while one is open or
-- acknowledged for the node, no second one is opened. The alert says when,
-- never where.
--
-- Added to on_reading_node_seen() (migration 20261116093047), which already
-- runs after every stored reading, from the API or the gateway.
-- Safe to run more than once.
-- =====================================================================

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

  -- Older readings (a gateway catching up) raise nothing.
  if new.ts < now() - interval '1 day' then
    return new;
  end if;
  v_name := coalesce(to_jsonb(v_node) ->> 'name', 'Node ' || left(v_node.id::text, 4));

  -- Motion: someone or something close to the plant.
  if new.motion_detected is true
     and not exists (select 1 from public.alerts a
                     where a.node_id = new.node_id and a.type = 'Motion detected' and a.status in ('open', 'acknowledged')) then
    begin
      insert into public.alerts (node_id, type, reading, severity, status, created_at)
      values (new.node_id, 'Motion detected',
              jsonb_strip_nulls(jsonb_build_object(
                'distance', case when new.distance_cm is not null then round(new.distance_cm::numeric) || ' cm' end,
                'node', v_name)),
              'high', 'open', now());
    exception when others then
      raise warning 'on_reading_node_seen (motion): % (%)', sqlerrm, sqlstate;
    end;
  end if;

  -- Moved: only a reading with a position, for a node with a known spot.
  if new.lat is null or new.lng is null or v_node.lat is null or v_node.lng is null then
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

  begin
    insert into public.alerts (node_id, type, reading, severity, status, created_at)
    values (new.node_id, 'Node moved',
            jsonb_build_object('moved', 'about ' || round(v_away)::text || ' m from where it was installed', 'node', v_name),
            'high', 'open', now());
  exception when others then
    raise warning 'on_reading_node_seen (moved): % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;

revoke execute on function public.on_reading_node_seen() from public, anon, authenticated;
