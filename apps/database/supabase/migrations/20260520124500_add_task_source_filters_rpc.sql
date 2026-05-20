create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create index if not exists task_assignees_user_task_idx
on public.task_assignees(user_id, task_id);

create index if not exists workspace_boards_ws_id_id_idx
on public.workspace_boards(ws_id, id)
where deleted_at is null;

create or replace function private.list_task_source_filter_ids(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_board_id uuid default null,
  p_list_id uuid default null,
  p_source_scope text default 'all_visible',
  p_source_workspace_ids uuid[] default null,
  p_source_board_ids uuid[] default null,
  p_list_statuses text[] default null,
  p_search text default null,
  p_display_number integer default null,
  p_ticket_prefix text default null,
  p_assigned_to_me boolean default false,
  p_completed_mode text default null,
  p_closed_mode text default null,
  p_include_archived_boards boolean default false,
  p_include_deleted text default 'none',
  p_sort_by text default 'created-desc',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  task_id uuid,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      coalesce(nullif(trim(lower(p_source_scope)), ''), 'all_visible') as source_scope,
      coalesce(nullif(trim(lower(p_completed_mode)), ''), 'any') as completed_mode,
      coalesce(nullif(trim(lower(p_closed_mode)), ''), 'any') as closed_mode,
      coalesce(nullif(trim(lower(p_include_deleted)), ''), 'none') as include_deleted,
      coalesce(nullif(trim(lower(p_sort_by)), ''), 'created-desc') as sort_by,
      nullif(trim(p_search), '') as search_text,
      greatest(coalesce(p_limit, 100), 0) as page_size,
      greatest(coalesce(p_offset, 0), 0) as page_offset
  ),
  target_membership as (
    select 1
    from public.workspace_members wm
    where wm.ws_id = p_workspace_id
      and wm.user_id = p_actor_id
    limit 1
  ),
  accessible_source_workspaces as (
    select wm.ws_id
    from public.workspace_members wm
    where wm.user_id = p_actor_id
  ),
  scoped_tasks as (
    select distinct
      t.id,
      t.name,
      t.sort_key,
      t.created_at,
      t.end_date,
      wb.name as board_name,
      wb.ws_id,
      tl.name as list_name,
      count(*) over() as total_count
    from normalized n
    join target_membership tm on true
    join public.tasks t on true
    join public.task_lists tl on tl.id = t.list_id
    join public.workspace_boards wb on wb.id = tl.board_id
    join accessible_source_workspaces asw on asw.ws_id = wb.ws_id
    left join public.task_assignees actor_assignment
      on actor_assignment.task_id = t.id
      and actor_assignment.user_id = p_actor_id
    where p_actor_id is not null
      and p_workspace_id is not null
      and coalesce(tl.deleted, false) is false
      and wb.deleted_at is null
      and (p_include_archived_boards or wb.archived_at is null)
      and (
        n.include_deleted = 'all'
        or (n.include_deleted = 'only' and t.deleted_at is not null)
        or (n.include_deleted not in ('all', 'only') and t.deleted_at is null)
      )
      and (
        p_list_statuses is null
        or cardinality(p_list_statuses) = 0
        or tl.status::text = any(p_list_statuses)
      )
      and (
        n.completed_mode not in ('exclude', 'only')
        or (n.completed_mode = 'exclude' and t.completed_at is null)
        or (n.completed_mode = 'only' and t.completed_at is not null)
      )
      and (
        n.closed_mode not in ('exclude', 'only')
        or (n.closed_mode = 'exclude' and t.closed_at is null)
        or (n.closed_mode = 'only' and t.closed_at is not null)
      )
      and (
        p_assigned_to_me is not true
        or actor_assignment.user_id is not null
      )
      and (
        n.search_text is null
        or t.name ilike '%' || n.search_text || '%'
      )
      and (
        p_display_number is null
        or t.display_number = p_display_number
      )
      and (
        p_ticket_prefix is null
        or wb.ticket_prefix = p_ticket_prefix
      )
      and (
        (
          n.source_scope in ('all_visible', 'current_board')
          and wb.ws_id = p_workspace_id
          and (p_board_id is null or wb.id = p_board_id)
          and (p_list_id is null or tl.id = p_list_id)
        )
        or (
          n.source_scope = 'external_current_workspace'
          and actor_assignment.user_id is not null
          and wb.ws_id = p_workspace_id
          and (p_board_id is null or wb.id <> p_board_id)
        )
        or (
          n.source_scope = 'external_specific'
          and actor_assignment.user_id is not null
          and (p_board_id is null or wb.id <> p_board_id)
          and (
            (coalesce(cardinality(p_source_workspace_ids), 0) > 0 and wb.ws_id = any(p_source_workspace_ids))
            or (coalesce(cardinality(p_source_board_ids), 0) > 0 and wb.id = any(p_source_board_ids))
          )
        )
      )
  )
  select scoped_tasks.id as task_id, scoped_tasks.total_count
  from scoped_tasks
  cross join normalized n
  order by
    case
      when n.source_scope like 'external%' and n.sort_by = 'name-asc'
      then lower(scoped_tasks.name)
    end asc nulls last,
    case
      when n.source_scope like 'external%' and n.sort_by = 'due-asc'
      then scoped_tasks.end_date
    end asc nulls last,
    case
      when n.source_scope like 'external%' and n.sort_by = 'created-asc'
      then scoped_tasks.created_at
    end asc nulls last,
    case
      when n.source_scope like 'external%' and n.sort_by = 'source-asc'
      then lower(coalesce(scoped_tasks.board_name, '') || ' ' || coalesce(scoped_tasks.list_name, ''))
    end asc nulls last,
    case
      when n.source_scope like 'external%' and n.sort_by not in ('name-asc', 'due-asc', 'created-asc', 'source-asc')
      then scoped_tasks.created_at
    end desc nulls last,
    case
      when n.source_scope not like 'external%'
      then scoped_tasks.sort_key
    end asc nulls last,
    scoped_tasks.created_at desc nulls last,
    scoped_tasks.id
  limit (select page_size from normalized)
  offset (select page_offset from normalized);
$$;

revoke all on function private.list_task_source_filter_ids(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  uuid[],
  uuid[],
  text[],
  text,
  integer,
  text,
  boolean,
  text,
  text,
  boolean,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function private.list_task_source_filter_ids(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  uuid[],
  uuid[],
  text[],
  text,
  integer,
  text,
  boolean,
  text,
  text,
  boolean,
  text,
  text,
  integer,
  integer
) to service_role;

comment on function private.list_task_source_filter_ids(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  uuid[],
  uuid[],
  text[],
  text,
  integer,
  text,
  boolean,
  text,
  text,
  boolean,
  text,
  text,
  integer,
  integer
) is
  'Server-only task board source filter helper for Tuturuuu API routes. It enforces actor workspace membership and accessible external source workspaces while returning paginated task ids plus a total count for API-side hydration.';
