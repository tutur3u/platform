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
          workspaces(id, name, personal)
        )
      ),
      assignees:task_assignees!inner(
        user:users(
          id,
          display_name,
          avatar_url
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
    <Card className="overflow-hidden border-dynamic-orange/20 transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-orange/20 border-b bg-gradient-to-r from-dynamic-orange/5 to-dynamic-red/5 p-4">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <div className="rounded-lg bg-dynamic-orange/10 p-1.5 text-dynamic-orange">
            <UserStar className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">{t('my_tasks')}</div>
        </CardTitle>
        <Link href={`/${wsId}/tasks/boards`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 transition-colors hover:bg-dynamic-orange/10 hover:text-dynamic-orange"
          >
            <UserRoundCheck className="mr-1 h-3 w-3" />
            {t('view_all')}
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        {assignedTasks && assignedTasks.length > 0 ? (
          <ExpandableTaskList
            tasks={assignedTasks}
            isPersonal={isPersonal}
            initialLimit={5}
          />
        ) : (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-gray/20 bg-gradient-to-br from-dynamic-gray/10 to-dynamic-slate/10">
              <User className="h-8 w-8 text-dynamic-gray/60" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-base text-dynamic-gray">
                {t('no_tasks_personal')}
              </h3>
              <p className="mx-auto max-w-xs text-dynamic-gray/60 text-sm">
                {t('no_tasks_assigned_personal')}
              </p>
            </div>
            <div className="mt-6">
              <Link href={`/${wsId}/tasks/boards`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dynamic-orange/20 text-dynamic-orange transition-all duration-200 hover:border-dynamic-orange/30 hover:bg-dynamic-orange/10"
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
