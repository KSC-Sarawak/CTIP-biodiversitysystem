-- CTIP-50 / VA-72 (penetration test, 17 Nov 2026). Two fixes for the database's
-- "back door": the website holds the Supabase address and publishable key, so a
-- signed-in person can skip the API and call Supabase directly with their token.
--
-- F-20: a password-only (aal1) token could read and change data directly, so the
-- 6-digit code (VA-70) was only checked by the API. Every staff member needs MFA,
-- so every table now also needs an aal2 token, through a restrictive policy.
-- The MFA set-up and lost-phone steps use Supabase Auth and the API's secret
-- key, never these tables, so they still work with an aal1 token.
-- Local testing with MFA_OFF=true: run once in the LOCAL database only
--   alter database postgres set app.mfa_off = 'on';
-- and reconnect. Never set it on the hosted project.
--
-- F-22: the API only accepts a small JPEG, PNG or WebP picture as avatar_url
-- (F-18), but a direct update could save any link. The same rule is now a
-- check in the table. NOT VALID: older rows are not re-checked, new writes are.
-- Safe to run twice.

create or replace function public.has_mfa()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or coalesce(current_setting('app.mfa_off', true), '') = 'on'
$$;

revoke execute on function public.has_mfa() from public, anon;
grant execute on function public.has_mfa() to authenticated;

do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists "mfa only" on public.%I', t);
    execute format(
      'create policy "mfa only" on public.%I as restrictive '
      'for all to authenticated '
      'using (public.has_mfa()) with check (public.has_mfa())', t);
  end loop;
end
$$;

drop policy if exists "mfa only" on storage.objects;
create policy "mfa only" on storage.objects as restrictive
  for all to authenticated
  using (public.has_mfa()) with check (public.has_mfa());

alter table public.profiles drop constraint if exists profiles_avatar_format;
alter table public.profiles
  add constraint profiles_avatar_format check (
    avatar_url is null
    or (length(avatar_url) <= 90000
        and avatar_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
  ) not valid;
