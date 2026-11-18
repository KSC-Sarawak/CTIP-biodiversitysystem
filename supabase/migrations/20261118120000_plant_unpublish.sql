-- =====================================================================
-- Officers and admins can take a published plant off public view, with a
-- reason, and put it back later.
--
-- Before this, an approved observation could not be reviewed again
-- (review_observation() only takes 'synced'), and a plant stays public as
-- long as ANY of its visits is approved, so rejecting one visit would not
-- have unpublished a plant with several. The switch is on the plant
-- (specimen) instead: its visits and their decisions stay as they are.
--
--   * specimens.is_withdrawn (+ reason, who, when)
--   * set_plant_published(): the only way to change them. Officer/admin,
--     reason required to withdraw, botanists who recorded it are notified.
--   * public_plants(), public_observation_photos(), public_plant_by_tag()
--     leave withdrawn plants out (otherwise the same as 20261103120000 and
--     20261031000000).
--
-- Error codes follow review_observation(): CTRQ0 reason missing,
-- CTNF0 not found, CTST0 already in that state, 42501 not allowed.
-- Safe to run more than once.
-- =====================================================================

alter table public.specimens
  add column if not exists is_withdrawn     boolean not null default false,
  add column if not exists withdrawn_reason text,
  add column if not exists withdrawn_by     uuid references public.profiles(id) on delete set null,
  add column if not exists withdrawn_at     timestamptz;

-- New notification types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'review_returned', 'review_approved', 'review_rejected',
  'comment_reply', 'alert_assigned', 'alert_created',
  'observation_submitted', 'observation_resubmitted',
  'discussion_shared', 'discussion_post', 'discussion_mention',
  'email_rate_limit',
  'plant_unpublished', 'plant_republished'));

-- Same checks as 20261105230000, plus: the withdrawn columns only change
-- through set_plant_published(), so the reason and the notification cannot
-- be skipped with a direct update.
create or replace function public.guard_specimen_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(public.my_role(), '') not in ('officer', 'admin') and
     (new.species_id is distinct from old.species_id
      or new.endangered_override is distinct from old.endangered_override
      or new.qr_id is distinct from old.qr_id) then
    raise exception 'Only officers can set species, endangered status or the tag';
  end if;
  if auth.uid() is not null
     and coalesce(public.my_role(), '') <> 'admin'
     and new.is_deleted is distinct from old.is_deleted then
    raise exception 'Only an admin can delete or restore a plant'
      using errcode = '42501';
  end if;
  if auth.uid() is not null
     and coalesce(current_setting('ctip.plant_publish', true), '') <> 'on'
     and (new.is_withdrawn is distinct from old.is_withdrawn
          or new.withdrawn_reason is distinct from old.withdrawn_reason
          or new.withdrawn_by is distinct from old.withdrawn_by
          or new.withdrawn_at is distinct from old.withdrawn_at) then
    raise exception 'Use set_plant_published() to unpublish or publish a plant'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.set_plant_published(
  p_specimen_id uuid,
  p_published   boolean,
  p_reason      text default null
)
returns public.specimens
language plpgsql security definer set search_path = '' as $$
declare
  v_plant  public.specimens;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if coalesce(public.my_role(), '') not in ('officer', 'admin') then
    raise exception 'Only officers and admins can unpublish or publish a plant' using errcode = '42501';
  end if;
  if p_published is null then
    raise exception 'Say whether the plant is published' using errcode = 'CTRQ0';
  end if;
  if not p_published and v_reason is null then
    raise exception 'A reason is required to unpublish a plant' using errcode = 'CTRQ0';
  end if;

  select * into v_plant from public.specimens
  where id = p_specimen_id and not is_deleted
  for update;
  if not found then
    raise exception 'Plant not found' using errcode = 'CTNF0';
  end if;
  if v_plant.is_withdrawn = not p_published then
    raise exception 'Plant is already %', case when p_published then 'published' else 'unpublished' end
      using errcode = 'CTST0';
  end if;

  perform set_config('ctip.plant_publish', 'on', true);
  update public.specimens
  set is_withdrawn     = not p_published,
      withdrawn_reason = case when p_published then null else v_reason end,
      withdrawn_by     = case when p_published then null else auth.uid() end,
      withdrawn_at     = case when p_published then null else now() end
  where id = p_specimen_id
  returning * into v_plant;
  perform set_config('ctip.plant_publish', '', true);

  -- Tell the botanists behind it: whoever tagged it and whoever recorded a visit.
  insert into public.notifications (user_id, type, title, body, related_table, related_id)
  select distinct u.user_id,
         case when p_published then 'plant_republished' else 'plant_unpublished' end,
         case when p_published then 'Plant ' || coalesce(v_plant.qr_id, '') || ' is public again'
              else 'Plant ' || coalesce(v_plant.qr_id, '') || ' was taken off public view' end,
         v_reason,
         'specimens', v_plant.id::text
  from (
    select v_plant.registered_by as user_id
    union
    select o.recorded_by from public.observations o
    where o.specimen_id = v_plant.id and not o.is_deleted
  ) u
  where u.user_id is not null and u.user_id is distinct from auth.uid();

  return v_plant;
end;
$$;

revoke execute on function public.set_plant_published(uuid, boolean, text) from public, anon;
grant  execute on function public.set_plant_published(uuid, boolean, text) to authenticated;

-- Visitor functions: as before, without withdrawn plants.
create or replace function public.public_plant_by_tag(p_qr_id text)
returns table (
  qr_id            text,
  species_id       uuid,
  lat              double precision,
  lng              double precision,
  location_reduced boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with plant as (
    select s.qr_id, s.species_id, s.lat, s.lng,
           (s.endangered_override
             or lower(trim(sp.conservation_status)) in ('endangered', 'critically endangered')) as endangered
    from public.specimens s
    join public.species sp on sp.id = s.species_id
    where s.qr_id = p_qr_id
      and not s.is_deleted
      and not s.is_withdrawn
      and sp.is_published
      and not sp.is_deleted
      and exists (
        select 1 from public.observations o
        where o.specimen_id = s.id and o.status = 'approved' and not o.is_deleted
      )
  )
  select qr_id,
         species_id,
         case when endangered and lat is not null then round(((floor(lat / 0.01) + 0.5) * 0.01)::numeric, 3)::double precision else lat end,
         case when endangered and lng is not null then round(((floor(lng / 0.01) + 0.5) * 0.01)::numeric, 3)::double precision else lng end,
         endangered
  from plant;
$$;

revoke execute on function public.public_plant_by_tag(text) from public;
grant  execute on function public.public_plant_by_tag(text) to anon, authenticated;

create or replace function public.public_plants()
returns table (
  id uuid,
  qr_id text,
  species_id uuid,
  lat double precision,
  lng double precision,
  gps_accuracy_m double precision,
  endangered_override boolean,
  is_deleted boolean,
  observation_id uuid,
  height_cm text,
  morphology text,
  observed_at text
)
language sql
stable
security definer
set search_path = public
as $$
  with plant as (
    select s.id, s.qr_id, s.species_id, s.lat, s.lng, s.gps_accuracy_m, s.endangered_override, s.is_deleted,
           o.id as observation_id, o.height_cm, o.morphology, o.observed_at::text,
           (s.endangered_override or lower(trim(sp.conservation_status)) in ('endangered', 'critically endangered')) as endangered
    from public.specimens s
    join public.species sp on sp.id = s.species_id
    join public.observations o on o.specimen_id = s.id
    where not s.is_deleted
      and not s.is_withdrawn
      and sp.is_published
      and not sp.is_deleted
      and o.status = 'approved'
      and not o.is_deleted
  )
  select id,
         qr_id,
         species_id,
         case when endangered and lat is not null then round(((floor(lat / 0.01) + 0.5) * 0.01)::numeric, 3)::double precision else lat end,
         case when endangered and lng is not null then round(((floor(lng / 0.01) + 0.5) * 0.01)::numeric, 3)::double precision else lng end,
         case when endangered then 1100.0 else gps_accuracy_m end,
         endangered_override,
         is_deleted,
         observation_id,
         height_cm,
         morphology,
         observed_at
  from plant;
$$;

revoke execute on function public.public_plants() from public;
grant  execute on function public.public_plants() to anon, authenticated;

create or replace function public.public_observation_photos()
returns table (
  id uuid,
  observation_id uuid,
  s3_key text,
  s3_bucket text,
  created_at text
)
language sql
stable
security definer
set search_path = public
as $$
  select ph.id, ph.observation_id, ph.s3_key, ph.s3_bucket, ph.created_at::text
  from public.observation_photos ph
  join public.observations o on o.id = ph.observation_id
  join public.specimens s on s.id = o.specimen_id
  join public.species sp on sp.id = s.species_id
  where not s.is_deleted
    and not s.is_withdrawn
    and sp.is_published
    and not sp.is_deleted
    and o.status = 'approved'
    and not o.is_deleted;
$$;

revoke execute on function public.public_observation_photos() from public;
grant  execute on function public.public_observation_photos() to anon, authenticated;
