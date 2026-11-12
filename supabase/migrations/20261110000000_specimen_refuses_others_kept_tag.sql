-- CTIP-116: a tag kept on one botanist's phone for offline use (batch_label
-- 'reserved') is not for anyone else. Until now only the API checked that
-- (409 TAG_RESERVED in POST /specimens), so a call straight to the database
-- could register a plant on another botanist's kept tag. The tag trigger from
-- 20261028000000 now refuses it too, with errcode CTTG1, which the API maps to
-- 409 TAG_RESERVED.
--
-- Only a signed-in user is checked (auth.uid() is not null): maintenance run
-- as the database owner (SQL editor, service role) is not blocked. Everything
-- else in the function is as in 20261028000000. Safe to run more than once.

create or replace function public.assign_specimen_tag()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  tag_status text;
  tag_label text;
  tag_owner uuid;
begin
  if new.qr_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.qr_id is not distinct from old.qr_id then
    return new;
  end if;

  select status, batch_label, created_by into tag_status, tag_label, tag_owner
  from public.qr_tags where qr_id = new.qr_id for update;
  if tag_status in ('retired', 'damaged') then
    raise exception 'Tag % is %, use another tag', new.qr_id, tag_status
      using errcode = 'CTTG0';
  end if;
  if tag_label = 'reserved' and auth.uid() is not null and tag_owner is distinct from auth.uid() then
    raise exception 'Tag % is kept for another botanist', new.qr_id
      using errcode = 'CTTG1';
  end if;
  -- A missing tag is left to the foreign key, which reports it.

  update public.qr_tags set status = 'assigned'
  where qr_id = new.qr_id and status = 'unassigned';
  return new;
end;
$$;

revoke execute on function public.assign_specimen_tag() from public, anon, authenticated;
