-- Allow explicit personal-board placements for tasks that come from another
-- board in the same personal workspace while keeping native same-board personal
-- tasks on the normal task move route.

create or replace function public.upsert_personal_task_placement(
  p_task_id uuid,
  p_user_id uuid,
  p_personal_board_id uuid,
  p_personal_list_id uuid default null,
  p_personal_sort_key double precision default null,
  p_previous_task_id uuid default null,
  p_next_task_id uuid default null
)
returns table (
  personal_board_id uuid,
  personal_list_id uuid,
  personal_sort_key double precision,
  personal_added_at timestamptz,
  personal_placed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_personal_added_at timestamptz;
  v_personal_sort_key double precision;
  v_source_board_id uuid;
  v_source_ws_id uuid;
  v_source_workspace_personal boolean;
  v_target_ws_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and p_user_id is distinct from auth.uid()
  then
    raise exception 'Cannot manage personal task placement for another user';
  end if;

  select wb.id, wb.ws_id, coalesce(w.personal, false)
  into v_source_board_id, v_source_ws_id, v_source_workspace_personal
  from public.tasks t
  inner join public.task_lists tl on tl.id = t.list_id
  inner join public.workspace_boards wb on wb.id = tl.board_id
  inner join public.workspaces w on w.id = wb.ws_id
  where t.id = p_task_id
    and t.deleted_at is null
    and coalesce(tl.deleted, false) = false
    and wb.deleted_at is null
    and wb.archived_at is null
  limit 1;

  if v_source_ws_id is null then
    raise exception 'Task not found or inaccessible';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = v_source_ws_id
        and wm.user_id = p_user_id
        and wm.type = 'MEMBER'
    )
  then
    raise exception 'Task not found or inaccessible';
  end if;

  if not public.is_valid_personal_task_placement(
    p_user_id,
    p_personal_board_id,
    p_personal_list_id
  ) then
    raise exception 'Invalid personal task placement';
  end if;

  if p_personal_board_id is not null then
    select wb.ws_id
    into v_target_ws_id
    from public.workspace_boards wb
    where wb.id = p_personal_board_id
    limit 1;

    if v_target_ws_id is null then
      raise exception 'Invalid personal task placement';
    end if;

    if not (
      (
        not v_source_workspace_personal
        and v_source_ws_id <> v_target_ws_id
      )
      or (
        v_source_workspace_personal
        and v_source_ws_id = v_target_ws_id
        and v_source_board_id <> p_personal_board_id
      )
    ) then
      raise exception 'Only external workspace tasks or board-external personal tasks can be placed on a personal board';
    end if;
  end if;

  select tuo.personal_added_at
  into v_personal_added_at
  from public.task_user_overrides tuo
  where tuo.task_id = p_task_id
    and tuo.user_id = p_user_id;

  v_personal_added_at := coalesce(v_personal_added_at, v_now);
  v_personal_sort_key := public.calculate_personal_task_placement_sort_key(
    p_user_id,
    p_personal_board_id,
    p_personal_list_id,
    p_previous_task_id,
    p_next_task_id,
    p_personal_sort_key
  );

  return query
  insert into public.task_user_overrides (
    task_id,
    user_id,
    personal_board_id,
    personal_list_id,
    personal_sort_key,
    personal_added_at,
    personal_placed_at
  )
  values (
    p_task_id,
    p_user_id,
    p_personal_board_id,
    p_personal_list_id,
    case when p_personal_list_id is null then null else v_personal_sort_key end,
    v_personal_added_at,
    case when p_personal_list_id is null then null else v_now end
  )
  on conflict (task_id, user_id)
  do update set
    personal_board_id = excluded.personal_board_id,
    personal_list_id = excluded.personal_list_id,
    personal_sort_key = excluded.personal_sort_key,
    personal_added_at = coalesce(
      public.task_user_overrides.personal_added_at,
      excluded.personal_added_at
    ),
    personal_placed_at = excluded.personal_placed_at
  returning
    public.task_user_overrides.personal_board_id,
    public.task_user_overrides.personal_list_id,
    public.task_user_overrides.personal_sort_key,
    public.task_user_overrides.personal_added_at,
    public.task_user_overrides.personal_placed_at;
end;
$$;

revoke execute on function public.upsert_personal_task_placement(
  uuid, uuid, uuid, uuid, double precision, uuid, uuid
) from public;

grant execute on function public.upsert_personal_task_placement(
  uuid, uuid, uuid, uuid, double precision, uuid, uuid
) to authenticated, service_role;

create or replace function public.get_personal_task_board_external_counts(
  p_personal_board_id uuid,
  p_include_documents boolean default false,
  p_include_done_closed boolean default false
)
returns table (
  list_id text,
  task_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_personal_ws_id uuid;
  v_staging_list_id text :=
    'personal-external-staging:' || p_personal_board_id::text;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select wb.ws_id
  into v_personal_ws_id
  from public.workspace_boards wb
  join public.workspaces w on w.id = wb.ws_id
  join public.workspace_members wm
    on wm.ws_id = wb.ws_id
    and wm.user_id = v_user_id
  where wb.id = p_personal_board_id
    and wb.deleted_at is null
    and wb.archived_at is null
    and w.personal is true
  limit 1;

  if v_personal_ws_id is null then
    raise exception 'Personal board not found';
  end if;

  return query
  with accessible_placement_tasks as (
    select
      t.id,
      t.completed_at,
      t.closed_at,
      source_tl.status,
      source_wb.id as source_board_id,
      source_wb.ws_id as source_ws_id
    from public.tasks t
    join public.task_lists source_tl on source_tl.id = t.list_id
    join public.workspace_boards source_wb on source_wb.id = source_tl.board_id
    join public.workspace_members source_wm
      on source_wm.ws_id = source_wb.ws_id
      and source_wm.user_id = v_user_id
      and source_wm.type = 'MEMBER'
    where t.deleted_at is null
      and coalesce(source_tl.deleted, false) is false
      and source_wb.deleted_at is null
      and source_wb.archived_at is null
      and (
        source_wb.ws_id <> v_personal_ws_id
        or source_wb.id <> p_personal_board_id
      )
  ),
  accessible_default_external_tasks as (
    select *
    from accessible_placement_tasks
    where source_ws_id <> v_personal_ws_id
  ),
  board_placements as (
    select
      tuo.task_id,
      tuo.personal_list_id
    from public.task_user_overrides tuo
    where tuo.user_id = v_user_id
      and tuo.personal_board_id = p_personal_board_id
  ),
  placed_external_counts as (
    select
      bp.personal_list_id::text as list_id,
      count(distinct bp.task_id)::bigint as task_count
    from board_placements bp
    join accessible_placement_tasks apt on apt.id = bp.task_id
    where bp.personal_list_id is not null
    group by bp.personal_list_id
  ),
  staged_external_tasks as (
    select bp.task_id
    from board_placements bp
    join accessible_placement_tasks apt on apt.id = bp.task_id
    where bp.personal_list_id is null
      and (
        apt.status in ('not_started', 'active')
        or (p_include_documents and apt.status = 'documents')
        or (p_include_done_closed and apt.status in ('done', 'closed'))
      )
      and (
        p_include_done_closed
        or (
          apt.completed_at is null
          and apt.closed_at is null
          and coalesce(apt.status::text, '') not in ('done', 'closed')
        )
      )
  ),
  default_external_tasks as (
    select adet.id as task_id
    from accessible_default_external_tasks adet
    join public.task_assignees ta
      on ta.task_id = adet.id
      and ta.user_id = v_user_id
    where not exists (
      select 1
      from board_placements bp
      where bp.task_id = adet.id
        and bp.personal_list_id is not null
    )
      and (
        adet.status in ('not_started', 'active')
        or (p_include_documents and adet.status = 'documents')
        or (p_include_done_closed and adet.status in ('done', 'closed'))
      )
      and (
        p_include_done_closed
        or (
          adet.completed_at is null
          and adet.closed_at is null
          and coalesce(adet.status::text, '') not in ('done', 'closed')
        )
      )
  ),
  external_staging_count as (
    select
      v_staging_list_id as list_id,
      count(distinct task_id)::bigint as task_count
    from (
      select task_id from staged_external_tasks
      union
      select task_id from default_external_tasks
    ) external_staging_tasks
  )
  select placed_external_counts.list_id, placed_external_counts.task_count
  from placed_external_counts
  union all
  select external_staging_count.list_id, external_staging_count.task_count
  from external_staging_count;
end;
$$;

revoke execute on function public.get_personal_task_board_external_counts(
  uuid, boolean, boolean
) from public;

grant execute on function public.get_personal_task_board_external_counts(
  uuid, boolean, boolean
) to authenticated;
