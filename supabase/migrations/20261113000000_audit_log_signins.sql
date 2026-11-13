-- VA-71 audit log: sign-ins, more tables, and a log nobody can edit.
--
-- 1. audit_logs also records SIGN_IN, SIGN_IN_FAILED, MFA_FAILED, SIGN_OUT.
--    The API writes them through log_auth_event(); it never sends the
--    password or the 6-digit code, only the email.
-- 2. qr_tags, sensor_nodes, zones and observation_reviews get the same
--    change trigger as species/specimens/observations/alerts/profiles.
-- 3. Rows in audit_logs can never be edited or deleted (not even by a
--    Supabase Owner in the SQL editor). The one exception is the database
--    itself blanking changed_by when a purged account is removed
--    ("on delete set null"); nothing else in the row may change.

-- 1a. New action names.
alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check
  check (action in ('INSERT', 'UPDATE', 'DELETE',
                    'SIGN_IN', 'SIGN_IN_FAILED', 'MFA_FAILED', 'SIGN_OUT'));

-- 1b. Called by the API (services/api/src/auditLog.js). With a user's token, auth.uid() is that person, so
--     nobody can log an event in someone else's name. Without a token (wrong
--     password: there is no session yet) only SIGN_IN_FAILED is accepted.
create or replace function public.log_auth_event(p_event text, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if p_event not in ('SIGN_IN', 'SIGN_IN_FAILED', 'MFA_FAILED', 'SIGN_OUT') then
    raise exception 'Unknown sign-in event' using errcode = '22023';
  end if;
  if v_uid is null and p_event <> 'SIGN_IN_FAILED' then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  -- A signed-in person's own email, never one the caller typed in.
  if v_uid is not null then
    select email into v_email from auth.users where id = v_uid;
  end if;
  v_email := left(lower(trim(coalesce(v_email, p_email, ''))), 200);
  insert into public.audit_logs (changed_by, table_name, record_id, action, old_value, new_value)
  values (
    v_uid,
    'auth',
    coalesce(v_uid::text, 'unknown'),
    p_event,
    null,
    jsonb_build_object('email', v_email)
  );
end;
$$;
revoke execute on function public.log_auth_event(text, text) from public;
grant execute on function public.log_auth_event(text, text) to anon, authenticated;

-- 2. qr_tags is keyed by qr_id, not id, so record_id falls back to it.
create or replace function public.audit_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (changed_by, table_name, record_id, action, old_value, new_value)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id',
             to_jsonb(new) ->> 'qr_id', to_jsonb(old) ->> 'qr_id', 'unknown'),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;
revoke execute on function public.audit_changes() from public, anon, authenticated;

drop trigger if exists audit_qr_tags on public.qr_tags;
create trigger audit_qr_tags after insert or update or delete on public.qr_tags
  for each row execute function public.audit_changes();
drop trigger if exists audit_sensor_nodes on public.sensor_nodes;
create trigger audit_sensor_nodes after insert or update or delete on public.sensor_nodes
  for each row execute function public.audit_changes();
drop trigger if exists audit_zones on public.zones;
create trigger audit_zones after insert or update or delete on public.zones
  for each row execute function public.audit_changes();
drop trigger if exists audit_observation_reviews on public.observation_reviews;
create trigger audit_observation_reviews after insert or update or delete on public.observation_reviews
  for each row execute function public.audit_changes();

-- 3. Append-only.
create or replace function public.audit_logs_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.changed_by is null
       and (to_jsonb(new) - 'changed_by') = (to_jsonb(old) - 'changed_by') then
      return new; -- account removed: "on delete set null"
    end if;
  end if;
  raise exception 'audit_logs cannot be changed or deleted' using errcode = '42501';
end;
$$;
revoke execute on function public.audit_logs_append_only() from public, anon, authenticated;

drop trigger if exists audit_logs_no_change on public.audit_logs;
create trigger audit_logs_no_change before update or delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();
drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_logs_append_only();
