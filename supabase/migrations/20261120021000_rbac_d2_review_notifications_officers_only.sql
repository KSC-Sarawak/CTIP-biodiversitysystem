-- RBAC D2 (RBAC.md): admins do not review observations, so they no longer get
-- "New record to review" / "Record sent again for review" notifications.
-- Only active officers do.
--
-- Same function as 20261029000000_staff_notifications.sql; only the recipients
-- change ('officer' instead of 'officer', 'admin'). Unread notifications of these
-- two kinds already sent to admins are marked read, so their bell clears; the
-- rows are kept.
-- Safe to run more than once.

create or replace function public.notify_on_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_type text;
  v_body text;
begin
  if new.status <> 'synced' or new.is_deleted then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'synced' then
    return new; -- already waiting; an edit is not a new submission
  end if;

  v_type := case when tg_op = 'UPDATE' and old.status = 'returned'
                 then 'observation_resubmitted' else 'observation_submitted' end;

  select coalesce(s.qr_id, 'No tag') || ' · ' || coalesce(nullif(s.proposed_species_name, ''), 'Unnamed plant')
         || ' · by ' || coalesce(nullif(p.full_name, ''), p.email, 'a botanist')
    into v_body
  from public.specimens s
  left join public.profiles p on p.id = new.recorded_by
  where s.id = new.specimen_id;

  -- A notification must never stop the botanist's record being saved: on any
  -- error here the record is kept and a warning goes to the database log.
  begin
    insert into public.notifications (user_id, type, title, body, related_table, related_id)
    select pr.id, v_type,
           case v_type when 'observation_resubmitted' then 'Record sent again for review'
                       else 'New record to review' end,
           v_body, 'observations', new.id::text
    from public.profiles pr
    where pr.role = 'officer' and pr.is_active
      and pr.id is distinct from new.recorded_by;
  exception when others then
    raise warning 'notify_on_submission: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;

revoke execute on function public.notify_on_submission() from public, anon, authenticated;

update public.notifications n
   set is_read = true
  from public.profiles pr
 where pr.id = n.user_id
   and pr.role = 'admin'
   and n.type in ('observation_submitted', 'observation_resubmitted')
   and not n.is_read;
