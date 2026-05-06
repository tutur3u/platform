-- Add per-user placement for external tasks staged onto personal boards.
-- personal_list_id = NULL means the external task is in the virtual staging lane.

alter table public.task_user_overrides
  add column if not exists personal_board_id uuid null references public.workspace_boards (id) on delete cascade,
  add column if not exists personal_list_id uuid null references public.task_lists (id) on delete set null,
  add column if not exists personal_sort_key double precision null,
  add column if not exists personal_added_at timestamptz null,
  add column if not exists personal_placed_at timestamptz null;

alter table public.task_user_overrides
  drop constraint if exists chk_task_user_overrides_personal_list_requires_board;

alter table public.task_user_overrides
  add constraint chk_task_user_overrides_personal_list_requires_board
  check (personal_board_id is not null or personal_list_id is null);

create index if not exists idx_task_user_overrides_personal_board
  on public.task_user_overrides (user_id, personal_board_id)
  where personal_board_id is not null;

create index if not exists idx_task_user_overrides_personal_list
  on public.task_user_overrides (user_id, personal_list_id)
  where personal_list_id is not null;

create index if not exists idx_task_user_overrides_personal_staging
  on public.task_user_overrides (user_id, personal_board_id, personal_sort_key)
  where personal_board_id is not null and personal_list_id is null;

create or replace function public.is_valid_personal_task_placement(
  p_user_id uuid,
  p_personal_board_id uuid,
  p_personal_list_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_personal_board_id is null then p_personal_list_id is null
      when p_personal_list_id is null then exists (
        select 1
        from public.workspace_boards wb
        inner join public.workspaces w on w.id = wb.ws_id
        inner join public.workspace_members wm on wm.ws_id = w.id
        where wb.id = p_personal_board_id
          and wb.deleted_at is null
          and wb.archived_at is null
          and w.personal = true
          and wm.user_id = p_user_id
      )
      else exists (
        select 1
        from public.task_lists tl
        inner join public.workspace_boards wb on wb.id = tl.board_id
        inner join public.workspaces w on w.id = wb.ws_id
        inner join public.workspace_members wm on wm.ws_id = w.id
        where tl.id = p_personal_list_id
          and tl.board_id = p_personal_board_id
          and tl.deleted = false
          and wb.deleted_at is null
          and wb.archived_at is null
          and w.personal = true
          and wm.user_id = p_user_id
      )
    end;
$$;

grant execute on function public.is_valid_personal_task_placement(uuid, uuid, uuid)
  to authenticated;

drop policy if exists "insert_own_task_user_overrides"
  on public.task_user_overrides;
create policy "insert_own_task_user_overrides"
  on public.task_user_overrides
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_valid_personal_task_placement(
      user_id,
      personal_board_id,
      personal_list_id
    )
  );

drop policy if exists "update_own_task_user_overrides"
  on public.task_user_overrides;
create policy "update_own_task_user_overrides"
  on public.task_user_overrides
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.is_valid_personal_task_placement(
      user_id,
      personal_board_id,
      personal_list_id
    )
  );

drop function if exists public.get_user_tasks_with_relations(
  uuid, uuid, boolean, public.task_board_status[], boolean, boolean,
  uuid[], uuid[], uuid[], uuid[], boolean
);

create or replace function public.get_user_tasks_with_relations(
  p_user_id uuid,
  p_ws_id uuid default null,
  p_include_deleted boolean default false,
  p_list_statuses public.task_board_status[] default array['not_started', 'active']::public.task_board_status[],
  p_exclude_personally_completed boolean default false,
  p_exclude_personally_unassigned boolean default false,
  p_filter_ws_ids uuid[] default null,
  p_filter_board_ids uuid[] default null,
  p_filter_label_ids uuid[] default null,
  p_filter_project_ids uuid[] default null,
  p_filter_self_managed_only boolean default false
)
returns table (
  task_id uuid,
  task_name text,
  task_description text,
  task_creator_id uuid,
  task_list_id uuid,
  task_start_date timestamptz,
  task_end_date timestamptz,
  task_priority public.task_priority,
  task_completed_at timestamptz,
  task_closed_at timestamptz,
  task_deleted_at timestamptz,
  task_estimation_points smallint,
  task_created_at timestamptz,
  sched_total_duration real,
  sched_is_splittable boolean,
  sched_min_split_duration_minutes real,
  sched_max_split_duration_minutes real,
  sched_calendar_hours text,
  sched_auto_schedule boolean,
  override_self_managed boolean,
  override_completed_at timestamptz,
  override_priority_override public.task_priority,
  override_due_date_override timestamptz,
  override_estimation_override smallint,
  override_personally_unassigned boolean,
  override_notes text,
  override_personal_board_id uuid,
  override_personal_list_id uuid,
  override_personal_sort_key double precision,
  override_personal_added_at timestamptz,
  override_personal_placed_at timestamptz,
  list_data jsonb,
  assignees_data jsonb,
  labels_data jsonb,
  projects_data jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_personal_ws_id uuid;
  v_is_personal boolean;
begin
  if p_ws_id is null then
    select w.id into v_personal_ws_id
    from public.workspaces w
    inner join public.workspace_members wm on wm.ws_id = w.id
    where w.personal = true
      and wm.user_id = p_user_id
    limit 1;
  else
    v_personal_ws_id := p_ws_id;
  end if;

  select w.personal into v_is_personal
  from public.workspaces w
  where w.id = v_personal_ws_id;

  return query
  select
    t.id as task_id,
    t.name as task_name,
    t.description as task_description,
    t.creator_id as task_creator_id,
    t.list_id as task_list_id,
    t.start_date as task_start_date,
    t.end_date as task_end_date,
    t.priority as task_priority,
    t.completed_at as task_completed_at,
    t.closed_at as task_closed_at,
    t.deleted_at as task_deleted_at,
    t.estimation_points as task_estimation_points,
    t.created_at as task_created_at,
    tuss.total_duration as sched_total_duration,
    tuss.is_splittable as sched_is_splittable,
    tuss.min_split_duration_minutes as sched_min_split_duration_minutes,
    tuss.max_split_duration_minutes as sched_max_split_duration_minutes,
    tuss.calendar_hours::text as sched_calendar_hours,
    tuss.auto_schedule as sched_auto_schedule,
    tuo.self_managed as override_self_managed,
    tuo.completed_at as override_completed_at,
    tuo.priority_override as override_priority_override,
    tuo.due_date_override as override_due_date_override,
    tuo.estimation_override as override_estimation_override,
    tuo.personally_unassigned as override_personally_unassigned,
    tuo.notes as override_notes,
    tuo.personal_board_id as override_personal_board_id,
    tuo.personal_list_id as override_personal_list_id,
    tuo.personal_sort_key as override_personal_sort_key,
    tuo.personal_added_at as override_personal_added_at,
    tuo.personal_placed_at as override_personal_placed_at,
    (
      select jsonb_build_object(
        'id', tl.id,
        'name', tl.name,
        'status', tl.status,
        'board', jsonb_build_object(
          'id', wb.id,
          'name', wb.name,
          'ws_id', wb.ws_id,
          'estimation_type', wb.estimation_type,
          'extended_estimation', wb.extended_estimation,
          'allow_zero_estimates', wb.allow_zero_estimates,
          'workspaces', jsonb_build_object(
            'id', ws.id,
            'name', ws.name,
            'personal', ws.personal
          )
        )
      )
      from public.task_lists tl
      inner join public.workspace_boards wb on wb.id = tl.board_id
      inner join public.workspaces ws on ws.id = wb.ws_id
      where tl.id = t.list_id
    ) as list_data,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user', jsonb_build_object(
              'id', u.id,
              'display_name', u.display_name,
              'avatar_url', u.avatar_url
            )
          )
        )
        from public.task_assignees ta_sub
        inner join public.users u on u.id = ta_sub.user_id
        where ta_sub.task_id = t.id
      ),
      '[]'::jsonb
    ) as assignees_data,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'label', jsonb_build_object(
              'id', wtl.id,
              'name', wtl.name,
              'color', wtl.color,
              'created_at', wtl.created_at
            )
          )
        )
        from public.task_labels tl_sub
        inner join public.workspace_task_labels wtl on wtl.id = tl_sub.label_id
        where tl_sub.task_id = t.id
      ),
      '[]'::jsonb
    ) as labels_data,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'project', jsonb_build_object(
              'id', tp.id,
              'name', tp.name,
              'description', tp.description,
              'ws_id', tp.ws_id,
              'creator_id', tp.creator_id,
              'created_at', tp.created_at,
              'updated_at', tp.updated_at,
              'archived', tp.archived,
              'deleted', tp.deleted,
              'status', tp.status
            )
          )
        )
        from public.task_project_tasks tpt
        inner join public.task_projects tp on tp.id = tpt.project_id
        where tpt.task_id = t.id
      ),
      '[]'::jsonb
    ) as projects_data
  from public.tasks t
  inner join public.task_lists tl_filter on tl_filter.id = t.list_id
  inner join public.workspace_boards wb_filter on wb_filter.id = tl_filter.board_id
  left join public.task_user_scheduling_settings tuss
    on tuss.task_id = t.id and tuss.user_id = p_user_id
  left join public.task_user_overrides tuo
    on tuo.task_id = t.id and tuo.user_id = p_user_id
  where
    case
      when v_is_personal then
        (
          exists (
            select 1 from public.task_assignees ta
            where ta.task_id = t.id and ta.user_id = p_user_id
          )
          or wb_filter.ws_id = v_personal_ws_id
          or (
            tuo.personal_board_id is not null
            and exists (
              select 1
              from public.workspace_members wm_source
              where wm_source.ws_id = wb_filter.ws_id
                and wm_source.user_id = p_user_id
            )
          )
        )
      else
        (
          exists (
            select 1 from public.task_assignees ta
            where ta.task_id = t.id and ta.user_id = p_user_id
          )
          and wb_filter.ws_id = v_personal_ws_id
        )
    end
    and (p_include_deleted or t.deleted_at is null)
    and (p_list_statuses is null or tl_filter.status = any(p_list_statuses))
    and wb_filter.deleted_at is null
    and wb_filter.archived_at is null
    and (
      not p_exclude_personally_completed
      or tuo.completed_at is null
    )
    and (
      not p_exclude_personally_unassigned
      or coalesce(tuo.personally_unassigned, false) = false
    )
    and (p_filter_ws_ids is null or wb_filter.ws_id = any(p_filter_ws_ids))
    and (p_filter_board_ids is null or wb_filter.id = any(p_filter_board_ids))
    and (
      p_filter_label_ids is null or exists (
        select 1 from public.task_labels tl_f
        where tl_f.task_id = t.id and tl_f.label_id = any(p_filter_label_ids)
      )
    )
    and (
      p_filter_project_ids is null or exists (
        select 1 from public.task_project_tasks tpt_f
        where tpt_f.task_id = t.id and tpt_f.project_id = any(p_filter_project_ids)
      )
    )
    and (
      not p_filter_self_managed_only
      or coalesce(tuo.self_managed, false) = true
    );
end;
$$;

grant execute on function public.get_user_tasks_with_relations(
  uuid, uuid, boolean, public.task_board_status[], boolean, boolean,
  uuid[], uuid[], uuid[], uuid[], boolean
) to authenticated;

comment on function public.get_user_tasks_with_relations is
  'Consolidated RPC that returns tasks with all relations, scheduling, personal overrides, '
  'personal-board placements, list/board metadata, assignees, labels, and projects. '
  'Supports server-side filtering by workspace, board, label, project, and self-managed status.';
