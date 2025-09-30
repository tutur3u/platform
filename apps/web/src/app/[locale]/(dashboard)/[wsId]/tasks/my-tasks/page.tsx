import { createClient } from '@tuturuuu/supabase/next/server';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  UserRound,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import ExpandableTaskList from '../../(dashboard)/tasks/expandable-task-list';

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

  // Helper function to create base query
  const createBaseQuery = () => {
    const query = supabase
      .from('tasks')
      .select(
        `
        *,
        list:task_lists!inner(
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
        ),
        assignees:task_assignees!inner(
          user:users(
            id,
            display_name,
            avatar_url
          )
        ),
        labels:task_labels(
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        )
      `
      )
      .eq('assignees.user_id', userId)
      .eq('deleted', false);

    if (!isPersonal) {
      query.eq('list.board.ws_id', wsId);
    }

    return query;
  };

  // Get overdue tasks
  const now = new Date().toISOString();
  const { data: overdueTasks, error: overdueError } = await createBaseQuery()
    .lt('end_date', now)
    .in('list.status', ['not_started', 'active'])
    .order('end_date', { ascending: true });

  if (overdueError) {
    console.error('Error fetching overdue tasks:', overdueError);
  }

  // Get tasks due today
  const today = new Date();
  const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const todayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();

  const { data: todayTasks, error: todayError } = await createBaseQuery()
    .gte('end_date', todayStart)
    .lte('end_date', todayEnd)
    .in('list.status', ['not_started', 'active'])
    .order('end_date', { ascending: true });

  if (todayError) {
    console.error('Error fetching today tasks:', todayError);
  }

  // Get upcoming tasks (next 7 days, excluding today) and tasks without due date
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekEnd = new Date(
    nextWeek.setHours(23, 59, 59, 999)
  ).toISOString();

  const { data: upcomingWithDateTasks, error: upcomingError } =
    await createBaseQuery()
      .gt('end_date', todayEnd)
      .lte('end_date', nextWeekEnd)
      .in('list.status', ['not_started', 'active'])
      .order('end_date', { ascending: true });

  if (upcomingError) {
    console.error('Error fetching upcoming tasks:', upcomingError);
  }

  // Get tasks without due date
  const { data: noDueDateTasks, error: noDueDateError } =
    await createBaseQuery()
      .is('end_date', null)
      .in('list.status', ['not_started', 'active'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

  if (noDueDateError) {
    console.error('Error fetching no due date tasks:', noDueDateError);
  }

  // Combine upcoming tasks with no due date tasks
  const upcomingTasks = [
    ...(upcomingWithDateTasks || []),
    ...(noDueDateTasks || []),
  ];

  // Get completed tasks (last 30 days) - use completed status
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: completedTasks, error: completedError } =
    await createBaseQuery()
      .eq('list.status', 'done')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

  if (completedError) {
    console.error('Error fetching completed tasks:', completedError);
  }

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
      <div className="grid gap-4 md:grid-cols-4">
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

        <Card className="border-dynamic-green/30 bg-dynamic-green/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('ws-tasks.completed')}
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-dynamic-green">
              {completedTasks?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Sections */}
      <div className="space-y-6">
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
              <ExpandableTaskList
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
              <ExpandableTaskList
                tasks={todayTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
              />
            </CardContent>
          </Card>
        )}

        {/* Upcoming Tasks (including tasks with no due date) */}
        {upcomingTasks && upcomingTasks.length > 0 && (
          <Card className="border-dynamic-blue/20">
            <CardHeader className="border-dynamic-blue/10 border-b bg-dynamic-blue/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-blue">
                <Flag className="h-5 w-5" />
                {t('ws-tasks.upcoming')} ({upcomingTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <ExpandableTaskList
                tasks={upcomingTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
              />
            </CardContent>
          </Card>
        )}

        {/* Completed Tasks */}
        {completedTasks && completedTasks.length > 0 && (
          <>
            <Separator />
            <Card className="border-dynamic-green/20">
              <CardHeader className="border-dynamic-green/10 border-b bg-dynamic-green/5">
                <CardTitle className="flex items-center gap-2 text-dynamic-green">
                  <CheckCircle2 className="h-5 w-5" />
                  {t('ws-tasks.completed')} - {t('ws-tasks.last_30_days')} (
                  {completedTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <ExpandableTaskList
                  tasks={completedTasks as any}
                  isPersonal={isPersonal}
                  initialLimit={5}
                />
              </CardContent>
            </Card>
          </>
        )}

        {/* Empty State */}
        {totalActiveTasks === 0 &&
          (!completedTasks || completedTasks.length === 0) && (
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
      </div>
    </div>
  );
}
