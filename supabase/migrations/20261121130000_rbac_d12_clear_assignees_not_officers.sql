-- RBAC D12 (RBAC.md): only an ACTIVE OFFICER can be the person responsible for
-- an alert. 20261120010000 stops NEW assignments to anyone else; this file
-- deals with the rest:
--
-- 1. Open and acknowledged alerts already assigned to an admin, a botanist or
--    a turned-off account lose that assignee, so an officer can take them.
--    Resolved alerts keep their history.
-- 2. When a person stops being an active officer (turned off, deleted, or
--    given another role), their open and acknowledged alerts are unassigned
--    the same way, so no alert stays with someone who cannot act on it.
--
-- Safe to run more than once.

update public.alerts a
   set assigned_to = null
 where a.assigned_to is not null
   and a.status in ('open', 'acknowledged')
   and not exists (
     select 1 from public.profiles p
     where p.id = a.assigned_to and p.role = 'officer' and p.is_active
   );

create or replace function public.unassign_alerts_of_former_officer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'officer' and old.is_active
     and not (new.role = 'officer' and new.is_active) then
    update public.alerts
       set assigned_to = null
     where assigned_to = new.id
       and status in ('open', 'acknowledged');
  end if;
  return new;
end;
$$;

revoke execute on function public.unassign_alerts_of_former_officer() from public, anon, authenticated;

drop trigger if exists trg_unassign_alerts_of_former_officer on public.profiles;
create trigger trg_unassign_alerts_of_former_officer
  after update of role, is_active on public.profiles
  for each row execute function public.unassign_alerts_of_former_officer();
