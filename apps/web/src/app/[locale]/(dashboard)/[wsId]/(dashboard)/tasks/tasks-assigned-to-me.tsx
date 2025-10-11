import { User, UserRoundCheck, UserStar } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import ExpandableTaskList from './expandable-task-list';

interface TasksAssignedToMeProps {
  wsId: string;
  userId: string;
  isPersonal?: boolean;
}

export default async function TasksAssignedToMe({
  wsId,
  userId,
  isPersonal = false,
}: TasksAssignedToMeProps) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');

  // Use RPC function to get all accessible tasks
  const { data: rpcTasks, error: tasksError } = await supabase.rpc(
    'get_user_accessible_tasks',
    {
      p_user_id: userId,
      p_ws_id: wsId,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active'],
    }
  );

  if (tasksError) {
    console.error('Error fetching assigned tasks:', tasksError);
    return null;
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
  const assignedTasks = allTasks
    ?.map((task) => ({
      ...task,
      list: listsData?.find((l) => l.id === task.list_id),
      assignees: assigneesData
        ?.filter((a) => a.task_id === task.id)
        .map((a) => ({ user: a.user })),
      labels: labelsData
        ?.filter((l) => l.task_id === task.id)
        .map((l) => ({ label: l.label })),
    }))
    .sort((a, b) => {
      // Sort by priority first
      const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
      const aPriority = priorityOrder[a.priority || 'normal'] || 0;
      const bPriority = priorityOrder[b.priority || 'normal'] || 0;

      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }

      // Then by end_date
      if (a.end_date && b.end_date) {
        return a.end_date > b.end_date ? 1 : -1;
      }
      if (a.end_date) return -1;
      if (b.end_date) return 1;

      return 0;
    });

  return (
    <Card className="group overflow-hidden border-dynamic-orange/20 transition-all duration-300 hover:border-dynamic-orange/30 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-orange/20 border-b bg-gradient-to-r from-dynamic-orange/5 via-dynamic-orange/3 to-dynamic-red/5 p-4">
        <CardTitle className="flex items-center gap-3 font-semibold text-base">
          <div className="rounded-xl bg-gradient-to-br from-dynamic-orange/20 to-dynamic-orange/10 p-2 text-dynamic-orange shadow-sm ring-1 ring-dynamic-orange/20">
            <UserStar className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">{t('my_tasks')}</div>
        </CardTitle>
        <Link href={`/${wsId}/tasks/my-tasks`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 transition-all duration-200 hover:scale-105 hover:bg-dynamic-orange/10 hover:text-dynamic-orange"
          >
            <UserRoundCheck className="mr-1.5 h-3.5 w-3.5" />
            {t('view_all')}
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        {assignedTasks && assignedTasks.length > 0 ? (
          <ExpandableTaskList
            tasks={assignedTasks as any}
            isPersonal={isPersonal}
            initialLimit={5}
          />
        ) : (
          <div className="py-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-dynamic-gray/20 bg-gradient-to-br from-dynamic-gray/10 via-dynamic-gray/5 to-dynamic-slate/10 shadow-sm ring-1 ring-dynamic-gray/10">
              <User className="h-10 w-10 text-dynamic-gray/60" />
            </div>
            <div className="space-y-3">
              <h3 className="font-bold text-dynamic-gray text-lg">
                {t('no_tasks_personal')}
              </h3>
              <p className="mx-auto max-w-sm text-dynamic-gray/70 text-sm leading-relaxed">
                {t('no_tasks_assigned_personal')}
              </p>
            </div>
            <div className="mt-8">
              <Link href={`/${wsId}/tasks/my-tasks`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dynamic-orange/30 bg-gradient-to-r from-dynamic-orange/5 to-dynamic-orange/10 text-dynamic-orange transition-all duration-200 hover:scale-105 hover:border-dynamic-orange/40 hover:bg-dynamic-orange/20 hover:shadow-md"
                >
                  <User className="mr-2 h-4 w-4" />
                  {t('view_tasks')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
