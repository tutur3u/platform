import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { User, UserRoundCheck, UserStar } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import TaskDueDate from './task-due-date';

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

  // Get tasks assigned to the current user
  const queryBuilder = supabase
    .from('tasks')
    .select(`
      *,
      list:task_lists!inner(
        id,
        name,
        status,
        board:workspace_boards!inner(
          id,
          name,
          ws_id,
          workspaces(id, name)
        )
      ),
      assignees:task_assignees!inner(
        user:users(
          id,
          display_name,
          avatar_url
        )
      )
    `)
    .eq('assignees.user_id', userId)
    .eq('deleted', false)
    .in('list.status', ['not_started', 'active']) // Only active tasks
    .order('priority', { ascending: false })
    .order('end_date', { ascending: true })
    .limit(5);

  if (!isPersonal) {
    queryBuilder.eq('list.board.ws_id', wsId);
  }

  const { data: assignedTasks, error } = await queryBuilder;

  if (error) {
    console.error('Error fetching assigned tasks:', error);
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
    <Card className="overflow-hidden border-dynamic-orange/20 transition-all duration-300 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-orange/10 border-b bg-gradient-to-r from-dynamic-orange/5 to-dynamic-red/5 pb-3">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <div className="rounded-lg bg-dynamic-orange/10 p-1.5 text-dynamic-orange">
            <UserStar className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">My Tasks</div>
        </CardTitle>
        <Link href={`/${wsId}/tasks/boards`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 transition-colors hover:bg-dynamic-orange/10 hover:text-dynamic-orange"
          >
            <UserRoundCheck className="mr-1 h-3 w-3" />
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        {assignedTasks && assignedTasks.length > 0 ? (
          <div className="space-y-3">
            {assignedTasks.map((task) => (
              <div
                key={task.id}
                className="group rounded-xl border border-dynamic-orange/10 bg-gradient-to-br from-dynamic-orange/5 to-dynamic-red/5 p-4 transition-all duration-300 hover:shadow-dynamic-orange/10 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <h4 className="line-clamp-1 font-semibold text-sm">
                          {task.name}
                        </h4>
                        {task.description && (
                          <p className="mt-1 line-clamp-2 text-dynamic-orange/70 text-xs">
                            {task.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-dynamic-orange/60 text-xs">
                          {isPersonal && (
                            <>
                              <Link
                                href={`/${task.list?.board?.ws_id}`}
                                className="font-semibold text-dynamic-blue transition-colors hover:text-dynamic-blue/80 hover:underline"
                              >
                                {task.list?.board?.workspaces?.name}
                              </Link>
                              <span>•</span>
                            </>
                          )}
                          <Link
                            href={`/${task.list.board.ws_id}/tasks/boards/${task.list?.board?.id}`}
                            className="font-semibold text-dynamic-green transition-colors hover:text-dynamic-green/80 hover:underline"
                          >
                            {task.list?.board?.name}
                          </Link>
                          <span>•</span>
                          <Link
                            href={`/${task.list.board.ws_id}/tasks/boards/${task.list?.board?.id}`}
                            className="font-semibold text-dynamic-orange transition-colors hover:text-dynamic-orange/80 hover:underline"
                          >
                            {task.list?.name}
                          </Link>
                          {task.end_date && (
                            <>
                              <span>•</span>
                              <TaskDueDate dueDate={task.end_date} />
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
                    <div className="text-dynamic-orange/60 text-xs">
                      {task.assignees && task.assignees.length > 1 && (
                        <span className="font-medium">
                          +{task.assignees.length - 1} others
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-gray/20 bg-gradient-to-br from-dynamic-gray/10 to-dynamic-slate/10">
              <User className="h-8 w-8 text-dynamic-gray/60" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-base text-dynamic-gray">
                No tasks assigned to you
              </h3>
              <p className="mx-auto max-w-xs text-dynamic-gray/60 text-sm">
                Your assigned tasks will appear here
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
                  View Tasks
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
