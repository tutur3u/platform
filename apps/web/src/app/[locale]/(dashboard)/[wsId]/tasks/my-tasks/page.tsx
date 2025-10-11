import WorkspaceWrapper from '@/components/workspace-wrapper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import MyTasksContent from './my-tasks-content';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function MyTasksPage({ params }: Props) {
  const { locale } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return (
    <WorkspaceWrapper params={params}>
      {({ wsId, isPersonal }) => (
        <MyTasksDataLoader
          wsId={wsId}
          userId={user.id}
          isPersonal={isPersonal}
        />
      )}
    </WorkspaceWrapper>
  );
}

async function MyTasksDataLoader({
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
  const { data: rpcTasks, error: tasksError } = await supabase.rpc(
    'get_user_accessible_tasks',
    {
      p_user_id: userId,
      p_ws_id: wsId,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active', 'done'],
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
    completed: task.task_completed,
    archived: task.task_archived,
    deleted: task.task_deleted,
    estimation_points: task.task_estimation_points,
    created_at: task.task_created_at,
    calendar_hours: task.task_calendar_hours,
    total_duration: task.task_total_duration,
    is_splittable: task.task_is_splittable,
    min_split_duration_minutes: task.task_min_split_duration_minutes,
    max_split_duration_minutes: task.task_max_split_duration_minutes,
  }));

  // Fetch related data for all tasks
  const taskIds = allTasks?.map((t) => t.id) || [];

  // Fetch assignees for all tasks
  const { data: assigneesData } = await supabase
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
    .in('task_id', taskIds);

  // Fetch labels for all tasks
  const { data: labelsData } = await supabase
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
    .in('task_id', taskIds);

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

  // Map the data to match the expected structure
  const tasksWithRelations = allTasks?.map((task) => ({
    ...task,
    list: listsData?.find((l) => l.id === task.list_id) || null,
    assignees:
      assigneesData
        ?.filter((a) => a.task_id === task.id)
        .map((a) => ({ user: a.user })) || null,
    labels:
      labelsData
        ?.filter((l) => l.task_id === task.id)
        .map((l) => ({ label: l.label })) || null,
  }));

  // Filter tasks by categories
  const now = new Date().toISOString();
  const today = new Date();
  const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const todayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekEnd = new Date(
    nextWeek.setHours(23, 59, 59, 999)
  ).toISOString();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
        const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
        return (
          (priorityOrder[b.priority || 'normal'] || 0) -
          (priorityOrder[a.priority || 'normal'] || 0)
        );
      }
      return a.created_at! > b.created_at! ? -1 : 1;
    });

  const upcomingTasks = [
    ...(upcomingWithDateTasks || []),
    ...(noDueDateTasks || []),
  ];

  const completedTasks = tasksWithRelations
    ?.filter(
      (task) =>
        task.list?.status === 'done' &&
        task.created_at &&
        task.created_at >= thirtyDaysAgo.toISOString()
    )
    .sort((a, b) => (a.created_at! > b.created_at! ? -1 : 1));

  // Log counts for debugging
  console.log('Task counts:', {
    overdue: overdueTasks?.length || 0,
    today: todayTasks?.length || 0,
    upcoming: upcomingTasks?.length || 0,
    completed: completedTasks?.length || 0,
  });

  const totalActiveTasks =
    (overdueTasks?.length || 0) +
    (todayTasks?.length || 0) +
    (upcomingTasks?.length || 0);

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Tabs Content */}
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
