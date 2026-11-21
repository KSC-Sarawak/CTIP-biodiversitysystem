-- RBAC D14 (RBAC.md, agreed 19 Nov 2026): who changes a user's email and name.
--
-- Email: an Admin corrects it, and it changes only after the person clicks a
--        link sent to the new address (services/api/src/emailChange.js).
-- Name:  only the person themselves (PATCH /me). Admins no longer change it.
--
-- 1. email_change_requests: the pending corrections. Only the API's secret
--    key (service role) reads or writes it; signed-in users get nothing.
-- 2. guard_profile_self_edit(): an admin can no longer change profiles.email
--    directly (it must match the sign-in email, which only the confirm step
--    moves) or another person's name. Everything else is as in
--    20261105120000_user_soft_delete.sql.
-- Safe to run twice. Does not change any data.

create table if not exists public.email_change_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  new_email      text not null,
  placeholder_id uuid,
  requested_by   uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  done_at        timestamptz
);
alter table public.email_change_requests enable row level security;
revoke all on public.email_change_requests from anon, authenticated;

create or replace function public.guard_profile_self_edit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() is null for the service role (the API's email confirm step),
  -- migrations and scheduled jobs.
  if auth.uid() is null then
    return new;
  end if;
  if public.my_role() = 'admin' then
    if new.email is distinct from old.email then
      raise exception 'An email is corrected through the confirmation link, not changed directly'
        using errcode = '42501';
    end if;
    if new.id <> auth.uid() and new.full_name is distinct from old.full_name then
      raise exception 'Only the person can change their own name' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email
     or new.deleted_at is distinct from old.deleted_at
     or new.deleted_by is distinct from old.deleted_by then
    raise exception 'Only an admin can change role, active status, email or deletion'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_self_edit() from public;
