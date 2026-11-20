-- RBAC D2, D5, D6, D15 (RBAC.md, agreed 19 Nov 2026).
--
-- D2: the admin does system work only (accounts, audit log, monitoring).
--     Species, species photos, reviews, tag stock and field photos are
--     officer work, so the admin can no longer write them.
-- D5: tags. Officers print, retire and delete tags. Botanists keep their own
--     "qr: botanist insert" and "qr: botanist release own reserved" rules.
-- D6: the admin can still READ everything (species, media, tags, plants).
-- D15: officers and admins may hide or show a plant's location
--     (endangered_override). For an admin that is the ONLY plant field they
--     may change.
--
-- The API refuses the same things (services/api/src/permissions.js and the
-- 'patch /specimens/:id' handler); this file makes the database agree, so a
-- direct Supabase call cannot get around it.
--
-- Unchanged on purpose: only an admin deletes or restores a plant
-- (is_deleted, 20261105230000). That moves in a later RBAC PR (D4).
-- Writes with no signed-in user (migrations, SQL Editor) are not limited.
-- Safe to run twice. Does not change any data.

-- ---------------------------------------------------------------------
-- 1. Reviews: officer only
--    Same function as 20261029120000_approve_requires_species.sql; only the
--    role check changes.
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
  v_status   text;
  v_version  int;
  v_specimen uuid;
  v_species  uuid;
  v_review   public.observation_reviews;
begin
  -- coalesce: a missing role (not signed in, no profile, deactivated) is
  -- forbidden, not NULL.
  if coalesce(public.my_role(), '') <> 'officer' then
    raise exception 'Only officers can review observations' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('approve', 'return', 'reject') then
    raise exception 'decision must be approve, return or reject' using errcode = 'CTRQ0';
  end if;
  if p_decision in ('return', 'reject') and coalesce(btrim(p_comment), '') = '' then
    raise exception 'A reason is required to return or reject an observation' using errcode = 'CTRQ0';
  end if;

  select status, version, specimen_id into v_status, v_version, v_specimen
  from public.observations
  where id = p_obs_id and not is_deleted
  for update;

  if not found then
    raise exception 'Observation not found' using errcode = 'CTNF0';
  end if;
  -- 'synced' is "Needs review" in the apps.
  if v_status <> 'synced' then
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

-- Officers edit observations (review fields); admins no longer do.
drop policy if exists "obs: staff edit" on public.observations;
create policy "obs: staff edit" on public.observations for update to authenticated
  using (public.my_role() = 'officer');

-- ---------------------------------------------------------------------
-- 2. Species and species media: officers write, officers and admins read
--    The old "for all" policies also gave read access, so read gets its own
--    policy before write is narrowed.
-- ---------------------------------------------------------------------
drop policy if exists "species: staff write" on public.species;
create policy "species: staff write" on public.species for all to authenticated
  using (public.my_role() = 'officer') with check (public.my_role() = 'officer');

drop policy if exists "media: staff read" on public.species_media;
create policy "media: staff read" on public.species_media for select to authenticated
  using (public.my_role() in ('officer', 'admin'));
drop policy if exists "media: staff write" on public.species_media;
create policy "media: staff write" on public.species_media for all to authenticated
  using (public.my_role() = 'officer') with check (public.my_role() = 'officer');

drop policy if exists "species media: staff upload" on storage.objects;
create policy "species media: staff upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'species-media' and public.my_role() = 'officer');

drop policy if exists "species media: staff update" on storage.objects;
create policy "species media: staff update"
on storage.objects for update to authenticated
using (bucket_id = 'species-media' and public.my_role() = 'officer');

drop policy if exists "species media: staff delete" on storage.objects;
create policy "species media: staff delete"
on storage.objects for delete to authenticated
using (bucket_id = 'species-media' and public.my_role() = 'officer');

-- ---------------------------------------------------------------------
-- 3. QR tag stock: officers write ("qr: read" stays open to signed-in users;
--    the botanist insert and release rules are unchanged)
-- ---------------------------------------------------------------------
drop policy if exists "qr: staff write" on public.qr_tags;
create policy "qr: staff write" on public.qr_tags for all to authenticated
  using (public.my_role() = 'officer') with check (public.my_role() = 'officer');

-- ---------------------------------------------------------------------
-- 4. Field photos: the botanist owner or an officer may edit or remove
-- ---------------------------------------------------------------------
drop policy if exists "photos: update own or staff" on public.observation_photos;
create policy "photos: update own or staff" on public.observation_photos for update to authenticated
  using (exists (
    select 1 from public.observations o
    where o.id = observation_id
      and (o.recorded_by = (select auth.uid()) or public.my_role() = 'officer')
  ));

drop policy if exists "photos: delete own or staff" on public.observation_photos;
create policy "photos: delete own or staff" on public.observation_photos for delete to authenticated
  using (exists (
    select 1 from public.observations o
    where o.id = observation_id
      and (o.recorded_by = (select auth.uid()) or public.my_role() = 'officer')
  ));

drop policy if exists "obs photos: update own or staff" on storage.objects;
create policy "obs photos: update own or staff"
on storage.objects for update to authenticated
using (
  bucket_id = 'observation-photos'
  and exists (
    select 1 from public.observations o
    where o.id::text = (storage.foldername(name))[1]
      and (o.recorded_by = (select auth.uid()) or public.my_role() = 'officer')
  )
);

drop policy if exists "obs photos: staff delete" on storage.objects;
create policy "obs photos: staff delete"
on storage.objects for delete to authenticated
using (bucket_id = 'observation-photos' and public.my_role() = 'officer');

-- ---------------------------------------------------------------------
-- 5. Plants: an admin may change only the hide-location flag (D15)
--    Same checks as 20261105230000_specimen_delete_admin_only.sql, plus the
--    admin check. updated_at, zone_id (set by triggers) and is_deleted
--    (admin delete/restore, unchanged until D4) are not counted.
-- ---------------------------------------------------------------------
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
     and coalesce(public.my_role(), '') = 'admin'
     and (to_jsonb(new) - 'endangered_override' - 'updated_at' - 'zone_id' - 'is_deleted')
         is distinct from
         (to_jsonb(old) - 'endangered_override' - 'updated_at' - 'zone_id' - 'is_deleted') then
    raise exception 'An admin can only hide or show a plant''s location'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
