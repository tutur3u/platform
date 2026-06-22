'use client';

import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { TaskCard } from '../../task';
import type { KanbanDeadlineSections } from './kanban-deadline-tasks';

export type KanbanDeadlineSection = keyof KanbanDeadlineSections;
export type KanbanDeadlineCollapsedState = Partial<
  Record<KanbanDeadlineSection, boolean>
>;

export interface KanbanDeadlineLabels {
  collapseSection?: (name: string) => string;
  expandSection?: (name: string) => string;
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
  onSectionCollapsedChange?: (
    section: KanbanDeadlineSection,
    collapsed: boolean
  ) => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
  onUpdate: () => void;
  optimisticUpdateInProgress: Set<string>;
  sections: KanbanDeadlineSections;
  collapsedSections?: KanbanDeadlineCollapsedState;
  deadlineNow?: number;
  selectedTasks: Set<string>;
  taskLists: TaskList[];
  isMultiSelectMode: boolean;
  workspaceId: string;
}

interface DeadlineSectionConfig {
  icon: typeof AlertTriangle;
  label: string;
  collapsedClassName: string;
  panelClassName: string;
  section: KanbanDeadlineSection;
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
  collapsed,
  config,
  deadlineNow,
  labels,
  isMultiSelectMode,
  isPersonalWorkspace,
  onClearSelection,
  onCollapsedChange,
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
  collapsed: boolean;
  config: DeadlineSectionConfig;
  deadlineNow?: number;
  labels: KanbanDeadlineLabels;
  isMultiSelectMode: boolean;
  isPersonalWorkspace: boolean;
  onClearSelection: () => void;
  onCollapsedChange?: (
    section: KanbanDeadlineSection,
    collapsed: boolean
  ) => void;
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
  const collapseLabel =
    labels.collapseSection?.(config.label) ?? `Collapse ${config.label}`;
  const expandLabel =
    labels.expandSection?.(config.label) ?? `Expand ${config.label}`;

  if (collapsed) {
    return (
      <Card
        className={cn(
          'group flex h-full w-14 shrink-0 snap-start flex-col items-center overflow-hidden rounded-xl border border-dashed transition-all duration-200 hover:shadow-md',
          config.collapsedClassName
        )}
        data-testid={`kanban-deadline-section-${config.section}-collapsed`}
      >
        <button
          type="button"
          className={cn(
            'flex h-full w-full flex-col items-center gap-3 rounded-xl px-1 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2',
            config.titleClassName
          )}
          title={expandLabel}
          aria-label={expandLabel}
          onClick={() => onCollapsedChange?.(config.section, false)}
        >
          <ChevronRight className="h-4 w-4 shrink-0" />
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center px-1 text-[10px]"
          >
            {tasks.length}
          </Badge>
          <span
            className="max-h-48 truncate font-medium text-[11px]"
            style={{ writingMode: 'vertical-rl' }}
          >
            {config.label}
          </span>
        </button>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'flex h-full w-[var(--kanban-column-width)] shrink-0 snap-start flex-col overflow-hidden rounded-xl border shadow-xs',
        config.panelClassName
      )}
      data-testid={`kanban-deadline-section-${config.section}`}
    >
      <div className="flex items-center justify-between gap-3 border-border/70 border-b p-3">
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
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={cn('h-7 w-7 p-0 hover:bg-muted/40', config.titleClassName)}
          title={collapseLabel}
          aria-label={collapseLabel}
          onClick={() => onCollapsedChange?.(config.section, true)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
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
                deadlineContext={config.section}
                deadlineNow={deadlineNow}
                sortableId={`deadline-${config.section}-${task.id}`}
                task={task}
                taskList={taskList}
                workspaceId={workspaceId}
              />
            </div>
          );
        })}
      </div>
    </Card>
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
  onSectionCollapsedChange,
  onTaskSelect,
  onUpdate,
  optimisticUpdateInProgress,
  sections,
  collapsedSections,
  deadlineNow,
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
      collapsedClassName: 'border-dynamic-red/35 bg-dynamic-red/5',
      panelClassName: 'border-dynamic-red/25 bg-dynamic-red/5',
      section: 'overdue',
      titleClassName:
        'border-dynamic-red/25 text-dynamic-red hover:bg-dynamic-red/10 focus-visible:ring-dynamic-red/40',
    },
    {
      icon: CalendarClock,
      label: labels.upcoming,
      collapsedClassName: 'border-dynamic-blue/35 bg-dynamic-blue/5',
      panelClassName: 'border-dynamic-blue/25 bg-dynamic-blue/5',
      section: 'upcoming',
      titleClassName:
        'border-dynamic-blue/25 text-dynamic-blue hover:bg-dynamic-blue/10 focus-visible:ring-dynamic-blue/40',
    },
  ];

  return (
    <div className="contents" data-testid="kanban-deadline-panels">
      {configs.map((config) => (
        <DeadlineSection
          key={config.section}
          availableLists={availableLists}
          boardId={boardId}
          bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
          collapsed={collapsedSections?.[config.section] === true}
          config={config}
          deadlineNow={deadlineNow}
          labels={labels}
          isMultiSelectMode={isMultiSelectMode}
          isPersonalWorkspace={isPersonalWorkspace}
          onClearSelection={onClearSelection}
          onCollapsedChange={onSectionCollapsedChange}
          onTaskSelect={onTaskSelect}
          onUpdate={onUpdate}
          optimisticUpdateInProgress={optimisticUpdateInProgress}
          selectedTasks={selectedTasks}
          taskLists={taskLists}
          tasks={sections[config.section]}
          workspaceId={workspaceId}
        />
      ))}
    </div>
  );
}
