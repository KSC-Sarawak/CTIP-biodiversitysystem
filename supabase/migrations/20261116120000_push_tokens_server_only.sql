-- Push tokens of other people: only the API server (secret key) may read them.
--
-- Security re-test 16 Nov 2026: get_user_push_tokens() could be called by any
-- signed-in staff member straight through Supabase, with any user ids. It
-- answered other people's Expo push tokens, and with a token anyone can send
-- that phone a notification (for example a fake "sign in again" message).
-- The API now calls it with the secret key (services/api/src/pushNotifications.js).

create or replace function public.get_user_push_tokens(p_user_ids uuid[])
returns table (token text, user_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select upt.token, upt.user_id
  from public.user_push_tokens upt
  join public.profiles p on p.id = upt.user_id
  where upt.user_id = any(p_user_ids) and p.is_active = true;
$$;

revoke execute on function public.get_user_push_tokens(uuid[]) from public, anon, authenticated;
grant execute on function public.get_user_push_tokens(uuid[]) to service_role;
