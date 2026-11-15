-- =====================================================================
-- CTIP-149: a species' habitat and ecology.
-- The project brief asks the knowledge system for "ecological information"
-- (Objective 2), and CTIP-28 listed "ecological characteristics" as a
-- species field, but until now it could only go in the description.
-- Nullable text, up to 5000 characters (checked by the API, as for
-- cultural_significance). Visitors see it on published species only, through
-- the API's public species select.
-- Safe to run more than once. Does not change or delete any data.
-- =====================================================================

alter table public.species add column if not exists ecology text;
