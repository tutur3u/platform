import { createClient } from '@tuturuuu/supabase/next/server';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { CheckCircle, Eye, Plus } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import TaskCreationDate from './task-creation-date';

interface NewlyCreatedTasksProps {
  wsId: string;
}

export default async function NewlyCreatedTasks({
  wsId,
}: NewlyCreatedTasksProps) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');
  // Get recently created tasks (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentTasks, error } = await supabase
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
          ws_id
        )
      ),
      assignees:task_assignees(
        user:users(
          id,
          display_name,
          avatar_url
        )
      )
    `
    )
    .eq('list.board.ws_id', wsId)
    .eq('deleted', false)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching newly created tasks:', error);
    return null;
  }

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case 'critical':
      case 'urgent':
        return 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20';
      case 'high':
        return 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20';
      case 'medium':
        return 'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20';
      case 'low':
        return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20';
      default:
        return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20';
    }
  };

  return (
    <Card className="overflow-hidden border-dynamic-green/20 transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-green/20 border-b bg-gradient-to-r from-dynamic-green/5 to-dynamic-blue/5 p-4">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <div className="rounded-lg bg-dynamic-green/10 p-1.5 text-dynamic-green">
            <CheckCircle className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">{t('recently_created_tasks')}</div>
        </CardTitle>
        <Link href={`/${wsId}/tasks/boards`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 transition-colors hover:bg-dynamic-green/10 hover:text-dynamic-green"
          >
            <Eye className="mr-1 h-3 w-3" />
            {t('view_all')}
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        {recentTasks && recentTasks.length > 0 ? (
          <div className="space-y-3">
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="group rounded-xl border border-dynamic-blue/10 bg-gradient-to-br from-dynamic-blue/5 to-dynamic-cyan/5 p-4 transition-all duration-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <h4 className="line-clamp-1 font-semibold text-sm">
                          {task.name}
                        </h4>
                        {task.description && (
                          <p className="mt-1 line-clamp-2 text-dynamic-blue/70 text-xs">
                            {task.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-dynamic-blue/60 text-xs">
                          <Link
                            href={`/${wsId}/tasks/boards/${task.list?.board?.id}`}
                            className="font-semibold text-dynamic-green transition-colors hover:text-dynamic-green/80 hover:underline"
                          >
                            {task.list?.board?.name}
                          </Link>
                          <span>•</span>
                          <Link
                            href={`/${wsId}/tasks/boards/${task.list?.board?.id}`}
                            className="font-semibold text-dynamic-orange transition-colors hover:text-dynamic-orange/80 hover:underline"
                          >
                            {task.list?.name}
                          </Link>
                          {task.created_at && (
                            <>
                              <span>•</span>
                              <TaskCreationDate
                                creationDate={task.created_at}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="ml-3 flex flex-col items-end gap-2">
                    {task.priority && (
                      <Badge
                        className={cn(
                          'font-semibold text-xs transition-colors',
                          getPriorityColor(task.priority)
                        )}
                      >
                        {task.priority}
                      </Badge>
                    )}
                    {task.assignees && task.assignees.length > 0 && (
                      <div className="-space-x-1 flex">
                        {task.assignees.slice(0, 3).map((assignee) => (
                          <Avatar
                            key={assignee.user?.id}
                            className="h-5 w-5 ring-2 ring-background transition-transform group-hover:scale-110"
                          >
                            <AvatarImage
                              src={assignee.user?.avatar_url || undefined}
                              alt={assignee.user?.display_name || 'User'}
                            />
                            <AvatarFallback className="text-xs">
                              {(assignee.user?.display_name || 'U')
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {task.assignees.length > 3 && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-medium text-xs ring-2 ring-background transition-transform group-hover:scale-110">
                            +{task.assignees.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-gray/20 bg-gradient-to-br from-dynamic-gray/10 to-dynamic-slate/10">
              <Plus className="h-8 w-8 text-dynamic-gray/60" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-base text-dynamic-gray">
                {t('no_recently')}
              </h3>
              <p className="mx-auto max-w-xs text-dynamic-gray/60 text-sm">
                {t('no_recently_created_tasks_description')}
              </p>
            </div>
            <div className="mt-6">
              <Link href={`/${wsId}/tasks/boards`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dynamic-green/20 text-dynamic-green transition-all duration-200 hover:border-dynamic-green/30 hover:bg-dynamic-green/10"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('create_task')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
