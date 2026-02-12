import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskUserOverride, UserBoardListOverride } from '@tuturuuu/types';
import {
  isPersonallyHidden,
  resolveEffectiveValues,
} from '@tuturuuu/utils/task-overrides';
import MyTasksContent from './my-tasks-content';

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

export async function MyTasksDataLoader({
  wsId,
  userId,
  isPersonal,
}: {
  wsId: string;
  userId: string;
  isPersonal: boolean;
}) {
  const supabase = await createClient();

  // Fetch all accessible tasks using the RPC function
  // Exclude personally completed/unassigned tasks at the DB level
  const { data: rpcTasks, error: tasksError } = await supabase.rpc(
    'get_user_accessible_tasks',
    {
      p_user_id: userId,
      p_ws_id: isPersonal ? undefined : wsId,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active', 'done'],
      p_exclude_personally_completed: true,
      p_exclude_personally_unassigned: true,
    }
  );

  if (tasksError) {
    console.error('Error fetching tasks:', tasksError);
  }

  // Map RPC results to match expected structure
  const allTasks = rpcTasks?.map((task) => ({
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
  }));

  // Fetch related data for all tasks
  const taskIds = allTasks?.map((t) => t.id) || [];

  // Merge per-user scheduling settings (duration, hour type, auto-schedule) for the viewer.
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

  // Fetch per-user task overrides (personal priority, due date, completion, etc.)
  const overridesByTaskId = new Map<string, TaskUserOverride>();

  if (taskIds.length > 0) {
    const [schedulingResult, overridesResult] = await Promise.all([
      (supabase as any)
        .from('task_user_scheduling_settings')
        .select(
          `
          task_id,
          total_duration,
          is_splittable,
          min_split_duration_minutes,
          max_split_duration_minutes,
          calendar_hours,
          auto_schedule
        `
        )
        .eq('user_id', userId)
        .in('task_id', taskIds),
      (supabase as any)
        .from('task_user_overrides')
        .select('*')
        .eq('user_id', userId)
        .in('task_id', taskIds),
    ]);

    (schedulingResult.data as any[] | null)?.forEach((r: any) => {
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

    (overridesResult.data as TaskUserOverride[] | null)?.forEach((r) => {
      if (!r?.task_id) return;
      overridesByTaskId.set(r.task_id, r);
    });
  }

  // Fetch board/list personal status overrides
  const { data: boardListOverridesRaw } = await (supabase as any)
    .from('user_board_list_overrides')
    .select('*')
    .eq('user_id', userId);

  const boardListOverrides: UserBoardListOverride[] =
    (boardListOverridesRaw as UserBoardListOverride[] | null) ?? [];

  let assigneesData: TaskAssignee[] | null = [];
  let labelsData: TaskLabel[] | null = [];
  let projectsData: any[] | null = [];

  if (taskIds.length > 0) {
    const [assigneesResult, labelsResult, projectsResult] = await Promise.all([
      supabase
        .from('task_assignees')
        .select(
          `
          task_id,
          user:users(
            id,
            display_name,
            avatar_url
          )
        `
        )
        .in('task_id', taskIds),
      supabase
        .from('task_labels')
        .select(
          `
          task_id,
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        `
        )
        .in('task_id', taskIds),
      supabase
        .from('task_project_tasks')
        .select(
          `
          task_id,
          project:task_projects(*)
        `
        )
        .in('task_id', taskIds),
    ]);
    assigneesData = assigneesResult.data;
    labelsData = labelsResult.data;
    projectsData = projectsResult.data;
  }

  const assigneesByTaskId = new Map<string, { user: TaskAssignee['user'] }[]>();
  if (assigneesData) {
    for (const assignee of assigneesData) {
      if (!assigneesByTaskId.has(assignee.task_id)) {
        assigneesByTaskId.set(assignee.task_id, []);
      }
      assigneesByTaskId.get(assignee.task_id)!.push({ user: assignee.user });
    }
  }

  const labelsByTaskId = new Map<string, { label: TaskLabel['label'] }[]>();
  if (labelsData) {
    for (const label of labelsData) {
      if (!labelsByTaskId.has(label.task_id)) {
        labelsByTaskId.set(label.task_id, []);
      }
      labelsByTaskId.get(label.task_id)!.push({ label: label.label });
    }
  }

  const projectsByTaskId = new Map<string, { project: any }[]>();
  if (projectsData) {
    for (const project of projectsData) {
      if (!projectsByTaskId.has(project.task_id)) {
        projectsByTaskId.set(project.task_id, []);
      }
      projectsByTaskId.get(project.task_id)!.push({ project: project.project });
    }
  }

  // Fetch list and board data
  const listIds = allTasks?.map((t) => t.list_id).filter(Boolean) || [];
  const { data: listsData } = await supabase
    .from('task_lists')
    .select(
      `
      id,
      name,
      status,
      board:workspace_boards!inner(
        id,
        name,
        ws_id,
        estimation_type,
        extended_estimation,
        allow_zero_estimates,
        workspaces(id, name, personal)
      )
    `
    )
    .in('id', listIds);

  // Map the data to match the expected structure, merging overrides
  const tasksWithRelations = allTasks
    ?.map((task) => {
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

      // Apply effective values when self_managed
      return resolveEffectiveValues(baseTask, override);
    })
    // Filter out tasks hidden by board/list overrides
    .filter(
      (task) =>
        !isPersonallyHidden(
          task,
          overridesByTaskId.get(task.id) ?? null,
          boardListOverrides
        )
    );

  // Filter tasks by categories (using effective values from overrides)
  const now = new Date().toISOString();
  const today = new Date();
  const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const todayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekEnd = new Date(
    nextWeek.setHours(23, 59, 59, 999)
  ).toISOString();

  const overdueTasks = tasksWithRelations
    ?.filter(
      (task) =>
        task.end_date &&
        task.end_date < now &&
        task.list?.status &&
        ['not_started', 'active'].includes(task.list.status)
    )
    .sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1));

  const todayTasks = tasksWithRelations
    ?.filter(
      (task) =>
        task.end_date &&
        task.end_date >= todayStart &&
        task.end_date <= todayEnd &&
        task.end_date >= now && // Exclude tasks that are already overdue
        task.list?.status &&
        ['not_started', 'active'].includes(task.list.status)
    )
    .sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1));

  const upcomingWithDateTasks = tasksWithRelations
    ?.filter(
      (task) =>
        task.end_date &&
        task.end_date > todayEnd &&
        task.end_date <= nextWeekEnd &&
        task.list?.status &&
        ['not_started', 'active'].includes(task.list.status)
    )
    .sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1));

  const noDueDateTasks = tasksWithRelations
    ?.filter(
      (task) =>
        !task.end_date &&
        task.list?.status &&
        ['not_started', 'active'].includes(task.list.status)
    )
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        const priorityOrder: Record<string, number> = {
          critical: 4,
          high: 3,
          normal: 2,
          low: 1,
        };
        return (
          (priorityOrder[b.priority || 'normal'] || 0) -
          (priorityOrder[a.priority || 'normal'] || 0)
        );
      }
      return (a.created_at ?? '') > (b.created_at ?? '') ? -1 : 1;
    });

  const upcomingTasks = [
    ...(upcomingWithDateTasks || []),
    ...(noDueDateTasks || []),
  ];

  const totalActiveTasks =
    (overdueTasks?.length || 0) +
    (todayTasks?.length || 0) +
    (upcomingTasks?.length || 0);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <MyTasksContent
        wsId={wsId}
        isPersonal={isPersonal}
        overdueTasks={overdueTasks}
        todayTasks={todayTasks}
        upcomingTasks={upcomingTasks}
        totalActiveTasks={totalActiveTasks}
        overdueCount={overdueTasks?.length || 0}
        todayCount={todayTasks?.length || 0}
        upcomingCount={upcomingTasks?.length || 0}
      />
    </div>
  );
}
