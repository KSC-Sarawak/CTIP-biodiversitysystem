-- RBAC D10 and D16 (RBAC.md, agreed 19 Nov 2026).
--
-- D10: botanists see every tagged plant's exact location, protected ones too.
--      The specimens table was already readable by every signed-in user; the
--      API stops reducing the location for botanists. No database change.
-- D16: botanists see every APPROVED observation, whoever recorded it
--      (measurements, notes, photos, who recorded it), so a revisit can be
--      compared with earlier visits. Unfinished observations (draft, queued,
--      waiting for review, returned, rejected) stay private to the botanist
--      who recorded them and the staff.
--      Review decisions and comments stay between the observation's botanist
--      and the staff, even on an approved observation, and only they can
--      comment.
--
-- Photos ("photos: read", "obs photos: read if can see observation") follow
-- the observation, so photos of approved observations become visible too.
-- That is intended. Editing, deleting and sending stay own-only (unchanged).
-- The API checks the same (services/api/src/observationAccess.js).
-- Safe to run twice. Does not change any data.

drop policy if exists "obs: read own or staff" on public.observations;
create policy "obs: read own or staff" on public.observations for select to authenticated
  using (
    recorded_by = (select auth.uid())
    or status = 'approved'
    or public.my_role() in ('officer', 'admin')
  );

drop policy if exists "comments: read" on public.observation_comments;
create policy "comments: read" on public.observation_comments for select to authenticated
  using (exists (
    select 1 from public.observations o
    where o.id = observation_id
      and (o.recorded_by = (select auth.uid()) or public.my_role() in ('officer', 'admin'))
  ));

drop policy if exists "comments: insert" on public.observation_comments;
create policy "comments: insert" on public.observation_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.observations o
      where o.id = observation_id
        and (o.recorded_by = (select auth.uid()) or public.my_role() in ('officer', 'admin'))
    )
  );

drop policy if exists "reviews: read" on public.observation_reviews;
create policy "reviews: read" on public.observation_reviews for select to authenticated
  using (exists (
    select 1 from public.observations o
    where o.id = observation_id
      and (o.recorded_by = (select auth.uid()) or public.my_role() in ('officer', 'admin'))
  ));
