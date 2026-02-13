import type {
  TaskUserOverride,
  TaskWithRelations,
  UserBoardListOverride,
} from '@tuturuuu/types';
import {
  isPersonallyHidden,
  resolveEffectiveValues,
} from '@tuturuuu/utils/task-overrides';
import { type NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/api-auth';

/** Row shape returned by get_user_tasks_with_relations RPC */
interface RpcTaskRow {
  task_id: string;
  task_name: string | null;
  task_description: string | null;
  task_creator_id: string | null;
  task_list_id: string | null;
  task_start_date: string | null;
  task_end_date: string | null;
  task_priority: string | null;
  task_completed_at: string | null;
  task_closed_at: string | null;
  task_deleted_at: string | null;
  task_estimation_points: number | null;
  task_created_at: string | null;
  sched_total_duration: number | null;
  sched_is_splittable: boolean | null;
  sched_min_split_duration_minutes: number | null;
  sched_max_split_duration_minutes: number | null;
  sched_calendar_hours: string | null;
  sched_auto_schedule: boolean | null;
  override_self_managed: boolean | null;
  override_completed_at: string | null;
  override_priority_override: string | null;
  override_due_date_override: string | null;
  override_estimation_override: number | null;
  override_personally_unassigned: boolean | null;
  override_notes: string | null;
  list_data: Record<string, unknown> | null;
  assignees_data: Array<{ user: Record<string, unknown> | null }>;
  labels_data: Array<{ label: Record<string, unknown> | null }>;
  projects_data: Array<{ project: Record<string, unknown> | null }>;
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

    // Parse optional server-side filter params
    const filterWsIds = url.searchParams.getAll('filterWsId');
    const filterBoardIds = url.searchParams.getAll('filterBoardId');
    const filterLabelIds = url.searchParams.getAll('filterLabelId');
    const filterProjectIds = url.searchParams.getAll('filterProjectId');
    const selfManagedOnly = url.searchParams.get('selfManagedOnly') === 'true';

    // Single consolidated RPC call: tasks + all relations
    const [rpcResult, boardListOverridesResult] = await Promise.all([
      supabase.rpc('get_user_tasks_with_relations', {
        p_user_id: user.id,
        p_ws_id: isPersonal ? undefined : (wsId ?? undefined),
        p_include_deleted: false,
        p_list_statuses: ['not_started', 'active', 'done'],
        p_exclude_personally_completed: false,
        p_exclude_personally_unassigned: false,
        p_filter_ws_ids: filterWsIds.length > 0 ? filterWsIds : undefined,
        p_filter_board_ids:
          filterBoardIds.length > 0 ? filterBoardIds : undefined,
        p_filter_label_ids:
          filterLabelIds.length > 0 ? filterLabelIds : undefined,
        p_filter_project_ids:
          filterProjectIds.length > 0 ? filterProjectIds : undefined,
        p_filter_self_managed_only: selfManagedOnly,
      }),
      supabase
        .from('user_board_list_overrides')
        .select('*')
        .eq('user_id', user.id),
    ]);

    if (rpcResult.error) {
      console.error('Error fetching tasks:', rpcResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch tasks' },
        { status: 500 }
      );
    }

    const rpcTasks = rpcResult.data ?? [];
    if (rpcTasks.length === 0) {
      return NextResponse.json({
        overdue: [],
        today: [],
        upcoming: [],
        totalActiveTasks: 0,
      });
    }

    const boardListOverrides: UserBoardListOverride[] =
      (boardListOverridesResult.data as UserBoardListOverride[] | null) ?? [];

    // Map RPC results to TaskWithRelations shape
    const allTasksWithRelations = (rpcTasks as RpcTaskRow[]).map((row) => {
      const override: TaskUserOverride | null =
        row.override_self_managed != null
          ? {
              task_id: row.task_id,
              user_id: user.id,
              self_managed: row.override_self_managed,
              completed_at: row.override_completed_at,
              priority_override:
                row.override_priority_override as TaskUserOverride['priority_override'],
              due_date_override: row.override_due_date_override,
              estimation_override: row.override_estimation_override,
              personally_unassigned:
                row.override_personally_unassigned ?? false,
              notes: row.override_notes,
              created_at: '',
              updated_at: '',
            }
          : null;

      const scheduling =
        row.sched_total_duration != null ||
        row.sched_is_splittable != null ||
        row.sched_auto_schedule != null
          ? {
              total_duration: row.sched_total_duration ?? null,
              is_splittable: row.sched_is_splittable ?? null,
              min_split_duration_minutes:
                row.sched_min_split_duration_minutes ?? null,
              max_split_duration_minutes:
                row.sched_max_split_duration_minutes ?? null,
              calendar_hours: row.sched_calendar_hours ?? null,
              auto_schedule: row.sched_auto_schedule ?? null,
            }
          : {};

      const baseTask = {
        id: row.task_id,
        name: row.task_name ?? '',
        description: row.task_description,
        creator_id: row.task_creator_id,
        list_id: row.task_list_id,
        start_date: row.task_start_date,
        end_date: row.task_end_date,
        priority: row.task_priority,
        completed_at: row.task_completed_at,
        closed_at: row.task_closed_at,
        deleted_at: row.task_deleted_at,
        estimation_points: row.task_estimation_points,
        created_at: row.task_created_at,
        ...scheduling,
        list: row.list_data as TaskWithRelations['list'],
        assignees: (row.assignees_data ?? []) as TaskWithRelations['assignees'],
        labels: (row.labels_data ?? []) as TaskWithRelations['labels'],
        projects: (row.projects_data ?? []) as TaskWithRelations['projects'],
        overrides: override,
      };

      return resolveEffectiveValues(baseTask, override);
    });

    // Separate active tasks from personally hidden ones
    const tasksWithRelations: typeof allTasksWithRelations = [];
    const personallyHiddenTasks: typeof allTasksWithRelations = [];

    for (const task of allTasksWithRelations) {
      const override = task.overrides ?? null;
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
