-- Count external source-task references on personal boards through the same
-- access-aware rules used to load personal-board external tasks.

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
  with accessible_external_tasks as (
    select
      t.id,
      t.completed_at,
      t.closed_at,
      source_tl.status
    from public.tasks t
    join public.task_lists source_tl on source_tl.id = t.list_id
    join public.workspace_boards source_wb on source_wb.id = source_tl.board_id
    join public.workspace_members source_wm
      on source_wm.ws_id = source_wb.ws_id
      and source_wm.user_id = v_user_id
    where t.deleted_at is null
      and coalesce(source_tl.deleted, false) is false
      and source_wb.deleted_at is null
      and source_wb.archived_at is null
      and source_wb.ws_id <> v_personal_ws_id
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
    join accessible_external_tasks aet on aet.id = bp.task_id
    where bp.personal_list_id is not null
    group by bp.personal_list_id
  ),
  staged_external_tasks as (
    select bp.task_id
    from board_placements bp
    join accessible_external_tasks aet on aet.id = bp.task_id
    where bp.personal_list_id is null
      and (
        aet.status in ('not_started', 'active')
        or (p_include_documents and aet.status = 'documents')
        or (p_include_done_closed and aet.status in ('done', 'closed'))
      )
      and (
        p_include_done_closed
        or (
          aet.completed_at is null
          and aet.closed_at is null
          and coalesce(aet.status::text, '') not in ('done', 'closed')
        )
      )
  ),
  default_external_tasks as (
    select aet.id as task_id
    from accessible_external_tasks aet
    join public.task_assignees ta
      on ta.task_id = aet.id
      and ta.user_id = v_user_id
    where not exists (
      select 1
      from board_placements bp
      where bp.task_id = aet.id
        and bp.personal_list_id is not null
    )
      and (
        aet.status in ('not_started', 'active')
        or (p_include_documents and aet.status = 'documents')
        or (p_include_done_closed and aet.status in ('done', 'closed'))
      )
      and (
        p_include_done_closed
        or (
          aet.completed_at is null
          and aet.closed_at is null
          and coalesce(aet.status::text, '') not in ('done', 'closed')
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
