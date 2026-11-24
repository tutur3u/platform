-- Tasks gain comments, linked resources and external-source references so a
-- board can carry an imported GitHub issue tracker (or any external tracker)
-- with its full timeline.
--
-- The tables live in private and only service_role can reach them. Product
-- servers (the Tasks API) resolve the signed-in principal and enforce:
--   read            -> the caller can access the task (is_task_accessible)
--   comment         -> task access; edit/delete own comment, or workspace
--                      manage_projects for moderation
--   link / unlink   -> task edit right
--   import / refs   -> workspace manage_projects (bulk import is an admin act)
-- RLS stays enabled with no policies, so a future client grant exposes
-- nothing until a policy is written for it.
--
-- Every row carries ws_id. A trigger checks that the task belongs to that
-- workspace and takes a key-share lock on the task, so a concurrent task
-- delete fails the insert with 23503 instead of leaving a dangling row.
--
-- Comment, link and import writes append public.task_history rows so the
-- existing per-task activity timeline shows them. History metadata carries
-- ids, kinds and URLs only, never comment bodies. Imported historical events
-- keep their original timestamp and the external actor login in metadata.
--
-- The trigger functions are revoked from every role and never granted:
-- only the trigger machinery runs them.
-- tuturuuu: no-grant (trigger)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ---------------------------------------------------------------------------
-- 1. Comments
-- ---------------------------------------------------------------------------
create table private.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  -- Imported comments name their external author (e.g. a GitHub login);
  -- native comments leave it null and use author_id.
  external_author text,
  external_url text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint task_comments_body_check
    check (char_length(btrim(body)) between 1 and 65536),
  constraint task_comments_external_author_check
    check (external_author is null or char_length(external_author) between 1 and 100),
  constraint task_comments_external_url_check
    check (external_url is null or (external_url ~ '^https://' and char_length(external_url) <= 2048)),
  constraint task_comments_deleted_check
    check (deleted_at is null or deleted_at >= created_at)
);

create index task_comments_task_idx
  on private.task_comments (task_id, created_at)
  where deleted_at is null;
create index task_comments_ws_idx on private.task_comments (ws_id);
create index task_comments_author_idx on private.task_comments (author_id)
  where author_id is not null;
-- Idempotent import: one row per external comment URL per task. Native
-- comments have no URL, and NULLs never collide in a unique index. The index
-- is deliberately not partial: PostgREST upserts name only the conflict
-- columns, and Postgres cannot infer a partial index from them.
create unique index task_comments_external_url_key
  on private.task_comments (task_id, external_url);

-- ---------------------------------------------------------------------------
-- 2. Linked resources
-- ---------------------------------------------------------------------------
create table private.task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  provider text not null default 'web',
  url text not null,
  external_id text,
  title text,
  state text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_by uuid references public.users(id) on delete set null,
  removed_at timestamptz,
  constraint task_links_kind_check check (
    kind in ('pull_request', 'commit', 'ci_run', 'issue', 'doc', 'url')
  ),
  constraint task_links_provider_check check (provider in ('github', 'web')),
  constraint task_links_url_check
    check (url ~ '^https://' and char_length(url) <= 2048),
  constraint task_links_external_id_check
    check (external_id is null or char_length(external_id) <= 200),
  constraint task_links_title_check
    check (title is null or char_length(title) <= 500),
  constraint task_links_state_check check (
    state is null or state in ('open', 'closed', 'merged', 'draft', 'success', 'failure', 'pending', 'cancelled')
  ),
  constraint task_links_metadata_check check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8192
  )
);

-- Links are soft-removed so the timeline keeps the remover; a URL can be
-- linked again after removal.
create unique index task_links_active_url_key
  on private.task_links (task_id, url)
  where removed_at is null;

create index task_links_ws_idx on private.task_links (ws_id);
create index task_links_lookup_idx on private.task_links (ws_id, provider, kind, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- 3. External source references (import key)
-- ---------------------------------------------------------------------------
create table private.task_external_refs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.tasks(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  external_url text not null,
  external_repo text,
  external_number integer,
  external_author text,
  external_state text,
  external_state_reason text,
  -- Logins with no workspace user mapping; the task stays unassigned.
  external_assignees text[] not null default '{}',
  external_created_at timestamptz,
  external_closed_at timestamptz,
  external_labels text[] not null default '{}',
  imported_by uuid references public.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  constraint task_external_refs_provider_check check (provider in ('github')),
  constraint task_external_refs_url_check
    check (external_url ~ '^https://' and char_length(external_url) <= 2048),
  constraint task_external_refs_repo_check
    check (external_repo is null or external_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  constraint task_external_refs_number_check
    check (external_number is null or external_number > 0),
  constraint task_external_refs_author_check
    check (external_author is null or char_length(external_author) <= 100),
  constraint task_external_refs_state_check
    check (external_state is null or external_state in ('open', 'closed')),
  constraint task_external_refs_state_reason_check
    check (external_state_reason is null or external_state_reason in ('completed', 'not_planned', 'reopened', 'duplicate')),
  constraint task_external_refs_labels_check
    check (cardinality(external_labels) <= 100),
  constraint task_external_refs_assignees_check
    check (cardinality(external_assignees) <= 100),
  -- The idempotency key: an external issue maps to one task per workspace.
  constraint task_external_refs_unique unique (ws_id, provider, external_url)
);

create index task_external_refs_number_idx
  on private.task_external_refs (ws_id, provider, external_repo, external_number);

alter table private.task_comments enable row level security;
alter table private.task_links enable row level security;
alter table private.task_external_refs enable row level security;

revoke all on table private.task_comments from public, anon, authenticated;
revoke all on table private.task_links from public, anon, authenticated;
revoke all on table private.task_external_refs from public, anon, authenticated;
grant select, insert, update, delete on table private.task_comments to service_role;
grant select, insert, update, delete on table private.task_links to service_role;
grant select, insert, update, delete on table private.task_external_refs to service_role;

-- ---------------------------------------------------------------------------
-- 4. Workspace consistency
-- ---------------------------------------------------------------------------
create function private.validate_task_child_workspace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
    and (new.task_id is distinct from old.task_id or new.ws_id is distinct from old.ws_id)
  then
    raise exception 'A task child row cannot move between tasks or workspaces'
      using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    perform 1
    from public.tasks t
    join public.task_lists tl on tl.id = t.list_id
    join public.workspace_boards wb on wb.id = tl.board_id
    where t.id = new.task_id and wb.ws_id = new.ws_id
    for key share of t;
    if not found then
      raise exception 'Task is not in this workspace' using errcode = '23503';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create function private.validate_task_external_ref_workspace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.task_id, new.ws_id, new.provider, new.external_url)
      is distinct from (old.task_id, old.ws_id, old.provider, old.external_url)
    then
      raise exception 'External reference identity is immutable' using errcode = '55000';
    end if;
    new.last_synced_at := now();
    return new;
  end if;
  perform 1
  from public.tasks t
  join public.task_lists tl on tl.id = t.list_id
  join public.workspace_boards wb on wb.id = tl.board_id
  where t.id = new.task_id and wb.ws_id = new.ws_id
  for key share of t;
  if not found then
    raise exception 'Task is not in this workspace' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger task_comments_validate
before insert or update on private.task_comments
for each row execute function private.validate_task_child_workspace();

create trigger task_links_validate
before insert or update on private.task_links
for each row execute function private.validate_task_child_workspace();

create trigger task_external_refs_validate
before insert or update on private.task_external_refs
for each row execute function private.validate_task_external_ref_workspace();

-- ---------------------------------------------------------------------------
-- 5. Timeline (task_history)
-- ---------------------------------------------------------------------------
alter table public.task_history
  drop constraint task_history_change_type_check;
alter table public.task_history
  add constraint task_history_change_type_check check (
    change_type in (
      'task_created',
      'field_updated',
      'assignee_added',
      'assignee_removed',
      'label_added',
      'label_removed',
      'project_linked',
      'project_unlinked',
      'comment_added',
      'comment_updated',
      'comment_deleted',
      'link_added',
      'link_removed',
      'external_imported',
      'external_event'
    )
  ) not valid;
-- Existing rows are validated by the follow-up migration that validates task_history_change_type_check.

create function private.record_task_comment_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_change text;
  v_row private.task_comments;
begin
  if tg_op = 'INSERT' then
    v_change := 'comment_added';
    v_row := new;
  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null then
      v_change := 'comment_deleted';
    elsif new.body is distinct from old.body then
      v_change := 'comment_updated';
    else
      return new;
    end if;
    v_row := new;
  else
    return new;
  end if;

  insert into public.task_history (
    task_id, changed_by, changed_at, change_type, field_name, metadata
  ) values (
    v_row.task_id,
    case when tg_op = 'INSERT' then v_row.author_id else v_row.updated_by end,
    case when tg_op = 'INSERT' then v_row.created_at else now() end,
    v_change,
    'comment',
    jsonb_strip_nulls(jsonb_build_object(
      'comment_id', v_row.id,
      'external_author', v_row.external_author,
      'external_url', v_row.external_url
    ))
  );
  return new;
end $$;

create function private.record_task_link_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row private.task_links;
begin
  if tg_op = 'INSERT' then
    v_row := new;
  elsif new.removed_at is not null and old.removed_at is null then
    v_row := new;
  else
    return new;
  end if;

  insert into public.task_history (
    task_id, changed_by, changed_at, change_type, field_name, metadata
  ) values (
    v_row.task_id,
    case when tg_op = 'INSERT' then v_row.created_by else v_row.removed_by end,
    case when tg_op = 'INSERT' then v_row.created_at else v_row.removed_at end,
    case when tg_op = 'INSERT' then 'link_added' else 'link_removed' end,
    'link',
    jsonb_strip_nulls(jsonb_build_object(
      'link_id', v_row.id,
      'kind', v_row.kind,
      'provider', v_row.provider,
      'url', v_row.url,
      'external_id', v_row.external_id,
      'title', v_row.title
    ))
  );
  return new;
end $$;

create trigger task_comments_history
after insert or update on private.task_comments
for each row execute function private.record_task_comment_history();

create trigger task_links_history
after insert or update on private.task_links
for each row execute function private.record_task_link_history();

revoke all on function private.validate_task_child_workspace() from public, anon, authenticated, service_role;
revoke all on function private.validate_task_external_ref_workspace() from public, anon, authenticated, service_role;
revoke all on function private.record_task_comment_history() from public, anon, authenticated, service_role;
revoke all on function private.record_task_link_history() from public, anon, authenticated, service_role;

commit;
