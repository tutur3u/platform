-- Preserve signatures and supported callers while tightening admission.

CREATE OR REPLACE FUNCTION public.get_user_accessible_tasks(p_user_id uuid, p_ws_id uuid DEFAULT NULL::uuid, p_include_deleted boolean DEFAULT false, p_list_statuses public.task_board_status[] DEFAULT ARRAY['not_started'::public.task_board_status, 'active'::public.task_board_status], p_exclude_personally_completed boolean DEFAULT false, p_exclude_personally_unassigned boolean DEFAULT false)
 RETURNS TABLE(task_id uuid, task_name text, task_description text, task_creator_id uuid, task_list_id uuid, task_start_date timestamp with time zone, task_end_date timestamp with time zone, task_priority public.task_priority, task_completed_at timestamp with time zone, task_closed_at timestamp with time zone, task_deleted_at timestamp with time zone, task_estimation_points smallint, task_created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_personal_ws_id UUID;
  v_is_personal BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Caller must match task user' USING ERRCODE = '42501';
  END IF;
  -- Get user's personal workspace if not specified
  IF p_ws_id IS NULL THEN
    SELECT w.id INTO v_personal_ws_id
    FROM public.workspaces w
    INNER JOIN public.workspace_members wm ON wm.ws_id = w.id
    WHERE w.personal = TRUE
      AND wm.user_id = p_user_id
    LIMIT 1;
  ELSE
    v_personal_ws_id := p_ws_id;
  END IF;

  -- Check if the specified workspace is personal
  SELECT w.personal INTO v_is_personal
  FROM public.workspaces w
  WHERE w.id = v_personal_ws_id;

  IF v_is_personal AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.ws_id = v_personal_ws_id AND wm.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Personal workspace access denied' USING ERRCODE = '42501';
  END IF;


  -- If workspace is personal, return tasks assigned to user + tasks in personal workspace boards
  IF v_is_personal THEN
    RETURN QUERY
    SELECT DISTINCT
      t.id,
      t.name,
      t.description,
      t.creator_id,
      t.list_id,
      t.start_date,
      t.end_date,
      t.priority,
      t.completed_at,
      t.closed_at,
      t.deleted_at,
      t.estimation_points,
      t.created_at
    FROM public.tasks t
    INNER JOIN public.task_lists tl ON tl.id = t.list_id
    INNER JOIN public.workspace_boards wb ON wb.id = tl.board_id
    WHERE (
      -- Tasks assigned to the user (across all workspaces)
      EXISTS (
        SELECT 1 FROM public.task_assignees ta
        WHERE ta.task_id = t.id AND ta.user_id = p_user_id
      )
      -- OR tasks in personal workspace boards
      OR wb.ws_id = v_personal_ws_id
    )
    AND (p_include_deleted OR t.deleted_at IS NULL)
    AND (p_list_statuses IS NULL OR tl.status = ANY(p_list_statuses))
    AND wb.deleted_at IS NULL
    AND wb.archived_at IS NULL
    -- Exclude personally completed tasks
    AND (
      NOT p_exclude_personally_completed
      OR NOT EXISTS (
        SELECT 1 FROM public.task_user_overrides tuo
        WHERE tuo.task_id = t.id
          AND tuo.user_id = p_user_id
          AND tuo.completed_at IS NOT NULL
      )
    )
    -- Exclude personally unassigned tasks
    AND (
      NOT p_exclude_personally_unassigned
      OR NOT EXISTS (
        SELECT 1 FROM public.task_user_overrides tuo
        WHERE tuo.task_id = t.id
          AND tuo.user_id = p_user_id
          AND tuo.personally_unassigned = TRUE
      )
    );
  ELSE
    -- If workspace is not personal, only return tasks from that workspace assigned to user
    RETURN QUERY
    SELECT DISTINCT
      t.id,
      t.name,
      t.description,
      t.creator_id,
      t.list_id,
      t.start_date,
      t.end_date,
      t.priority,
      t.completed_at,
      t.closed_at,
      t.deleted_at,
      t.estimation_points,
      t.created_at
    FROM public.tasks t
    INNER JOIN public.task_lists tl ON tl.id = t.list_id
    INNER JOIN public.workspace_boards wb ON wb.id = tl.board_id
    INNER JOIN public.task_assignees ta ON ta.task_id = t.id
    WHERE ta.user_id = p_user_id
      AND wb.ws_id = v_personal_ws_id
      AND (p_include_deleted OR t.deleted_at IS NULL)
      AND (p_list_statuses IS NULL OR tl.status = ANY(p_list_statuses))
      AND wb.deleted_at IS NULL
      AND wb.archived_at IS NULL
      -- Exclude personally completed tasks
      AND (
        NOT p_exclude_personally_completed
        OR NOT EXISTS (
          SELECT 1 FROM public.task_user_overrides tuo
          WHERE tuo.task_id = t.id
            AND tuo.user_id = p_user_id
            AND tuo.completed_at IS NOT NULL
        )
      )
      -- Exclude personally unassigned tasks
      AND (
        NOT p_exclude_personally_unassigned
        OR NOT EXISTS (
          SELECT 1 FROM public.task_user_overrides tuo
          WHERE tuo.task_id = t.id
            AND tuo.user_id = p_user_id
            AND tuo.personally_unassigned = TRUE
        )
      );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_tasks_with_relations(p_user_id uuid, p_ws_id uuid DEFAULT NULL::uuid, p_include_deleted boolean DEFAULT false, p_list_statuses public.task_board_status[] DEFAULT ARRAY['not_started'::public.task_board_status, 'active'::public.task_board_status], p_exclude_personally_completed boolean DEFAULT false, p_exclude_personally_unassigned boolean DEFAULT false, p_filter_ws_ids uuid[] DEFAULT NULL::uuid[], p_filter_board_ids uuid[] DEFAULT NULL::uuid[], p_filter_label_ids uuid[] DEFAULT NULL::uuid[], p_filter_project_ids uuid[] DEFAULT NULL::uuid[], p_filter_self_managed_only boolean DEFAULT false)
 RETURNS TABLE(task_id uuid, task_name text, task_description text, task_creator_id uuid, task_list_id uuid, task_start_date timestamp with time zone, task_end_date timestamp with time zone, task_priority public.task_priority, task_completed_at timestamp with time zone, task_closed_at timestamp with time zone, task_deleted_at timestamp with time zone, task_estimation_points smallint, task_created_at timestamp with time zone, sched_total_duration real, sched_is_splittable boolean, sched_min_split_duration_minutes real, sched_max_split_duration_minutes real, sched_calendar_hours text, sched_auto_schedule boolean, override_self_managed boolean, override_completed_at timestamp with time zone, override_priority_override public.task_priority, override_due_date_override timestamp with time zone, override_estimation_override smallint, override_personally_unassigned boolean, override_notes text, override_personal_board_id uuid, override_personal_list_id uuid, override_personal_sort_key double precision, override_personal_added_at timestamp with time zone, override_personal_placed_at timestamp with time zone, list_data jsonb, assignees_data jsonb, labels_data jsonb, projects_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
declare
  v_personal_ws_id uuid;
  v_is_personal boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Caller must match task user' USING ERRCODE = '42501';
  END IF;
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

  IF v_is_personal AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.ws_id = v_personal_ws_id AND wm.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Personal workspace access denied' USING ERRCODE = '42501';
  END IF;


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
$function$;

REVOKE ALL ON FUNCTION public.get_user_accessible_tasks(uuid,uuid,boolean,public.task_board_status[],boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_accessible_tasks(uuid,uuid,boolean,public.task_board_status[],boolean,boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_tasks_with_relations(uuid,uuid,boolean,public.task_board_status[],boolean,boolean,uuid[],uuid[],uuid[],uuid[],boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tasks_with_relations(uuid,uuid,boolean,public.task_board_status[],boolean,boolean,uuid[],uuid[],uuid[],uuid[],boolean) TO authenticated, service_role;
