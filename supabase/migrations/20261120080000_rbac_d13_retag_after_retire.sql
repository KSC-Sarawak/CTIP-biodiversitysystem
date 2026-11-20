-- =====================================================================
-- RBAC D13 (RBAC.md, 19 Nov 2026): only officers move a tagged plant to a
-- new QR tag, and only after the plant's current tag is marked retired or
-- damaged. Before, officers and admins could change a plant's tag at any
-- time, which could leave a working tag in the field pointing at nothing.
--
-- The API (POST /specimens/:id/retag) marks the old tag first and then moves
-- the plant. This trigger is the database's side of the same rule, so a
-- direct Supabase call cannot skip it. The new tag is still checked by the
-- tag trigger assign_specimen_tag(): it must exist, be unused and not be
-- retired, damaged or kept for a botanist.
-- Everything else is as in 20261120070000_rbac_d4_officer_delete_restore.sql.
-- Writes with no signed-in user (migrations, SQL Editor) are not limited.
--
-- Safe to run more than once.
-- =====================================================================

create or replace function public.guard_specimen_update()
returns trigger language plpgsql set search_path = '' as $$
declare
  old_tag_status text;
begin
  if coalesce(public.my_role(), '') not in ('officer', 'admin') and
     (new.species_id is distinct from old.species_id
      or new.endangered_override is distinct from old.endangered_override
      or new.qr_id is distinct from old.qr_id) then
    raise exception 'Only officers can set species, endangered status or the tag';
  end if;
  if auth.uid() is not null
     and coalesce(public.my_role(), '') <> 'officer'
     and new.is_deleted is distinct from old.is_deleted then
    raise exception 'Only an officer can delete or restore a plant'
      using errcode = '42501';
  end if;
  if auth.uid() is not null
     and coalesce(public.my_role(), '') = 'admin'
     and (to_jsonb(new) - 'endangered_override' - 'updated_at' - 'zone_id')
         is distinct from
         (to_jsonb(old) - 'endangered_override' - 'updated_at' - 'zone_id') then
    raise exception 'An admin can only hide or show a plant''s location'
      using errcode = '42501';
  end if;
  -- D13: a new tag only once the old one is retired or damaged.
  if auth.uid() is not null
     and new.qr_id is distinct from old.qr_id
     and old.qr_id is not null then
    select status into old_tag_status from public.qr_tags where qr_id = old.qr_id;
    if old_tag_status is null or old_tag_status not in ('retired', 'damaged') then
      raise exception 'Mark tag % retired or damaged before moving the plant to a new tag', old.qr_id
        using errcode = 'CTTG2';
    end if;
  end if;
  return new;
end;
$$;
