import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Calendar, User, UserStar } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { format, isThisWeek, isToday, isTomorrow } from 'date-fns';
import Link from 'next/link';

interface TasksAssignedToMeProps {
  wsId: string;
  userId: string;
}

export default async function TasksAssignedToMe({
  wsId,
  userId,
}: TasksAssignedToMeProps) {
  const supabase = await createClient();

  // Get tasks assigned to the current user
  const { data: assignedTasks, error } = await supabase
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
          ws_id
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
    .eq('list.board.ws_id', wsId)
    .eq('assignees.user_id', userId)
    .eq('deleted', false)
    .in('list.status', ['not_started', 'active']) // Only active tasks
    .order('priority', { ascending: false })
    .order('end_date', { ascending: true })
    .limit(5);

  if (error) {
    console.error('Error fetching assigned tasks:', error);
    return null;
  }

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case 'critical':
      case 'urgent':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-white';
      case 'low':
        return 'bg-green-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getDueDateLabel = (dueDate: string) => {
    const date = new Date(dueDate);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isThisWeek(date)) return format(date, 'EEEE');
    return format(date, 'MMM d');
  };

  const getDueDateColor = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();

    if (date < now) return 'text-red-600 bg-red-50 border-red-200';
    if (isToday(date)) return 'text-orange-600 bg-orange-50 border-orange-200';
    if (isTomorrow(date))
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-blue-600 bg-blue-50 border-blue-200';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <UserStar className="h-5 w-5" />
          <div className="line-clamp-1">My Tasks</div>
        </CardTitle>
        <Link href={`/${wsId}/tasks?assignee=${userId}`}>
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
                      <span>{task.list?.board?.name}</span>
                      <span>•</span>
                      <span>{task.list?.name}</span>
                      {task.end_date && (
                        <>
                          <span>•</span>
                          <div
                            className={cn(
                              'inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium text-xs',
                              getDueDateColor(task.end_date)
                            )}
                          >
                            <Calendar className="h-3 w-3" />
                            Due {getDueDateLabel(task.end_date)}
                          </div>
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
