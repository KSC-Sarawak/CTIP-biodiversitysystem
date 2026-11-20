-- RBAC D1 (docs/security/RBAC.md, agreed 19 Nov 2026): only botanists register
-- tagged plants and create observations (first observations and revisits),
-- and only a botanist adds photos to their own observation. Officers review
-- field work; they do not create it. Admins do system work only.
--
-- Before this, any signed-in user could insert their own plant, observation
-- or photo, so an officer or admin could create field data by calling the API
-- or Supabase directly. The API now refuses them too (services/api/src/permissions.js).
--
-- Unchanged: officers may still edit captions and remove photos (update and
-- delete policies), and the review function still updates observations.
-- Safe to run twice.

-- Tagged plants
drop policy if exists "specimens: register" on public.specimens;
create policy "specimens: register" on public.specimens for insert to authenticated
  with check (registered_by = (select auth.uid()) and public.my_role() = 'botanist');

-- Observations (first observation and revisits)
drop policy if exists "obs: create own" on public.observations;
create policy "obs: create own" on public.observations for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and status in ('draft', 'queued', 'synced')
    and public.my_role() = 'botanist'
  );

-- Observation photo rows: only on the botanist's own observation
drop policy if exists "photos: insert" on public.observation_photos;
create policy "photos: insert" on public.observation_photos for insert to authenticated
  with check (
    public.my_role() = 'botanist'
    and exists (
      select 1 from public.observations o
      where o.id = observation_id
        and o.recorded_by = (select auth.uid())
    )
  );

-- Observation photo files: same rule in Storage
drop policy if exists "obs photos: upload to own observation or staff" on storage.objects;
drop policy if exists "obs photos: botanist uploads to own observation" on storage.objects;
create policy "obs photos: botanist uploads to own observation"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'observation-photos'
  and public.my_role() = 'botanist'
  and exists (
    select 1 from public.observations o
    where o.id::text = (storage.foldername(name))[1]
      and o.recorded_by = (select auth.uid())
  )
);
