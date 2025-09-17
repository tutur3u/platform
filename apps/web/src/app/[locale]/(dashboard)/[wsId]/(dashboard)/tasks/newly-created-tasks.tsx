import { createClient } from '@tuturuuu/supabase/next/server';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Eye,
  Plus,
} from '@tuturuuu/ui/icons';
import { TaskEstimationDisplay } from '@tuturuuu/ui/tu-do/shared/task-estimation-display';
import { TaskLabelsDisplay } from '@tuturuuu/ui/tu-do/shared/task-labels-display';
import { getDescriptionText } from '@tuturuuu/ui/utils/text-helper';
import { cn } from '@tuturuuu/utils/format';
import {
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
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
          ws_id,
          estimation_type,
          extended_estimation,
          allow_zero_estimates
        )
      ),
      assignees:task_assignees(
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
      case 'normal':
      case 'medium':
        return 'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20';
      case 'low':
        return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20';
      default:
        return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20';
    }
  };

  const getPriorityLabel = (priority: string | null) => {
    switch (priority) {
      case 'critical':
        return 'Urgent';
      case 'high':
        return 'High';
      case 'normal':
      case 'medium':
        return 'Medium';
      case 'low':
        return 'Low';
      default:
        return priority;
    }
  };

  const formatSmartDate = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const isOverdue = (endDate: string | null | undefined) => {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  };

  return (
    <Card className="group overflow-hidden border-dynamic-green/20 transition-all duration-300 hover:border-dynamic-green/30 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-green/20 border-b bg-gradient-to-r from-dynamic-green/5 via-dynamic-green/3 to-dynamic-cyan/5 p-4">
        <CardTitle className="flex items-center gap-3 font-semibold text-base">
          <div className="rounded-xl bg-gradient-to-br from-dynamic-green/20 to-dynamic-green/10 p-2 text-dynamic-green shadow-sm ring-1 ring-dynamic-green/20">
            <CheckCircle className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">{t('recently_created_tasks')}</div>
        </CardTitle>
        <Link href={`/${wsId}/tasks/boards`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 transition-all duration-200 hover:scale-105 hover:bg-dynamic-green/10 hover:text-dynamic-green"
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            {t('view_all')}
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        {recentTasks && recentTasks.length > 0 ? (
          <div className="space-y-3">
            {recentTasks.map((task) => {
              const taskOverdue = isOverdue(task.end_date);
              const endDate = task.end_date ? new Date(task.end_date) : null;
              const startDate = task.start_date
                ? new Date(task.start_date)
                : null;
              const now = new Date();

              return (
                <div
                  key={task.id}
                  className={cn(
                    'group relative rounded-xl border bg-gradient-to-br p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-md',
                    taskOverdue && !task.archived
                      ? 'border-dynamic-red/30 from-dynamic-red/5 via-dynamic-red/3 to-dynamic-red/10 shadow-sm ring-1 ring-dynamic-red/20'
                      : 'border-dynamic-green/20 from-dynamic-green/5 via-dynamic-green/3 to-dynamic-cyan/5 hover:border-dynamic-green/30'
                  )}
                >
                  {/* Overdue indicator */}
                  {taskOverdue && !task.archived && (
                    <div className="absolute top-0 right-0 h-0 w-0 border-t-[20px] border-t-dynamic-red border-l-[20px] border-l-transparent">
                      <AlertCircle className="-top-4 -right-[18px] absolute h-3 w-3" />
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="line-clamp-1 font-semibold text-foreground text-sm transition-colors duration-200">
                            {task.name}
                          </h4>
                          {task.description && (
                            <p className="mt-1.5 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                              {getDescriptionText(task.description)}
                            </p>
                          )}

                          {/* Dates section */}
                          {(startDate || endDate) && (
                            <div className="mt-3 space-y-1.5">
                              {startDate && startDate > now && (
                                <div className="flex items-center gap-1.5 rounded-md bg-dynamic-blue/5 px-2 py-1 text-muted-foreground">
                                  <Clock className="h-3 w-3 shrink-0 text-dynamic-blue" />
                                  <span className="truncate font-medium text-xs">
                                    Starts {formatSmartDate(startDate)}
                                  </span>
                                </div>
                              )}
                              {endDate && (
                                <div
                                  className={cn(
                                    'flex items-center gap-1.5 rounded-md px-2 py-1',
                                    taskOverdue && !task.archived
                                      ? 'bg-dynamic-red/10 font-medium text-dynamic-red'
                                      : 'bg-dynamic-orange/5 text-muted-foreground'
                                  )}
                                >
                                  <Calendar
                                    className={cn(
                                      'h-3 w-3 shrink-0',
                                      taskOverdue && !task.archived
                                        ? 'text-dynamic-red'
                                        : 'text-dynamic-orange'
                                    )}
                                  />
                                  <span className="truncate font-medium text-xs">
                                    Due {formatSmartDate(endDate)}
                                  </span>
                                  {taskOverdue && !task.archived && (
                                    <Badge className="ml-1 h-4 bg-dynamic-red px-1.5 font-bold text-[9px] text-white tracking-wide shadow-sm">
                                      OVERDUE
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/${wsId}/tasks/boards/${task.list?.board?.id}`}
                                className="rounded-md bg-dynamic-green/10 px-2 py-1 font-medium text-dynamic-green transition-all duration-200 hover:scale-105 hover:bg-dynamic-green/20 hover:text-dynamic-green/90"
                              >
                                {task.list?.board?.name}
                              </Link>
                              <span className="text-muted-foreground">•</span>
                              <Link
                                href={`/${wsId}/tasks/boards/${task.list?.board?.id}`}
                                className="rounded-md bg-dynamic-orange/10 px-2 py-1 font-medium text-dynamic-orange transition-all duration-200 hover:scale-105 hover:bg-dynamic-orange/20 hover:text-dynamic-orange/90"
                              >
                                {task.list?.name}
                              </Link>
                            </div>
                            {task.created_at && (
                              <>
                                <span className="text-muted-foreground">•</span>
                                <TaskCreationDate
                                  creationDate={task.created_at}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col items-end gap-2.5">
                      {/* Top row: Priority and Estimation */}
                      <div className="flex items-center gap-2">
                        {task.priority && (
                          <Badge
                            className={cn(
                              'font-bold text-xs shadow-sm transition-all duration-200 hover:scale-105',
                              getPriorityColor(task.priority)
                            )}
                          >
                            {getPriorityLabel(task.priority)}
                          </Badge>
                        )}
                        {task.estimation_points && (
                          <TaskEstimationDisplay
                            points={task.estimation_points}
                            size="sm"
                            showIcon={false}
                            estimationType={task.list?.board?.estimation_type}
                          />
                        )}
                      </div>

                      {/* Labels row */}
                      {task.labels && task.labels.length > 0 && (
                        <div className="flex justify-end">
                          <TaskLabelsDisplay
                            labels={task.labels
                              .map((tl) => tl.label)
                              .filter(
                                (label): label is NonNullable<typeof label> =>
                                  label !== null
                              )}
                            size="sm"
                            maxDisplay={2}
                          />
                        </div>
                      )}

                      {/* Assignees row */}
                      {task.assignees && task.assignees.length > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="-space-x-1 flex">
                            {task.assignees.slice(0, 3).map((assignee) => (
                              <Avatar
                                key={assignee.user?.id}
                                className="h-6 w-6 ring-2 ring-background transition-all duration-200 group-hover:scale-110 group-hover:ring-dynamic-green/20"
                              >
                                <AvatarImage
                                  src={assignee.user?.avatar_url || undefined}
                                  alt={assignee.user?.display_name || 'User'}
                                />
                                <AvatarFallback className="font-semibold text-xs">
                                  {(assignee.user?.display_name || 'U')
                                    .charAt(0)
                                    .toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {task.assignees.length > 3 && (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-green/20 to-dynamic-green/10 font-bold text-dynamic-green text-xs ring-2 ring-background transition-all duration-200 group-hover:scale-110 group-hover:ring-dynamic-green/20">
                                +{task.assignees.length - 3}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-dynamic-gray/20 bg-gradient-to-br from-dynamic-gray/10 via-dynamic-gray/5 to-dynamic-slate/10 shadow-sm ring-1 ring-dynamic-gray/10">
              <Plus className="h-10 w-10 text-dynamic-gray/60" />
            </div>
            <div className="space-y-3">
              <h3 className="font-bold text-dynamic-gray text-lg">
                {t('no_recently')}
              </h3>
              <p className="mx-auto max-w-sm text-dynamic-gray/70 text-sm leading-relaxed">
                {t('no_recently_created_tasks_description')}
              </p>
            </div>
            <div className="mt-8">
              <Link href={`/${wsId}/tasks/boards`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dynamic-green/30 bg-gradient-to-r from-dynamic-green/5 to-dynamic-green/10 text-dynamic-green transition-all duration-200 hover:scale-105 hover:border-dynamic-green/40 hover:bg-dynamic-green/20 hover:shadow-md"
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
