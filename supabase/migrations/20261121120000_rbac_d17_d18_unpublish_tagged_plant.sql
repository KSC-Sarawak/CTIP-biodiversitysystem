-- =====================================================================
-- RBAC D17 and D18 (RBAC.md, agreed 21 Nov 2026).
--
-- D17: an officer can take a published tagged plant off public view
--      (unpublish, reason required) and put it back (publish again).
--      Officers only: admins do system work (D2).
-- D18: while a plant is unpublished, an officer can send it back to the
--      botanist: its latest approved observation becomes 'returned', with a
--      reason. The botanist fixes and resends it, it goes through review
--      again, and the plant STAYS unpublished until an officer presses
--      "Publish again", so publishing is always a deliberate step.
--
-- Changes:
--   * specimens.is_withdrawn (+ reason, who, when). Only
--     set_plant_published() changes them.
--   * set_plant_published(): officer only. Refuses to publish again while an
--     observation is waiting for review or with the botanist, or when the
--     plant has no approved observation.
--   * review_observation(): also takes 'return' on an APPROVED observation
--     of an unpublished plant (D18). Everything else is unchanged
--     (20261120020000_rbac_d2_admin_system_only.sql). The existing review
--     triggers set the status to 'returned' and notify the botanist, and the
--     reason stays in observation_reviews.
--   * Visitor functions leave unpublished plants out: public_plant_by_tag(),
--     public_plants() (as 20261120030000), public_observation_photos()
--     (as 20261031000000) and is_public_observation_folder() (as 20261120090000).
--
-- Error codes follow review_observation(): CTRQ0 missing input, CTNF0 not
-- found, CTST0 already in that state, CTST1 a review is still open,
-- CTST2 nothing approved to publish, 42501 not allowed.
-- Safe to run more than once.
-- =====================================================================

alter table public.specimens
  add column if not exists is_withdrawn     boolean not null default false,
  add column if not exists withdrawn_reason text,
  add column if not exists withdrawn_by     uuid references public.profiles(id) on delete set null,
  add column if not exists withdrawn_at     timestamptz;

-- New notification types (same list as 20261105120000, plus two).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'review_returned', 'review_approved', 'review_rejected',
  'comment_reply', 'alert_assigned', 'alert_created',
  'observation_submitted', 'observation_resubmitted',
  'discussion_shared', 'discussion_post', 'discussion_mention',
  'email_rate_limit',
  'plant_unpublished', 'plant_republished'));

-- ---------------------------------------------------------------------
-- 1. Guard: same as 20261120080000_rbac_d13_retag_after_retire.sql, plus
--    the withdrawn columns only change through set_plant_published(), so
--    the reason and the notification cannot be skipped.
-- ---------------------------------------------------------------------
create or replace function public.guard_specimen_update()
returns trigger language plpgsql set search_path = '' as $$
declare
  old_tag_status text;
begin
  if coalesce(public.my_role(), '') not in ('officer', 'admin') and
     (new.species_id is distinct from old.species_id
      or new.endangered_override is distinct from old.endangered_override
      or new.qr_id is distinct from old.qr_id) then
    raise exception 'Only officers can set species, endangered status or the tag';
  end if;
  if auth.uid() is not null
     and coalesce(public.my_role(), '') <> 'officer'
     and new.is_deleted is distinct from old.is_deleted then
    raise exception 'Only an officer can delete or restore a plant'
      using errcode = '42501';
  end if;
  if auth.uid() is not null
     and coalesce(public.my_role(), '') = 'admin'
     and (to_jsonb(new) - 'endangered_override' - 'updated_at' - 'zone_id')
         is distinct from
         (to_jsonb(old) - 'endangered_override' - 'updated_at' - 'zone_id') then
    raise exception 'An admin can only hide or show a plant''s location'
      using errcode = '42501';
  end if;
  -- D17: unpublish and publish again only through set_plant_published().
  if auth.uid() is not null
     and coalesce(current_setting('ctip.plant_publish', true), '') <> 'on'
     and (new.is_withdrawn is distinct from old.is_withdrawn
          or new.withdrawn_reason is distinct from old.withdrawn_reason
          or new.withdrawn_by is distinct from old.withdrawn_by
          or new.withdrawn_at is distinct from old.withdrawn_at) then
    raise exception 'Use set_plant_published() to unpublish or publish a plant'
      using errcode = '42501';
  end if;
  -- D13: a new tag only once the old one is retired or damaged.
  if auth.uid() is not null
     and new.qr_id is distinct from old.qr_id
     and old.qr_id is not null then
    select status into old_tag_status from public.qr_tags where qr_id = old.qr_id;
    if old_tag_status is null or old_tag_status not in ('retired', 'damaged') then
      raise exception 'Mark tag % retired or damaged before moving the plant to a new tag', old.qr_id
        using errcode = 'CTTG2';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Unpublish / publish again (D17): officer only.
-- ---------------------------------------------------------------------
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
  if coalesce(public.my_role(), '') <> 'officer' then
    raise exception 'Only officers can unpublish or publish a plant' using errcode = '42501';
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

  if p_published then
    -- Publishing is a deliberate step: finish the review first.
    if exists (select 1 from public.observations o
               where o.specimen_id = p_specimen_id and not o.is_deleted
                 and o.status in ('synced', 'returned')) then
      raise exception 'An observation of this plant is still in review or with the botanist. Finish the review before publishing.'
        using errcode = 'CTST1';
    end if;
    if not exists (select 1 from public.observations o
                   where o.specimen_id = p_specimen_id and not o.is_deleted
                     and o.status = 'approved') then
      raise exception 'This plant has no approved observation to publish.'
        using errcode = 'CTST2';
    end if;
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
         case when p_published then 'Plant ' || coalesce(v_plant.qr_id, '') || ' is published again'
              else 'Plant ' || coalesce(v_plant.qr_id, '') || ' was unpublished' end,
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

-- ---------------------------------------------------------------------
-- 3. Reviews: as 20261120020000, plus D18 (send an unpublished plant's
--    approved observation back to the botanist).
-- ---------------------------------------------------------------------
create or replace function public.review_observation(
  p_obs_id   uuid,
  p_version  int,
  p_decision text,
  p_comment  text
)
returns public.observation_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status    text;
  v_version   int;
  v_specimen  uuid;
  v_species   uuid;
  v_withdrawn boolean;
  v_review    public.observation_reviews;
begin
  if coalesce(public.my_role(), '') <> 'officer' then
    raise exception 'Only officers can review observations' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('approve', 'return', 'reject') then
    raise exception 'decision must be approve, return or reject' using errcode = 'CTRQ0';
  end if;
  if p_decision in ('return', 'reject') and coalesce(btrim(p_comment), '') = '' then
    raise exception 'A reason is required to return or reject an observation' using errcode = 'CTRQ0';
  end if;

  select o.status, o.version, o.specimen_id, s.is_withdrawn
    into v_status, v_version, v_specimen, v_withdrawn
  from public.observations o
  join public.specimens s on s.id = o.specimen_id
  where o.id = p_obs_id and not o.is_deleted
  for update of o;

  if not found then
    raise exception 'Observation not found' using errcode = 'CTNF0';
  end if;
  -- 'synced' is "Needs review" in the apps. D18: an approved observation of
  -- an unpublished plant may be sent back (returned), nothing else.
  if v_status <> 'synced'
     and not (v_status = 'approved' and p_decision = 'return' and v_withdrawn) then
    if v_status = 'approved' and p_decision = 'return' then
      raise exception 'Unpublish the plant before sending it back to the botanist' using errcode = 'CTST0';
    end if;
    raise exception 'Observation is %, not waiting for review', v_status using errcode = 'CTST0';
  end if;
  if v_version <> p_version then
    raise exception 'Observation changed since you opened it (now version %)', v_version using errcode = 'CTVR0';
  end if;

  if p_decision = 'approve' then
    select s.id into v_species
    from public.specimens sp
    left join public.species s on s.id = sp.species_id and not s.is_deleted
    where sp.id = v_specimen
    for update of sp;
    if v_species is null then
      raise exception 'Confirm the species before approving' using errcode = 'CTSP0';
    end if;
  end if;

  insert into public.observation_reviews (observation_id, reviewer_id, observation_version, decision, comment)
  values (p_obs_id, auth.uid(), v_version, p_decision, nullif(btrim(p_comment), ''))
  returning * into v_review;

  return v_review;
end;
$$;

revoke execute on function public.review_observation(uuid, int, text, text) from public, anon;
grant  execute on function public.review_observation(uuid, int, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Visitor functions: as before, without unpublished plants.
-- ---------------------------------------------------------------------
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
         case when endangered then null else lat end,
         case when endangered then null else lng end,
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
         case when endangered then null else lat end,
         case when endangered then null else lng end,
         case when endangered then null else gps_accuracy_m end,
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

create or replace function public.is_public_observation_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.observations o
    join public.specimens s on s.id = o.specimen_id
    join public.species sp on sp.id = s.species_id
    where o.id::text = p_folder
      and o.status = 'approved'
      and not o.is_deleted
      and not s.is_deleted
      and not s.is_withdrawn
      and sp.is_published
      and not sp.is_deleted
  );
$$;

revoke execute on function public.is_public_observation_folder(text) from public;
grant  execute on function public.is_public_observation_folder(text) to anon, authenticated;
