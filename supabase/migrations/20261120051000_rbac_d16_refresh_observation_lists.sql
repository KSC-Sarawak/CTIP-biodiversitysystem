-- RBAC D16 (RBAC.md): after 20261120050000 botanists may read every approved
-- observation, but no observation row changed, so the apps' quick reload
-- (GET /workspace skips tables whose table_versions entry has not moved) would
-- not fetch them until the next full reload. Moving the counters makes every
-- signed-in app load observations, their photos, reviews and comments again.
-- Safe to run more than once (each run only asks for one more reload).

insert into public.table_versions as tv (table_name, version, changed_at)
select t, 1, now()
from unnest(array['observations', 'observation_photos', 'observation_reviews', 'observation_comments']) as t
on conflict (table_name) do update set version = tv.version + 1, changed_at = now();
