import { createClient } from '@tuturuuu/supabase/next/server';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  UserRound,
  NotebookPen,
  Archive,
} from '@tuturuuu/ui/icons';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import TaskListWithCompletion from '../../(dashboard)/tasks/task-list-with-completion';
import QuickJournal from '../../(dashboard)/quick-journal';
import BucketDump from '../../(dashboard)/bucket-dump';

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
        <MyTasksContent wsId={wsId} userId={user.id} isPersonal={isPersonal} />
      )}
    </WorkspaceWrapper>
  );
}

async function MyTasksContent({
  wsId,
  userId,
  isPersonal,
}: {
  wsId: string;
  userId: string;
  isPersonal: boolean;
}) {
  const t = await getTranslations();
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
    list: listsData?.find((l) => l.id === task.list_id),
    assignees: assigneesData
      ?.filter((a) => a.task_id === task.id)
      .map((a) => ({ user: a.user })),
    labels: labelsData
      ?.filter((l) => l.task_id === task.id)
      .map((l) => ({ label: l.label })),
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
      {/* Header */}
      <div className="space-y-2">
        <h1 className="flex items-center gap-3 font-bold text-3xl">
          <UserRound className="h-8 w-8 text-primary" />
          {t('sidebar_tabs.my_tasks')}
        </h1>
        <p className="text-muted-foreground">
          {t('ws-tasks.my_tasks_description')}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-dynamic-red/30 bg-dynamic-red/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('ws-tasks.overdue')}
            </CardTitle>
            <Clock className="h-4 w-4 text-dynamic-red" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-dynamic-red">
              {overdueTasks?.length || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="border-dynamic-orange/30 bg-dynamic-orange/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('ws-tasks.due_today')}
            </CardTitle>
            <Calendar className="h-4 w-4 text-dynamic-orange" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-dynamic-orange">
              {todayTasks?.length || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="border-dynamic-blue/30 bg-dynamic-blue/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('ws-tasks.upcoming')}
            </CardTitle>
            <Flag className="h-4 w-4 text-dynamic-blue" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-dynamic-blue">
              {upcomingTasks?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for organizing views */}
      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tasks" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {t('sidebar_tabs.my_tasks')}
          </TabsTrigger>
          <TabsTrigger value="journal" className="gap-2">
            <NotebookPen className="h-4 w-4" />
            Quick Journal
          </TabsTrigger>
          <TabsTrigger value="bucket" className="gap-2">
            <Archive className="h-4 w-4" />
            Bucket Dump
          </TabsTrigger>
        </TabsList>

        {/* My Tasks Tab */}
        <TabsContent value="tasks" className="space-y-6 mt-6">
          {/* Overdue Tasks */}
          {overdueTasks && overdueTasks.length > 0 && (
            <Card className="border-dynamic-red/20">
              <CardHeader className="border-dynamic-red/10 border-b bg-dynamic-red/5">
                <CardTitle className="flex items-center gap-2 text-dynamic-red">
                  <Clock className="h-5 w-5" />
                  {t('ws-tasks.overdue')} ({overdueTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <TaskListWithCompletion
                  tasks={overdueTasks as any}
                  isPersonal={isPersonal}
                  initialLimit={5}
                />
              </CardContent>
            </Card>
          )}

          {/* Due Today */}
          {todayTasks && todayTasks.length > 0 && (
            <Card className="border-dynamic-orange/20">
              <CardHeader className="border-dynamic-orange/10 border-b bg-dynamic-orange/5">
                <CardTitle className="flex items-center gap-2 text-dynamic-orange">
                  <Calendar className="h-5 w-5" />
                  {t('ws-tasks.due_today')} ({todayTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <TaskListWithCompletion
                  tasks={todayTasks as any}
                  isPersonal={isPersonal}
                  initialLimit={5}
                />
              </CardContent>
            </Card>
          )}

          {/* Upcoming Tasks */}
          {upcomingTasks && upcomingTasks.length > 0 && (
            <Card className="border-dynamic-blue/20">
              <CardHeader className="border-dynamic-blue/10 border-b bg-dynamic-blue/5">
                <CardTitle className="flex items-center gap-2 text-dynamic-blue">
                  <Flag className="h-5 w-5" />
                  {t('ws-tasks.upcoming')} ({upcomingTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <TaskListWithCompletion
                  tasks={upcomingTasks as any}
                  isPersonal={isPersonal}
                  initialLimit={5}
                />
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {totalActiveTasks === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                  <UserRound className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="mb-2 font-semibold text-lg">
                  {t('ws-tasks.no_tasks')}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t('ws-tasks.no_tasks_assigned')}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Quick Journal Tab */}
        <TabsContent value="journal" className="mt-6">
          <QuickJournal wsId={wsId} enabled={true} />
        </TabsContent>

        {/* Bucket Dump Tab */}
        <TabsContent value="bucket" className="mt-6">
          <BucketDump wsId={wsId} enabled={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
