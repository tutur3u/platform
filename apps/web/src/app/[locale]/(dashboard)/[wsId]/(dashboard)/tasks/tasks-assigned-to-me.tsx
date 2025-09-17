import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { User, UserRoundCheck, UserStar } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
  // Get tasks assigned to the current user
  const queryBuilder = supabase
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
    .eq('deleted', false)
    .in('list.status', ['not_started', 'active']) // Only active tasks
    .order('priority', { ascending: false })
    .order('end_date', { ascending: true });

  if (!isPersonal) {
    queryBuilder.eq('list.board.ws_id', wsId);
  }

  const { data: assignedTasks, error } = await queryBuilder;

  if (error) {
    console.error('Error fetching assigned tasks:', error);
    return null;
  }

  return (
    <Card className="group overflow-hidden border-dynamic-orange/20 transition-all duration-300 hover:border-dynamic-orange/30 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-orange/20 border-b bg-gradient-to-r from-dynamic-orange/5 via-dynamic-orange/3 to-dynamic-red/5 p-4">
        <CardTitle className="flex items-center gap-3 font-semibold text-base">
          <div className="rounded-xl bg-gradient-to-br from-dynamic-orange/20 to-dynamic-orange/10 p-2 text-dynamic-orange shadow-sm ring-1 ring-dynamic-orange/20">
            <UserStar className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">{t('my_tasks')}</div>
        </CardTitle>
        <Link href={`/${wsId}/tasks/boards`}>
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
              <Link href={`/${wsId}/tasks/boards`}>
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
