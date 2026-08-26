'use client';

import { Loader2 } from '@tuturuuu/icons';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { dispatchRequestOpenTask } from '@tuturuuu/ui/lib/task-open-events';
import { useTranslations } from 'next-intl';
import { TaskResultItem } from '../task-result-item';
import { addRecentTask } from '../utils/recent-items';
import type { TaskSearchResult } from '../utils/use-task-search';

interface TaskSectionProps {
  busyTaskId?: string | null;
  isLoading: boolean;
  onSelect?: () => void;
  onToggleComplete: (task: TaskSearchResult) => void;
  query: string;
  tasks: TaskSearchResult[];
  workspaceName?: string;
  wsId: string;
}

export function TaskSection({
  busyTaskId,
  isLoading,
  onSelect,
  onToggleComplete,
  query,
  tasks,
  workspaceName,
  wsId,
}: TaskSectionProps) {
  const t = useTranslations('command_palette');
  const now = new Date();

  if (isLoading) {
    return (
      <CommandGroup heading={t('tasks')}>
        <CommandItem disabled className="justify-center py-8">
          <Loader2 className="size-4 animate-spin" />
          {t('searching_tasks')}
        </CommandItem>
      </CommandGroup>
    );
  }

  if (tasks.length === 0) return null;

  const handleTaskSelect = (task: TaskSearchResult) => {
    addRecentTask(task.id, task.name, task.board_name ?? undefined);
    onSelect?.();
    dispatchRequestOpenTask({ taskId: task.id, wsId });
  };

  const heading = query.trim()
    ? t('task_results', { count: tasks.length })
    : t('recent_tasks');

  return (
    <CommandGroup
      heading={
        <div className="flex items-center justify-between gap-3">
          <span>{heading}</span>
          {workspaceName ? (
            <span className="max-w-48 truncate font-normal text-[10px] opacity-70">
              {workspaceName}
            </span>
          ) : null}
        </div>
      }
      className="px-1 py-2"
    >
      {tasks.map((task) => (
        <TaskResultItem
          key={task.id}
          task={task}
          wsId={wsId}
          now={now}
          busy={busyTaskId === task.id}
          onOpen={handleTaskSelect}
          onToggleComplete={onToggleComplete}
        />
      ))}
    </CommandGroup>
  );
}
