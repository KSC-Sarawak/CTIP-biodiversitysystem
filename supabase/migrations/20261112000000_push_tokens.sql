-- Mobile device push notification tokens for Expo Remote Push Notifications (CTIP)
-- Authenticated users can insert, update, or remove their own device push tokens.
-- RLS ensures users can only read/manage their own tokens, while the service role or backend can read tokens to dispatch pushes.

create table if not exists public.user_push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text check (platform in ('android', 'ios', 'web', 'unknown')) default 'unknown',
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_push_tokens_user_id on public.user_push_tokens (user_id);

alter table public.user_push_tokens enable row level security;

-- RLS policies
drop policy if exists "push_tokens: read own" on public.user_push_tokens;
create policy "push_tokens: read own"
  on public.user_push_tokens for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens: insert own" on public.user_push_tokens;
create policy "push_tokens: insert own"
  on public.user_push_tokens for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens: update own" on public.user_push_tokens;
create policy "push_tokens: update own"
  on public.user_push_tokens for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens: delete own" on public.user_push_tokens;
create policy "push_tokens: delete own"
  on public.user_push_tokens for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.user_push_tokens to authenticated;

-- Function for backend/service dispatch to safely fetch recipient push tokens
-- without exposing all tokens or hitting RLS cross-user select restrictions.
-- Only authenticated staff members (botanist, officer, admin) may execute.
create or replace function public.get_user_push_tokens(p_user_ids uuid[])
returns table (token text, user_id uuid)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true and role in ('botanist', 'officer', 'admin')
  ) then
    raise exception 'Unauthorized';
  end if;

  return query
  select upt.token, upt.user_id
  from public.user_push_tokens upt
  where upt.user_id = any(p_user_ids);
end;
$$;

revoke execute on function public.get_user_push_tokens(uuid[]) from anon, public;
grant execute on function public.get_user_push_tokens(uuid[]) to authenticated;
