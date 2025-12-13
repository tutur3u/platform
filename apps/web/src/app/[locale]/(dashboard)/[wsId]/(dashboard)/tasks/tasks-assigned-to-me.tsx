import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Flame,
  Sparkles,
  TrendingUp,
  UserRoundCheck,
  UserStar,
  Zap,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { isPast, isToday, isTomorrow } from 'date-fns';
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
    completed_at: task.task_completed_at,
    closed_at: task.task_closed_at,
    deleted_at: task.task_deleted_at,
    estimation_points: task.task_estimation_points,
    created_at: task.task_created_at,
  }));

  // Fetch related data for all tasks
  const taskIds = allTasks?.map((t) => t.id) || [];

  // Merge per-user scheduling settings for the viewer.
  const schedulingByTaskId = new Map<
    string,
    {
      total_duration: number | null;
      is_splittable: boolean | null;
      min_split_duration_minutes: number | null;
      max_split_duration_minutes: number | null;
      calendar_hours: string | null;
      auto_schedule: boolean | null;
    }
  >();
  if (taskIds.length > 0) {
    const { data: schedulingRows } = await (supabase as any)
      .from('task_user_scheduling_settings')
      .select(
        `
        task_id,
        total_duration,
        is_splittable,
        min_split_duration_minutes,
        max_split_duration_minutes,
        calendar_hours,
        auto_schedule
      `
      )
      .eq('user_id', userId)
      .in('task_id', taskIds);
    (schedulingRows as any[] | null)?.forEach((r) => {
      if (!r?.task_id) return;
      schedulingByTaskId.set(r.task_id, {
        total_duration: r.total_duration ?? null,
        is_splittable: r.is_splittable ?? null,
        min_split_duration_minutes: r.min_split_duration_minutes ?? null,
        max_split_duration_minutes: r.max_split_duration_minutes ?? null,
        calendar_hours: r.calendar_hours ?? null,
        auto_schedule: r.auto_schedule ?? null,
      });
    });
  }

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
        icon,
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
      ...(schedulingByTaskId.get(task.id) ?? {}),
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

  // Calculate task statistics
  const stats = {
    total: assignedTasks?.length || 0,
    overdue: 0,
    dueToday: 0,
    dueTomorrow: 0,
    upcoming: 0,
    critical: 0,
    high: 0,
  };

  assignedTasks?.forEach((task) => {
    if (task.end_date) {
      const endDate = new Date(task.end_date);
      if (isPast(endDate) && !isToday(endDate)) {
        stats.overdue++;
      } else if (isToday(endDate)) {
        stats.dueToday++;
      } else if (isTomorrow(endDate)) {
        stats.dueTomorrow++;
      }
    }
    if (task.priority === 'critical') stats.critical++;
    if (task.priority === 'high') stats.high++;
  });

  return (
    <Card className="group overflow-hidden border-dynamic-orange/20 bg-linear-to-br from-card via-card to-dynamic-orange/5 shadow-lg ring-1 ring-dynamic-orange/10 transition-all duration-300 hover:border-dynamic-orange/30 hover:shadow-xl hover:ring-dynamic-orange/20">
      {/* Enhanced Header with Stats */}
      <CardHeader className="space-y-0 border-dynamic-orange/20 border-b bg-linear-to-br from-dynamic-orange/10 via-dynamic-orange/5 to-transparent p-6 backdrop-blur-sm">
        {/* Title Row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-2xl bg-dynamic-orange/20 blur-xl" />
              <div className="relative flex items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-orange via-dynamic-orange/90 to-dynamic-red p-3 shadow-lg ring-2 ring-dynamic-orange/30">
                <UserStar className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col">
              <CardTitle className="flex items-center gap-2 font-bold text-xl">
                <span className="bg-linear-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                  {t('my_tasks')}
                </span>
                {stats.total > 0 && (
                  <Badge
                    variant="secondary"
                    className="fade-in slide-in-from-left-2 ml-1 animate-in bg-dynamic-orange/15 font-bold text-dynamic-orange ring-1 ring-dynamic-orange/30"
                  >
                    {stats.total}
                  </Badge>
                )}
              </CardTitle>
              <p className="mt-1 text-muted-foreground text-xs">
                {stats.total === 0
                  ? t('no_tasks_assigned')
                  : stats.total === 1
                    ? t('one_task_attention')
                    : t('multiple_tasks_attention', { count: stats.total })}
              </p>
            </div>
          </div>

          <Link href={`/${wsId}/tasks`}>
            <Button
              variant="outline"
              size="sm"
              className="group/btn h-9 border-dynamic-orange/30 bg-background/50 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:border-dynamic-orange hover:bg-dynamic-orange/10 hover:text-dynamic-orange hover:shadow-md"
            >
              <UserRoundCheck className="mr-2 h-4 w-4 transition-transform group-hover/btn:scale-110" />
              {t('view_all')}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
            </Button>
          </Link>
        </div>

        {/* Quick Stats - Only show items with values > 0 */}
        {(() => {
          const statItems = [
            stats.overdue > 0 && {
              key: 'overdue',
              value: stats.overdue,
              label: t('stat_overdue'),
              color: 'red',
              icon: (
                <AlertCircle className="h-4 w-4 text-dynamic-red lg:h-4.5 lg:w-4.5" />
              ),
            },
            stats.dueToday > 0 && {
              key: 'dueToday',
              value: stats.dueToday,
              label: t('stat_due_today'),
              color: 'orange',
              icon: (
                <Flame className="h-4 w-4 text-dynamic-orange lg:h-4.5 lg:w-4.5" />
              ),
            },
            stats.dueTomorrow > 0 && {
              key: 'dueTomorrow',
              value: stats.dueTomorrow,
              label: t('stat_tomorrow'),
              color: 'blue',
              icon: (
                <Calendar className="h-4 w-4 text-dynamic-blue lg:h-4.5 lg:w-4.5" />
              ),
            },
            (stats.critical > 0 || stats.high > 0) && {
              key: 'highPriority',
              value: stats.critical + stats.high,
              label: t('stat_high_priority'),
              color: 'purple',
              icon: (
                <Zap className="h-4 w-4 text-dynamic-purple lg:h-4.5 lg:w-4.5" />
              ),
            },
          ].filter(Boolean) as {
            key: string;
            value: number;
            label: string;
            color: string;
            icon: React.ReactNode;
          }[];

          if (statItems.length === 0) return null;

          return (
            <div
              className={cn(
                'mt-4 grid gap-2 lg:gap-3',
                statItems.length === 1 && 'grid-cols-1',
                statItems.length === 2 && 'grid-cols-2',
                statItems.length === 3 && 'grid-cols-3',
                statItems.length === 4 && 'grid-cols-2 2xl:grid-cols-4'
              )}
            >
              {statItems.map((stat) => (
                <div
                  key={stat.key}
                  className={cn(
                    'group/stat flex items-center gap-2 rounded-lg border p-2.5 transition-all hover:shadow-md lg:p-3',
                    stat.color === 'red' &&
                      'border-dynamic-red/20 bg-dynamic-red/5 hover:border-dynamic-red/30 hover:bg-dynamic-red/10',
                    stat.color === 'orange' &&
                      'border-dynamic-orange/20 bg-dynamic-orange/5 hover:border-dynamic-orange/30 hover:bg-dynamic-orange/10',
                    stat.color === 'blue' &&
                      'border-dynamic-blue/20 bg-dynamic-blue/5 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/10',
                    stat.color === 'purple' &&
                      'border-dynamic-purple/20 bg-dynamic-purple/5 hover:border-dynamic-purple/30 hover:bg-dynamic-purple/10'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg ring-1 transition-all group-hover/stat:scale-110 lg:h-9 lg:w-9',
                      stat.color === 'red' &&
                        'bg-dynamic-red/20 ring-dynamic-red/30',
                      stat.color === 'orange' &&
                        'bg-dynamic-orange/20 ring-dynamic-orange/30',
                      stat.color === 'blue' &&
                        'bg-dynamic-blue/20 ring-dynamic-blue/30',
                      stat.color === 'purple' &&
                        'bg-dynamic-purple/20 ring-dynamic-purple/30'
                    )}
                  >
                    {stat.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'truncate font-bold text-lg lg:text-xl',
                        stat.color === 'red' && 'text-dynamic-red',
                        stat.color === 'orange' && 'text-dynamic-orange',
                        stat.color === 'blue' && 'text-dynamic-blue',
                        stat.color === 'purple' && 'text-dynamic-purple'
                      )}
                    >
                      {stat.value}
                    </div>
                    <div
                      className={cn(
                        'truncate font-medium text-[10px] uppercase tracking-wide lg:text-xs',
                        stat.color === 'red' && 'text-dynamic-red/70',
                        stat.color === 'orange' && 'text-dynamic-orange/70',
                        stat.color === 'blue' && 'text-dynamic-blue/70',
                        stat.color === 'purple' && 'text-dynamic-purple/70'
                      )}
                    >
                      {stat.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </CardHeader>

      {/* Content Section */}
      <CardContent className="p-6">
        {assignedTasks && assignedTasks.length > 0 ? (
          <div className="space-y-4">
            <ExpandableTaskList
              tasks={assignedTasks as any}
              isPersonal={isPersonal}
            />
          </div>
        ) : (
          /* Enhanced Empty State */
          <div className="py-16 text-center">
            {/* Illustration */}
            <div className="relative mx-auto mb-8 w-fit">
              <div className="absolute inset-0 animate-pulse rounded-full bg-dynamic-orange/20 blur-2xl" />
              <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-4 border-dynamic-orange/20 bg-linear-to-br from-dynamic-orange/10 via-dynamic-orange/5 to-transparent shadow-xl ring-4 ring-dynamic-orange/10">
                <div className="absolute inset-0 animate-spin-slow rounded-full border-dynamic-orange/30 border-t-4" />
                <CheckCircle2 className="h-16 w-16 text-dynamic-orange/40" />
              </div>
            </div>

            {/* Content */}
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5 text-dynamic-orange" />
                  <h3 className="bg-linear-to-r from-foreground to-foreground/70 bg-clip-text font-bold text-transparent text-xl">
                    {t('no_tasks_personal')}
                  </h3>
                </div>
                <p className="mx-auto max-w-md text-muted-foreground text-sm leading-relaxed">
                  {t('no_tasks_assigned_personal')}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href={`/${wsId}/tasks`}>
                  <Button
                    variant="default"
                    size="default"
                    className="group/btn h-10 bg-linear-to-r from-dynamic-orange to-dynamic-orange/90 shadow-lg transition-all duration-200 hover:scale-105 hover:from-dynamic-orange hover:to-dynamic-red hover:shadow-xl"
                  >
                    <TrendingUp className="mr-2 h-4 w-4 transition-transform group-hover/btn:scale-110" />
                    {t('view_tasks')}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                  </Button>
                </Link>
              </div>

              {/* Quick Tips */}
              <div className="mx-auto mt-8 max-w-lg space-y-2 rounded-xl border border-dynamic-orange/20 bg-dynamic-orange/5 p-4 text-left">
                <div className="mb-2 flex items-center gap-2 text-dynamic-orange">
                  <Sparkles className="h-4 w-4" />
                  <span className="font-semibold text-sm">
                    {t('quick_tip')}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t('quick_tip_description')}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
