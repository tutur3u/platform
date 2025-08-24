import { createClient } from '@tuturuuu/supabase/next/server';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { CheckCircle, Plus } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import Link from 'next/link';

interface NewlyCreatedTasksProps {
  wsId: string;
}

export default async function NewlyCreatedTasks({
  wsId,
}: NewlyCreatedTasksProps) {
  const supabase = await createClient();

  // Get recently created tasks (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentTasks, error } = await supabase
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
      assignees:task_assignees(
        user:users(
          id,
          display_name,
          avatar_url
        )
      )
    `)
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="font-semibold text-base">
          <CardTitle className="flex items-center gap-2 font-semibold text-base">
            <CheckCircle className="h-5 w-5" />
            <div className="line-clamp-1">Recently Created Tasks</div>
          </CardTitle>
        </CardTitle>
        <Link href={`/${wsId}/tasks/boards`}>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Plus className="mr-1 h-3 w-3" />
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentTasks && recentTasks.length > 0 ? (
          recentTasks.map((task) => (
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
                      <span className="font-semibold">
                        <Link
                          href={`/${wsId}/tasks/boards/${task.list?.board?.id}`}
                          className="hover:underline"
                        >
                          {task.list?.board?.name}
                        </Link>
                      </span>
                      <span>•</span>
                      <span className="font-semibold">
                        <Link
                          href={`/${wsId}/tasks/boards/${task.list?.board?.id}`}
                          className="hover:underline"
                        >
                          {task.list?.name}
                        </Link>
                      </span>
                      <span>•</span>
                      <span>
                        {task.created_at &&
                          format(new Date(task.created_at), 'MMM d, h:mm a')}
                      </span>
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
                {task.assignees && task.assignees.length > 0 && (
                  <div className="-space-x-1 flex">
                    {task.assignees.slice(0, 3).map((assignee) => (
                      <Avatar
                        key={assignee.user?.id}
                        className="h-5 w-5 ring-2 ring-background"
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
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-medium text-xs ring-2 ring-background">
                        +{task.assignees.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <div className="mb-2">
              <Plus className="mx-auto h-8 w-8 opacity-50" />
            </div>
            <p className="text-sm">No new tasks created recently</p>
            <p className="text-xs">
              Tasks created in the last 7 days will appear here
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
