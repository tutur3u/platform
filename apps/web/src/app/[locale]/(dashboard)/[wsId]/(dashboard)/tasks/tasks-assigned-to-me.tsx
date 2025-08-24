import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { User, UserStar } from '@tuturuuu/ui/icons';
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <UserStar className="h-5 w-5" />
          <div className="line-clamp-1">My Tasks</div>
        </CardTitle>
        <Link href={`/${wsId}/tasks/boards`}>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <User className="mr-1 h-3 w-3" />
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignedTasks && assignedTasks.length > 0 ? (
          assignedTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-start justify-between rounded-lg border bg-card/50 p-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <h4 className="line-clamp-1 font-medium">{task.name}</h4>
                    {task.description && (
                      <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                        {task.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      {isPersonal && (
                        <>
                          <Link
                            href={`/${task.list?.board?.ws_id}`}
                            className="text-dynamic-blue hover:underline"
                          >
                            <span className="font-semibold">
                              {task.list?.board?.workspaces?.name}
                            </span>
                          </Link>
                          <span>•</span>
                        </>
                      )}
                      <Link
                        href={`/${task.list.board.ws_id}/tasks/boards/${task.list?.board?.id}`}
                        className="text-dynamic-green hover:underline"
                      >
                        <span className="font-semibold">
                          {task.list?.board?.name}
                        </span>
                      </Link>
                      <span>•</span>
                      <Link
                        href={`/${task.list.board.ws_id}/tasks/boards/${task.list?.board?.id}`}
                        className="text-dynamic-pink hover:underline"
                      >
                        <span className="font-semibold">{task.list?.name}</span>
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
              <div className="ml-3 flex flex-col items-end gap-1">
                {task.priority && (
                  <Badge
                    className={cn(
                      'font-medium text-xs',
                      getPriorityColor(task.priority)
                    )}
                  >
                    {task.priority}
                  </Badge>
                )}
                <div className="text-muted-foreground text-xs">
                  {task.assignees && task.assignees.length > 1 && (
                    <span>+{task.assignees.length - 1} others</span>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <div className="mb-2">
              <User className="mx-auto h-8 w-8 opacity-50" />
            </div>
            <p className="text-sm">No tasks assigned to you</p>
            <p className="text-xs">Your assigned tasks will appear here</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
