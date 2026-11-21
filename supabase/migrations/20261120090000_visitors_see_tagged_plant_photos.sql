-- =====================================================================
-- Tagged-plant photos showed as blank boxes for visitors.
--
-- The observation-photos bucket is private, but the visitor pages were
-- given /storage/v1/object/public/... links, which a private bucket never
-- serves. The API now gives visitors signed links instead, made with the
-- visitor (anon) client. This policy is what lets it sign them: anon may
-- read only the files of photos visitors may see anyway, the same rows
-- public_observation_photos() returns (an approved, not deleted record of a
-- not deleted plant whose species is published).
--
-- A plant whose location is hidden (endangered, or the hide flag) keeps its
-- photos: only the location is protected (RBAC D9). Photo files have their
-- GPS data removed on upload.
--
-- Safe to run more than once.
-- =====================================================================

-- security definer: anon has no RLS access to observations, so the policy
-- asks this function, which checks the same rule as public_observation_photos().
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
      and sp.is_published
      and not sp.is_deleted
  );
$$;

revoke execute on function public.is_public_observation_folder(text) from public;
grant  execute on function public.is_public_observation_folder(text) to anon, authenticated;

drop policy if exists "obs photos: visitors read published" on storage.objects;
create policy "obs photos: visitors read published"
on storage.objects for select to anon
using (
  bucket_id = 'observation-photos'
  and public.is_public_observation_folder((storage.foldername(name))[1])
);
