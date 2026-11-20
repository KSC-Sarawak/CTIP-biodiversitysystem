-- =====================================================================
-- RBAC D4 (RBAC.md, 19 Nov 2026): only officers delete and restore tagged
-- plants (soft delete with is_deleted). Replaces the earlier team rule
-- "only admins delete plants" (20261105230000_specimen_delete_admin_only.sql).
--
-- The API has DELETE /specimens/:id and POST /specimens/:id/restore for
-- officers. This trigger is the database's side of the same rule, so a
-- direct Supabase call cannot skip it:
--   * only an officer may change is_deleted;
--   * an admin may still only hide or show a plant's location (D15), and
--     no longer delete or restore it.
-- Everything else is as in 20261120020000_rbac_d2_admin_system_only.sql.
-- Writes with no signed-in user (migrations, SQL Editor) are not limited.
--
-- Safe to run more than once.
-- =====================================================================

create or replace function public.guard_specimen_update()
returns trigger language plpgsql set search_path = '' as $$
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
  return new;
end;
$$;
