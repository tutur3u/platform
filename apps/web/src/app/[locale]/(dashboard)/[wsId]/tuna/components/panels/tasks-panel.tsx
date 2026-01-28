'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useCompleteTunaTask, useTunaTasks } from '../../hooks/use-tasks';
import type { TunaTask } from '../../types/tuna';
import { TasksPanelItem } from './tasks-panel-item';

interface TasksPanelProps {
  wsId: string;
  isPersonal: boolean;
  className?: string;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  tasks: TunaTask[];
  defaultOpen?: boolean;
  completingTaskIds: Set<string>;
  onCompleteTask: (taskId: string) => void;
  onClickTask?: (taskId: string) => void;
  variant?: 'default' | 'danger';
}

function CollapsibleSection({
  title,
  icon,
  count,
  tasks,
  defaultOpen = true,
  completingTaskIds,
  onCompleteTask,
  onClickTask,
  variant = 'default',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
          'hover:bg-muted/50',
          variant === 'danger' && 'text-dynamic-red'
        )}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        {icon}
        <span>{title}</span>
        <Badge
          variant={variant === 'danger' ? 'destructive' : 'secondary'}
          className="ml-auto text-xs"
        >
          {count}
        </Badge>
      </button>

      {isOpen && (
        <div className="space-y-2 pl-2">
          {tasks.map((task) => (
            <TasksPanelItem
              key={task.id}
              task={task}
              isLoading={completingTaskIds.has(task.id)}
              onComplete={onCompleteTask}
              onClick={onClickTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TasksPanel({ wsId, isPersonal, className }: TasksPanelProps) {
  const router = useRouter();
  const { data: tasksData, isLoading } = useTunaTasks({ wsId, isPersonal });
  const completeMutation = useCompleteTunaTask({ wsId, isPersonal });
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(
    new Set()
  );

  const handleCompleteTask = useCallback(
    (taskId: string) => {
      setCompletingTaskIds((prev) => new Set(prev).add(taskId));

      completeMutation.mutate(taskId, {
        onSuccess: (data) => {
          toast.success('Task completed!', {
            description: `+${data.xp_earned} XP`,
          });
        },
        onError: (error) => {
          toast.error(error.message);
        },
        onSettled: () => {
          setCompletingTaskIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
        },
      });
    },
    [completeMutation]
  );

  // Navigate to the task detail page
  const handleClickTask = useCallback(
    (taskId: string) => {
      // Find the task to get its workspace ID
      const allTasks = [
        ...(tasksData?.overdue ?? []),
        ...(tasksData?.today ?? []),
        ...(tasksData?.upcoming ?? []),
      ];
      const task = allTasks.find((t) => t.id === taskId);

      // Use the task's workspace or fall back to current workspace
      const targetWsId = task?.ws_id || wsId;
      router.push(`/${targetWsId}/tasks/${taskId}`);
    },
    [router, tasksData, wsId]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    );
  }

  const overdue = tasksData?.overdue ?? [];
  const today = tasksData?.today ?? [];
  const upcoming = tasksData?.upcoming ?? [];
  const stats = tasksData?.stats ?? { total: 0, completed_today: 0 };

  const isEmpty = stats.total === 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Stats card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-5 w-5 text-dynamic-blue" />
            Task Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div
                className={cn(
                  'text-2xl font-bold',
                  overdue.length > 0
                    ? 'text-dynamic-red'
                    : 'text-muted-foreground'
                )}
              >
                {overdue.length}
              </div>
              <div className="text-xs text-muted-foreground">Overdue</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-orange">
                {today.length}
              </div>
              <div className="text-xs text-muted-foreground">Today</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-green">
                {stats.completed_today}
              </div>
              <div className="text-xs text-muted-foreground">Done Today</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-dynamic-green/10">
            <CheckCircle2 className="h-8 w-8 text-dynamic-green" />
          </div>
          <h3 className="mt-4 font-semibold text-lg">All caught up!</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            You have no pending tasks due soon. Great job!
          </p>
        </div>
      )}

      {/* Task sections */}
      {!isEmpty && (
        <div className="space-y-4">
          {/* Overdue */}
          <CollapsibleSection
            title="Overdue"
            icon={<AlertCircle className="h-4 w-4" />}
            count={overdue.length}
            tasks={overdue}
            defaultOpen={true}
            completingTaskIds={completingTaskIds}
            onCompleteTask={handleCompleteTask}
            onClickTask={handleClickTask}
            variant="danger"
          />

          {/* Today */}
          <CollapsibleSection
            title="Today"
            icon={<Clock className="h-4 w-4 text-dynamic-orange" />}
            count={today.length}
            tasks={today}
            defaultOpen={true}
            completingTaskIds={completingTaskIds}
            onCompleteTask={handleCompleteTask}
            onClickTask={handleClickTask}
          />

          {/* Upcoming */}
          <CollapsibleSection
            title="Upcoming"
            icon={<Calendar className="h-4 w-4 text-dynamic-blue" />}
            count={upcoming.length}
            tasks={upcoming}
            defaultOpen={false}
            completingTaskIds={completingTaskIds}
            onCompleteTask={handleCompleteTask}
            onClickTask={handleClickTask}
          />
        </div>
      )}
    </div>
  );
}
