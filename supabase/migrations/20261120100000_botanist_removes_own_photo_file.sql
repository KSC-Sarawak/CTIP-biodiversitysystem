-- RBAC: a botanist may remove photos on their own observations, and an officer
-- on any observation (DELETE /v1/observations/:id/photos/:photoId). The row
-- policy "photos: delete own or staff" already allows both. The file policy
-- allowed officers only, so a botanist's removed photo left its file behind.
-- Same rule as the row policy now.
drop policy if exists "obs photos: staff delete" on storage.objects;
create policy "obs photos: staff delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'observation-photos'
  and (
    public.my_role() = 'officer'
    or exists (
      select 1 from public.observations o
      where o.id::text = (storage.foldername(name))[1]
        and o.recorded_by = (select auth.uid())
    )
  )
);
