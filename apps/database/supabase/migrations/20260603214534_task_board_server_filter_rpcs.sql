create index if not exists task_labels_label_task_idx
on public.task_labels(label_id, task_id);

create index if not exists task_project_tasks_project_task_idx
on public.task_project_tasks(project_id, task_id);

create index if not exists tasks_list_due_date_idx
on public.tasks(list_id, end_date)
where deleted_at is null;

create index if not exists tasks_list_estimation_points_idx
on public.tasks(list_id, estimation_points)
where deleted_at is null;

create index if not exists tasks_list_priority_idx
on public.tasks(list_id, priority)
where deleted_at is null;

drop function if exists private.list_task_source_filter_ids(
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
);

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
  p_has_due_date boolean default false,
  p_sort_by text default 'created-desc',
  p_limit integer default 100,
  p_offset integer default 0,
  p_label_ids uuid[] default null,
  p_assignee_ids uuid[] default null,
  p_project_ids uuid[] default null,
  p_priorities text[] default null,
  p_estimation_min smallint default null,
  p_estimation_max smallint default null,
  p_due_date_from timestamptz default null,
  p_due_date_to timestamptz default null,
  p_include_unassigned boolean default false
)
returns table (
  task_id uuid,
  list_id uuid,
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
      and wm.type = 'MEMBER'
    limit 1
  ),
  accessible_source_workspaces as (
    select wm.ws_id
    from public.workspace_members wm
    where wm.user_id = p_actor_id
      and wm.type = 'MEMBER'
  ),
  scoped_tasks as (
    select distinct
      t.id,
      t.list_id,
      t.name,
      t.priority,
      t.sort_key,
      t.created_at,
      t.end_date,
      t.estimation_points,
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
        p_include_unassigned is not true
        or not exists (
          select 1
          from public.task_assignees ta_unassigned
          where ta_unassigned.task_id = t.id
        )
      )
      and (
        p_assignee_ids is null
        or cardinality(p_assignee_ids) = 0
        or exists (
          select 1
          from public.task_assignees ta_filter
          where ta_filter.task_id = t.id
            and ta_filter.user_id = any(p_assignee_ids)
        )
      )
      and (
        p_label_ids is null
        or cardinality(p_label_ids) = 0
        or exists (
          select 1
          from public.task_labels tl_filter
          where tl_filter.task_id = t.id
            and tl_filter.label_id = any(p_label_ids)
        )
      )
      and (
        p_project_ids is null
        or cardinality(p_project_ids) = 0
        or exists (
          select 1
          from public.task_project_tasks tpt_filter
          where tpt_filter.task_id = t.id
            and tpt_filter.project_id = any(p_project_ids)
        )
      )
      and (
        p_priorities is null
        or cardinality(p_priorities) = 0
        or t.priority::text = any(p_priorities)
      )
      and (
        p_estimation_min is null
        or t.estimation_points >= p_estimation_min
      )
      and (
        p_estimation_max is null
        or t.estimation_points <= p_estimation_max
      )
      and (
        p_has_due_date is not true
        or t.end_date is not null
      )
      and (
        p_due_date_from is null
        or t.end_date >= p_due_date_from
      )
      and (
        p_due_date_to is null
        or t.end_date <= p_due_date_to
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
  select scoped_tasks.id as task_id, scoped_tasks.list_id, scoped_tasks.total_count
  from scoped_tasks
  cross join normalized n
  order by
    case when n.sort_by = 'name-asc' then lower(scoped_tasks.name) end asc nulls last,
    case when n.sort_by = 'name-desc' then lower(scoped_tasks.name) end desc nulls last,
    case
      when n.sort_by = 'priority-high' then
        case scoped_tasks.priority
          when 'critical' then 0
          when 'high' then 1
          when 'normal' then 2
          when 'low' then 3
          else 4
        end
    end asc nulls last,
    case
      when n.sort_by = 'priority-low' then
        case scoped_tasks.priority
          when 'low' then 0
          when 'normal' then 1
          when 'high' then 2
          when 'critical' then 3
          else 4
        end
    end asc nulls last,
    case when n.sort_by = 'due-date-asc' then scoped_tasks.end_date end asc nulls last,
    case when n.sort_by = 'due-date-desc' then scoped_tasks.end_date end desc nulls first,
    case when n.sort_by = 'created-date-asc' then scoped_tasks.created_at end asc nulls last,
    case when n.sort_by = 'created-date-desc' then scoped_tasks.created_at end desc nulls last,
    case when n.sort_by = 'estimation-low' then scoped_tasks.estimation_points end asc nulls last,
    case when n.sort_by = 'estimation-high' then scoped_tasks.estimation_points end desc nulls last,
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
      when n.sort_by not in ('name-asc', 'due-asc', 'created-asc', 'source-asc')
        and n.source_scope like 'external%'
      then scoped_tasks.created_at
    end desc nulls last,
    case
      when n.sort_by not in (
        'name-asc',
        'name-desc',
        'priority-high',
        'priority-low',
        'due-date-asc',
        'due-date-desc',
        'created-date-desc',
        'created-date-asc',
        'estimation-high',
        'estimation-low',
        'source-asc'
      )
        and n.source_scope not like 'external%'
      then scoped_tasks.sort_key
    end asc nulls last,
    scoped_tasks.created_at desc nulls last,
    scoped_tasks.id
  limit (select page_size from normalized)
  offset (select page_offset from normalized);
$$;

create or replace function private.count_task_source_filter_lists(
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
  p_has_due_date boolean default false,
  p_label_ids uuid[] default null,
  p_assignee_ids uuid[] default null,
  p_project_ids uuid[] default null,
  p_priorities text[] default null,
  p_estimation_min smallint default null,
  p_estimation_max smallint default null,
  p_due_date_from timestamptz default null,
  p_due_date_to timestamptz default null,
  p_include_unassigned boolean default false
)
returns table (
  list_id uuid,
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
      nullif(trim(p_search), '') as search_text
  ),
  target_membership as (
    select 1
    from public.workspace_members wm
    where wm.ws_id = p_workspace_id
      and wm.user_id = p_actor_id
      and wm.type = 'MEMBER'
    limit 1
  ),
  accessible_source_workspaces as (
    select wm.ws_id
    from public.workspace_members wm
    where wm.user_id = p_actor_id
      and wm.type = 'MEMBER'
  ),
  scoped_tasks as (
    select distinct
      t.id,
      t.list_id
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
        p_include_unassigned is not true
        or not exists (
          select 1
          from public.task_assignees ta_unassigned
          where ta_unassigned.task_id = t.id
        )
      )
      and (
        p_assignee_ids is null
        or cardinality(p_assignee_ids) = 0
        or exists (
          select 1
          from public.task_assignees ta_filter
          where ta_filter.task_id = t.id
            and ta_filter.user_id = any(p_assignee_ids)
        )
      )
      and (
        p_label_ids is null
        or cardinality(p_label_ids) = 0
        or exists (
          select 1
          from public.task_labels tl_filter
          where tl_filter.task_id = t.id
            and tl_filter.label_id = any(p_label_ids)
        )
      )
      and (
        p_project_ids is null
        or cardinality(p_project_ids) = 0
        or exists (
          select 1
          from public.task_project_tasks tpt_filter
          where tpt_filter.task_id = t.id
            and tpt_filter.project_id = any(p_project_ids)
        )
      )
      and (
        p_priorities is null
        or cardinality(p_priorities) = 0
        or t.priority::text = any(p_priorities)
      )
      and (
        p_estimation_min is null
        or t.estimation_points >= p_estimation_min
      )
      and (
        p_estimation_max is null
        or t.estimation_points <= p_estimation_max
      )
      and (
        p_has_due_date is not true
        or t.end_date is not null
      )
      and (
        p_due_date_from is null
        or t.end_date >= p_due_date_from
      )
      and (
        p_due_date_to is null
        or t.end_date <= p_due_date_to
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
  select scoped_tasks.list_id, count(*)::bigint as total_count
  from scoped_tasks
  group by scoped_tasks.list_id
  order by scoped_tasks.list_id;
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
  boolean,
  text,
  integer,
  integer,
  uuid[],
  uuid[],
  uuid[],
  text[],
  smallint,
  smallint,
  timestamptz,
  timestamptz,
  boolean
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
  boolean,
  text,
  integer,
  integer,
  uuid[],
  uuid[],
  uuid[],
  text[],
  smallint,
  smallint,
  timestamptz,
  timestamptz,
  boolean
) to service_role;

revoke all on function private.count_task_source_filter_lists(
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
  boolean,
  uuid[],
  uuid[],
  uuid[],
  text[],
  smallint,
  smallint,
  timestamptz,
  timestamptz,
  boolean
) from public, anon, authenticated;

grant execute on function private.count_task_source_filter_lists(
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
  boolean,
  uuid[],
  uuid[],
  uuid[],
  text[],
  smallint,
  smallint,
  timestamptz,
  timestamptz,
  boolean
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
  boolean,
  text,
  integer,
  integer,
  uuid[],
  uuid[],
  uuid[],
  text[],
  smallint,
  smallint,
  timestamptz,
  timestamptz,
  boolean
) is
  'Server-only task board filter helper for Tuturuuu API routes. It applies case-insensitive search and task filters in SQL before returning paginated task ids for API-side hydration.';

comment on function private.count_task_source_filter_lists(
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
  boolean,
  uuid[],
  uuid[],
  uuid[],
  text[],
  smallint,
  smallint,
  timestamptz,
  timestamptz,
  boolean
) is
  'Server-only task board filter helper for Tuturuuu API routes. It returns per-list filtered task counts so clients can hide empty filtered lists without client-side filtering.';

notify pgrst, 'reload schema';
