import type { TaskUserOverride, UserBoardListOverride } from '@tuturuuu/types';
import {
  isPersonallyHidden,
  resolveEffectiveValues,
} from '@tuturuuu/utils/task-overrides';
import { type NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/api-auth';

interface TaskAssignee {
  task_id: string;
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface TaskLabel {
  task_id: string;
  label: {
    id: string;
    name: string;
    color: string;
    created_at: string;
  } | null;
}

export async function GET(req: NextRequest) {
  try {
    const { data: authData, error: authError } = await authorizeRequest(req);
    if (authError || !authData)
      return (
        authError ||
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

    const { user, supabase } = authData;
    const url = new URL(req.url);
    const wsId = url.searchParams.get('wsId');
    const isPersonal = url.searchParams.get('isPersonal') === 'true';

    // Fetch all accessible tasks using the RPC function
    const { data: rpcTasks, error: tasksError } = await supabase.rpc(
      'get_user_accessible_tasks',
      {
        p_user_id: user.id,
        p_ws_id: isPersonal ? undefined : (wsId ?? undefined),
        p_include_deleted: false,
        p_list_statuses: ['not_started', 'active', 'done'],
        p_exclude_personally_completed: false,
        p_exclude_personally_unassigned: false,
      }
    );

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      return NextResponse.json(
        { error: 'Failed to fetch tasks' },
        { status: 500 }
      );
    }

    // Map RPC results to expected structure
    const allTasks =
      rpcTasks?.map((task) => ({
        id: task.task_id,
        name: task.task_name,
        description: task.task_description,
        creator_id: task.task_creator_id,
        list_id: task.task_list_id,
        start_date: task.task_start_date,
        end_date: task.task_end_date,
        priority: task.task_priority,
        completed_at: task.task_completed_at,
        closed_at: task.task_closed_at,
        deleted_at: task.task_deleted_at,
        estimation_points: task.task_estimation_points,
        created_at: task.task_created_at,
      })) ?? [];

    const taskIds = allTasks.map((t) => t.id);
    if (taskIds.length === 0) {
      return NextResponse.json({
        overdue: [],
        today: [],
        upcoming: [],
        totalActiveTasks: 0,
      });
    }

    // Fetch scheduling settings, overrides, board/list overrides, relations in parallel
    const schedulingByTaskId = new Map<
      string,
      {
        total_duration: number | null;
        is_splittable: boolean | null;
        min_split_duration_minutes: number | null;
        max_split_duration_minutes: number | null;
        calendar_hours: string | null;
        auto_schedule: boolean | null;
      }
    >();
    const overridesByTaskId = new Map<string, TaskUserOverride>();

    const [
      schedulingResult,
      overridesResult,
      boardListOverridesResult,
      assigneesResult,
      labelsResult,
      projectsResult,
    ] = await Promise.all([
      supabase
        .from('task_user_scheduling_settings')
        .select(
          'task_id, total_duration, is_splittable, min_split_duration_minutes, max_split_duration_minutes, calendar_hours, auto_schedule'
        )
        .eq('user_id', user.id)
        .in('task_id', taskIds),
      supabase
        .from('task_user_overrides')
        .select('*')
        .eq('user_id', user.id)
        .in('task_id', taskIds),
      supabase
        .from('user_board_list_overrides')
        .select('*')
        .eq('user_id', user.id),
      supabase
        .from('task_assignees')
        .select('task_id, user:users(id, display_name, avatar_url)')
        .in('task_id', taskIds),
      supabase
        .from('task_labels')
        .select(
          'task_id, label:workspace_task_labels(id, name, color, created_at)'
        )
        .in('task_id', taskIds),
      supabase
        .from('task_project_tasks')
        .select('task_id, project:task_projects(*)')
        .in('task_id', taskIds),
    ]);

    // Build scheduling map
    schedulingResult.data?.forEach((r) => {
      if (!r?.task_id) return;
      schedulingByTaskId.set(r.task_id, {
        total_duration: r.total_duration ?? null,
        is_splittable: r.is_splittable ?? null,
        min_split_duration_minutes: r.min_split_duration_minutes ?? null,
        max_split_duration_minutes: r.max_split_duration_minutes ?? null,
        calendar_hours: r.calendar_hours ?? null,
        auto_schedule: r.auto_schedule ?? null,
      });
    });

    // Build overrides map
    (overridesResult.data as TaskUserOverride[] | null)?.forEach((r) => {
      if (!r?.task_id) return;
      overridesByTaskId.set(r.task_id, r);
    });

    const boardListOverrides: UserBoardListOverride[] =
      (boardListOverridesResult.data as UserBoardListOverride[] | null) ?? [];

    // Build relation maps
    const assigneesByTaskId = new Map<
      string,
      { user: TaskAssignee['user'] }[]
    >();
    (assigneesResult.data as TaskAssignee[] | null)?.forEach((a) => {
      if (!assigneesByTaskId.has(a.task_id))
        assigneesByTaskId.set(a.task_id, []);
      assigneesByTaskId.get(a.task_id)!.push({ user: a.user });
    });

    const labelsByTaskId = new Map<string, { label: TaskLabel['label'] }[]>();
    (labelsResult.data as TaskLabel[] | null)?.forEach((l) => {
      if (!labelsByTaskId.has(l.task_id)) labelsByTaskId.set(l.task_id, []);
      labelsByTaskId.get(l.task_id)!.push({ label: l.label });
    });

    const projectsByTaskId = new Map<string, { project: any }[]>();
    projectsResult.data?.forEach((p) => {
      if (!projectsByTaskId.has(p.task_id)) projectsByTaskId.set(p.task_id, []);
      projectsByTaskId.get(p.task_id)!.push({ project: p.project });
    });

    // Fetch list and board data
    const listIds = allTasks.map((t) => t.list_id).filter(Boolean);
    const { data: listsData } = await supabase
      .from('task_lists')
      .select(
        `
        id, name, status,
        board:workspace_boards!inner(
          id, name, ws_id, estimation_type, extended_estimation, allow_zero_estimates,
          workspaces(id, name, personal)
        )
      `
      )
      .in('id', listIds);

    // Build tasks with relations and apply overrides
    const allTasksWithRelations = allTasks.map((task) => {
      const override = overridesByTaskId.get(task.id) ?? null;
      const baseTask = {
        ...task,
        ...(schedulingByTaskId.get(task.id) ?? {}),
        list: listsData?.find((l) => l.id === task.list_id) || null,
        assignees: assigneesByTaskId.get(task.id) || [],
        labels: labelsByTaskId.get(task.id) || [],
        projects: projectsByTaskId.get(task.id) || [],
        overrides: override,
      };
      return resolveEffectiveValues(baseTask, override);
    });

    // Separate active tasks from personally hidden ones
    const tasksWithRelations: typeof allTasksWithRelations = [];
    const personallyHiddenTasks: typeof allTasksWithRelations = [];

    for (const task of allTasksWithRelations) {
      const override = overridesByTaskId.get(task.id) ?? null;
      if (isPersonallyHidden(task, override, boardListOverrides)) {
        personallyHiddenTasks.push(task);
      } else {
        tasksWithRelations.push(task);
      }
    }

    // Categorize tasks
    const now = new Date().toISOString();
    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const todayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekEnd = new Date(
      nextWeek.setHours(23, 59, 59, 999)
    ).toISOString();

    const overdue = tasksWithRelations
      .filter(
        (task) =>
          task.end_date &&
          task.end_date < now &&
          task.list?.status &&
          ['not_started', 'active'].includes(task.list.status)
      )
      .sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1));

    const todayTasks = tasksWithRelations
      .filter(
        (task) =>
          task.end_date &&
          task.end_date >= todayStart &&
          task.end_date <= todayEnd &&
          task.end_date >= now &&
          task.list?.status &&
          ['not_started', 'active'].includes(task.list.status)
      )
      .sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1));

    const upcomingWithDate = tasksWithRelations
      .filter(
        (task) =>
          task.end_date &&
          task.end_date > todayEnd &&
          task.end_date <= nextWeekEnd &&
          task.list?.status &&
          ['not_started', 'active'].includes(task.list.status)
      )
      .sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1));

    const priorityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      normal: 2,
      low: 1,
    };

    const noDueDate = tasksWithRelations
      .filter(
        (task) =>
          !task.end_date &&
          task.list?.status &&
          ['not_started', 'active'].includes(task.list.status)
      )
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return (
            (priorityOrder[b.priority || 'normal'] || 0) -
            (priorityOrder[a.priority || 'normal'] || 0)
          );
        }
        return (a.created_at ?? '') > (b.created_at ?? '') ? -1 : 1;
      });

    const upcoming = [...upcomingWithDate, ...noDueDate];
    const totalActiveTasks =
      overdue.length + todayTasks.length + upcoming.length;

    // Completed tasks: list-level done + personally hidden (completed/unassigned)
    const listDoneTasks = tasksWithRelations.filter(
      (task) => task.list?.status === 'done'
    );
    const completedTasks = [...listDoneTasks, ...personallyHiddenTasks].sort(
      (a, b) => {
        const aDate = a.created_at || '';
        const bDate = b.created_at || '';
        return bDate > aDate ? 1 : -1;
      }
    );

    // Pagination for completed tasks
    const completedPage = parseInt(
      url.searchParams.get('completedPage') || '0',
      10
    );
    const completedLimit = parseInt(
      url.searchParams.get('completedLimit') || '20',
      10
    );
    const completedStart = completedPage * completedLimit;
    const paginatedCompleted = completedTasks.slice(
      completedStart,
      completedStart + completedLimit
    );
    const hasMoreCompleted =
      completedStart + completedLimit < completedTasks.length;

    return NextResponse.json({
      overdue,
      today: todayTasks,
      upcoming,
      completed: paginatedCompleted,
      totalActiveTasks,
      totalCompletedTasks: completedTasks.length,
      hasMoreCompleted,
      completedPage,
    });
  } catch (error) {
    console.error('Error in /api/v1/users/me/tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
