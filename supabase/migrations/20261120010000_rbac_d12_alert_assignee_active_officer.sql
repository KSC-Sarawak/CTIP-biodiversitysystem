-- RBAC D12 (RBAC.md, agreed 19 Nov 2026): only an ACTIVE OFFICER can be the person
-- responsible for a sensor alert. Admins still see, acknowledge, add notes to and
-- resolve alerts, but they are not assigned. Botanists never.
--
-- Before this, alerts.assigned_to only had to be an existing profile, so a direct
-- API or Supabase call could assign an alert to a botanist, an admin or a turned-off
-- account. The API now refuses those too (POST /alerts/:id/assign, 422).
--
-- Only checks a NEW assignee: alerts already assigned keep their assignee, and
-- clearing it (null) is always allowed, including when a profile is deleted
-- (ON DELETE SET NULL). Safe to run twice. Does not change any data.

create or replace function public.guard_alert_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (
       select 1 from public.profiles p
       where p.id = new.assigned_to and p.role = 'officer' and p.is_active
     ) then
    raise exception 'Only an active officer can be assigned an alert'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_alert_assignee() from public, anon, authenticated;

drop trigger if exists trg_guard_alert_assignee on public.alerts;
create trigger trg_guard_alert_assignee
  before insert or update of assigned_to on public.alerts
  for each row execute function public.guard_alert_assignee();
