-- RBAC D11 (team decision 20 Nov 2026): only four conservation statuses.
--
--   least concern, near threatened, vulnerable, endangered
--
-- Removed: critically endangered, extinct in the wild, extinct, data
-- deficient, not evaluated. Only "endangered" hides a plant's location from
-- visitors automatically; any other plant can be hidden by hand with the
-- hide-location flag (endangered_override).
--
-- 1. Convert the species already stored:
--    - critically endangered -> endangered (it was hidden, it stays hidden);
--    - the other removed statuses -> no status (null). The API refuses to save
--      a species without a status, so an officer must pick one the next time
--      the species is edited. Species with no status are listed by:
--        select scientific_name from public.species where conservation_status is null;
-- 2. A check constraint so only the four values (or null for the rows above)
--    can be saved, whoever writes (API, SQL Editor, an old app build). The
--    lower-case trigger (20261105180000) runs first, so "Endangered" is fine.
--
-- Safe to run more than once.

update public.species
   set conservation_status = 'endangered'
 where lower(trim(conservation_status)) = 'critically endangered';

update public.species
   set conservation_status = null
 where conservation_status is not null
   and lower(trim(conservation_status)) not in ('least concern', 'near threatened', 'vulnerable', 'endangered');

alter table public.species drop constraint if exists species_conservation_status_check;
alter table public.species add constraint species_conservation_status_check
  check (conservation_status is null
         or conservation_status in ('least concern', 'near threatened', 'vulnerable', 'endangered'));
