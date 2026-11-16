-- =====================================================================
-- Webcam photos linked to their motion alert (CTIP-38, CTIP-82).
--
-- The gateway's webcam takes a photo when a node detects movement, and the
-- same movement opens a "Motion detected" alert (migration 20261116094425).
-- The photo and the reading can reach the database in either order, so:
--
--   a photo arrives  -> linked to the node's open or acknowledged
--                       "Motion detected" alert, if it was taken from 2
--                       minutes before that alert opened onwards;
--   an alert opens   -> the node's unlinked photos from the 2 minutes before
--                       are linked to it.
--
-- sensor_images.alert_id is then set, and the web and mobile Monitoring pages
-- already show "Taken for the alert" on such a photo. A photo the gateway
-- links itself (alert_id given) is left as it is. Works for photos sent
-- through the API and straight to Supabase.
-- Safe to run more than once.
-- =====================================================================

create or replace function public.link_photo_to_motion_alert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.alert_id is null then
    select a.id into new.alert_id
    from public.alerts a
    where a.node_id = new.node_id
      and a.type = 'Motion detected'
      and a.status in ('open', 'acknowledged')
      and new.captured_at >= a.created_at - interval '2 minutes'
    order by a.created_at desc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_photo_to_motion_alert on public.sensor_images;
create trigger trg_link_photo_to_motion_alert before insert on public.sensor_images
  for each row execute function public.link_photo_to_motion_alert();

create or replace function public.link_recent_photos_to_alert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'Motion detected' and new.node_id is not null then
    update public.sensor_images
       set alert_id = new.id
     where node_id = new.node_id
       and alert_id is null
       and captured_at between new.created_at - interval '2 minutes' and new.created_at + interval '1 minute';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_recent_photos_to_alert on public.alerts;
create trigger trg_link_recent_photos_to_alert after insert on public.alerts
  for each row execute function public.link_recent_photos_to_alert();

revoke execute on function public.link_photo_to_motion_alert() from public, anon, authenticated;
revoke execute on function public.link_recent_photos_to_alert() from public, anon, authenticated;
