'use client';

import { AlertTriangle, CalendarClock } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { TaskCard } from '../../task';
import type { KanbanDeadlineSections } from './kanban-deadline-tasks';

export interface KanbanDeadlineLabels {
  overdue: string;
  upcoming: string;
}

interface KanbanDeadlinePanelsProps {
  availableLists: TaskList[];
  boardId: string;
  bulkUpdateCustomDueDate: (date: Date | null) => Promise<void>;
  isPersonalWorkspace: boolean;
  labels: KanbanDeadlineLabels;
  onClearSelection: () => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
  onUpdate: () => void;
  optimisticUpdateInProgress: Set<string>;
  sections: KanbanDeadlineSections;
  selectedTasks: Set<string>;
  taskLists: TaskList[];
  isMultiSelectMode: boolean;
  workspaceId: string;
}

interface DeadlineSectionConfig {
  icon: typeof AlertTriangle;
  label: string;
  panelClassName: string;
  section: keyof KanbanDeadlineSections;
  titleClassName: string;
}

function getFallbackTaskList(lists: TaskList[]) {
  return (
    lists.find((list) => list.status === 'active') ??
    lists.find((list) => list.status === 'not_started') ??
    lists[0]
  );
}

function getTaskListForDeadlineTask(task: Task, lists: TaskList[]) {
  return (
    lists.find((list) => String(list.id) === String(task.list_id)) ??
    getFallbackTaskList(lists)
  );
}

function DeadlineSection({
  availableLists,
  boardId,
  bulkUpdateCustomDueDate,
  config,
  isMultiSelectMode,
  isPersonalWorkspace,
  onClearSelection,
  onTaskSelect,
  onUpdate,
  optimisticUpdateInProgress,
  selectedTasks,
  taskLists,
  tasks,
  workspaceId,
}: {
  availableLists: TaskList[];
  boardId: string;
  bulkUpdateCustomDueDate: (date: Date | null) => Promise<void>;
  config: DeadlineSectionConfig;
  isMultiSelectMode: boolean;
  isPersonalWorkspace: boolean;
  onClearSelection: () => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
  onUpdate: () => void;
  optimisticUpdateInProgress: Set<string>;
  selectedTasks: Set<string>;
  taskLists: TaskList[];
  tasks: Task[];
  workspaceId: string;
}) {
  if (tasks.length === 0) return null;

  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border shadow-xs',
        config.panelClassName
      )}
    >
      <div className="flex items-center justify-between gap-3 border-border/70 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'inline-flex size-6 shrink-0 items-center justify-center rounded-md border bg-background/70',
              config.titleClassName
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <h3
            className={cn(
              'truncate font-semibold text-sm',
              config.titleClassName
            )}
          >
            {config.label}
          </h3>
        </div>
        <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
          {tasks.length}
        </Badge>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {tasks.map((task) => {
          const taskList = getTaskListForDeadlineTask(task, taskLists);

          return (
            <div
              key={task.id}
              className="shrink-0"
              data-testid={`kanban-deadline-task-card-${task.id}`}
            >
              <TaskCard
                availableLists={availableLists}
                boardId={boardId}
                bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
                dragDisabled
                isMultiSelectMode={isMultiSelectMode}
                isPersonalWorkspace={isPersonalWorkspace}
                isSelected={selectedTasks.has(task.id)}
                onClearSelection={onClearSelection}
                onSelect={onTaskSelect}
                onUpdate={onUpdate}
                optimisticUpdateInProgress={optimisticUpdateInProgress}
                selectedTasks={selectedTasks}
                sortableId={`deadline-${config.section}-${task.id}`}
                task={task}
                taskList={taskList}
                workspaceId={workspaceId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function KanbanDeadlinePanels({
  availableLists,
  boardId,
  bulkUpdateCustomDueDate,
  isMultiSelectMode,
  isPersonalWorkspace,
  labels,
  onClearSelection,
  onTaskSelect,
  onUpdate,
  optimisticUpdateInProgress,
  sections,
  selectedTasks,
  taskLists,
  workspaceId,
}: KanbanDeadlinePanelsProps) {
  if (sections.overdue.length === 0 && sections.upcoming.length === 0) {
    return null;
  }

  const configs: DeadlineSectionConfig[] = [
    {
      icon: AlertTriangle,
      label: labels.overdue,
      panelClassName: 'border-dynamic-red/25 bg-dynamic-red/5',
      section: 'overdue',
      titleClassName: 'border-dynamic-red/25 text-dynamic-red',
    },
    {
      icon: CalendarClock,
      label: labels.upcoming,
      panelClassName: 'border-dynamic-blue/25 bg-dynamic-blue/5',
      section: 'upcoming',
      titleClassName: 'border-dynamic-blue/25 text-dynamic-blue',
    },
  ];

  return (
    <aside
      className="flex h-full w-[18rem] shrink-0 snap-start flex-col gap-3 md:w-80"
      data-testid="kanban-deadline-panels"
    >
      {configs.map((config) => (
        <DeadlineSection
          key={config.section}
          availableLists={availableLists}
          boardId={boardId}
          bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
          config={config}
          isMultiSelectMode={isMultiSelectMode}
          isPersonalWorkspace={isPersonalWorkspace}
          onClearSelection={onClearSelection}
          onTaskSelect={onTaskSelect}
          onUpdate={onUpdate}
          optimisticUpdateInProgress={optimisticUpdateInProgress}
          selectedTasks={selectedTasks}
          taskLists={taskLists}
          tasks={sections[config.section]}
          workspaceId={workspaceId}
        />
      ))}
    </aside>
  );
}
