-- =====================================================================
-- Discussion messages: edit, delete and undo.
--
-- * The author can edit the text of their own message. It then shows
--   "edited" (edited_at).
-- * The author can delete their own message, and an admin can delete any
--   message in a thread they can read (moderation). A deleted message keeps
--   no text: others see "Message deleted".
-- * Whoever deleted a message can undo it. The text comes back from the
--   history table, so nobody can put different words back in its place.
-- * Every edit, delete and undo is kept in discussion_post_versions, which
--   only people who can read that thread can read. Conversations are not
--   written to audit_logs, so admins outside a private thread never see it.
--
-- Rows are never removed one by one: a message is only ever updated.
-- Safe to run twice.
-- =====================================================================

-- 1. New columns -----------------------------------------------------------

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

-- 2. History of changes, private to the thread ------------------------------

create table if not exists public.discussion_post_versions (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.discussion_posts(id) on delete cascade,
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  action        text not null check (action in ('edit', 'delete', 'restore')),
  old_body      text,
  new_body      text,
  old_mentions  uuid[] not null default '{}',
  new_mentions  uuid[] not null default '{}',
  changed_by    uuid references public.profiles(id) on delete set null,
  changed_at    timestamptz not null default now()
);
create index if not exists discussion_post_versions_post_idx on public.discussion_post_versions (post_id, changed_at);

alter table public.discussion_post_versions enable row level security;

-- Read: whoever can read the thread. Nobody writes it directly; a trigger does.
drop policy if exists "versions: read" on public.discussion_post_versions;
create policy "versions: read" on public.discussion_post_versions for select to authenticated
  using (public.can_see_discussion(discussion_id));

-- 3. Who may change what ------------------------------------------------------
-- Runs before every update, so the rules hold for any caller, not only the
-- API. Security definer only to read the history when undoing a delete; who
-- is asking still comes from auth.uid().

create or replace function public.guard_discussion_post_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_me       uuid := auth.uid();
  v_text     text;
  v_mentions uuid[];
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
    select v.old_body, v.old_mentions into v_text, v_mentions
      from public.discussion_post_versions v
     where v.post_id = old.id and v.action = 'delete'
     order by v.changed_at desc
     limit 1;
    if not found then
      raise exception 'The deleted text could not be found' using errcode = 'P0002';
    end if;
    new.body := v_text;
    new.mentions := coalesce(v_mentions, '{}');
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

-- 4. Keep each change in the history table -------------------------------------

create or replace function public.record_discussion_post_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new is not distinct from old then
    return null;
  end if;
  insert into public.discussion_post_versions
    (post_id, discussion_id, action, old_body, new_body, old_mentions, new_mentions, changed_by)
  values (
    new.id, new.discussion_id,
    case
      when old.deleted_at is null and new.deleted_at is not null then 'delete'
      when old.deleted_at is not null and new.deleted_at is null then 'restore'
      else 'edit'
    end,
    old.body, new.body, old.mentions, new.mentions, auth.uid()
  );
  return null;
end;
$$;
revoke execute on function public.record_discussion_post_change() from public, anon, authenticated;

drop trigger if exists trg_record_discussion_post_change on public.discussion_posts;
create trigger trg_record_discussion_post_change after update on public.discussion_posts
  for each row execute function public.record_discussion_post_change();

-- 5. Updates: the author or an admin, in a thread they can read --------------
-- The guard above narrows what each person may change.

drop policy if exists "posts: author or admin update" on public.discussion_posts;
create policy "posts: author or admin update" on public.discussion_posts for update to authenticated
  using ((author_id = auth.uid() or public.my_role() = 'admin') and public.can_see_discussion(discussion_id))
  with check ((author_id = auth.uid() or public.my_role() = 'admin') and public.can_see_discussion(discussion_id));
