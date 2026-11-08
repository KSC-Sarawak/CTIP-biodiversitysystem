-- =====================================================================
-- Discussion messages: edit, delete and undo.
--
-- * The author can edit the text of their own message. It then shows
--   "edited" (edited_at).
-- * The author can delete their own message, and an admin can delete any
--   message they can read (moderation). A deleted message keeps no text:
--   others see "Message deleted".
-- * Whoever deleted a message can undo it. The text comes back from the
--   audit log, so nobody can put different words back in its place.
-- * Every edit, delete and undo is written to audit_logs with the message
--   before and after (admins read it on the Audit log page). New messages
--   are not logged: they are already in the thread.
--
-- Rows are never removed one by one: a message is only ever updated.
-- Safe to run twice.
-- =====================================================================

alter table public.discussion_posts
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

-- A live message has 1 to 5000 characters; a deleted one has none.
alter table public.discussion_posts drop constraint if exists discussion_posts_body_check;
alter table public.discussion_posts drop constraint if exists discussion_posts_body_state;
alter table public.discussion_posts add constraint discussion_posts_body_state check (
  (deleted_at is null and char_length(body) between 1 and 5000)
  or (deleted_at is not null and body = '')
);

-- Who may change what. Runs before every update, so the rules hold for any
-- caller, not only the API. Security definer only to read the audit log
-- when undoing a delete; who is asking still comes from auth.uid().
create or replace function public.guard_discussion_post_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_me     uuid := auth.uid();
  v_before jsonb;
begin
  if v_me is null then
    return new; -- migrations and scheduled jobs
  end if;

  if new.id <> old.id or new.discussion_id <> old.discussion_id
     or new.author_id is distinct from old.author_id or new.created_at <> old.created_at then
    raise exception 'Only the text of a message can change' using errcode = '42501';
  end if;

  -- Delete: the author, or an admin.
  if old.deleted_at is null and new.deleted_at is not null then
    if old.author_id is distinct from v_me and public.my_role() is distinct from 'admin' then
      raise exception 'Only the author or an admin can delete this message' using errcode = '42501';
    end if;
    new.deleted_at := now();
    new.deleted_by := v_me;
    new.body := '';
    new.mentions := '{}';
    new.edited_at := old.edited_at;
    return new;
  end if;

  -- Undo a delete: whoever deleted it. The text is the one the delete removed.
  if old.deleted_at is not null and new.deleted_at is null then
    if old.deleted_by is distinct from v_me then
      raise exception 'Only the person who deleted this message can undo it' using errcode = '42501';
    end if;
    select a.old_value into v_before
      from public.audit_logs a
     where a.table_name = 'discussion_posts' and a.record_id = old.id::text and a.action = 'UPDATE'
       and a.old_value ->> 'deleted_at' is null and a.new_value ->> 'deleted_at' is not null
     order by a.changed_at desc
     limit 1;
    if v_before is null then
      raise exception 'The deleted text could not be found' using errcode = 'P0002';
    end if;
    new.body := v_before ->> 'body';
    new.mentions := coalesce(array(select jsonb_array_elements_text(v_before -> 'mentions')::uuid), '{}');
    new.deleted_by := null;
    new.edited_at := old.edited_at;
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'A deleted message cannot be edited' using errcode = '42501';
  end if;

  -- Edit: the author only.
  if old.author_id is distinct from v_me then
    raise exception 'Only the author can edit this message' using errcode = '42501';
  end if;
  new.deleted_by := old.deleted_by;
  new.edited_at := case
    when new.body is distinct from old.body or new.mentions is distinct from old.mentions then now()
    else old.edited_at
  end;
  return new;
end;
$$;
revoke execute on function public.guard_discussion_post_update() from public, anon, authenticated;

drop trigger if exists trg_guard_discussion_post on public.discussion_posts;
create trigger trg_guard_discussion_post before update on public.discussion_posts
  for each row execute function public.guard_discussion_post_update();

-- Updates only. The trigger above narrows what each person may change.
drop policy if exists "posts: author or admin update" on public.discussion_posts;
create policy "posts: author or admin update" on public.discussion_posts for update to authenticated
  using (author_id = auth.uid() or public.my_role() = 'admin')
  with check (author_id = auth.uid() or public.my_role() = 'admin');

-- Edits, deletes and undos go to the audit log (audit_changes() from the first schema).
drop trigger if exists audit_discussion_posts on public.discussion_posts;
create trigger audit_discussion_posts after update on public.discussion_posts
  for each row execute function public.audit_changes();
