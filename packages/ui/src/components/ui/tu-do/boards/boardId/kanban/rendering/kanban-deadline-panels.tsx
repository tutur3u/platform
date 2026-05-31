'use client';

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import type { KanbanDeadlineSections } from './kanban-deadline-tasks';

export interface KanbanDeadlineLabels {
  overdue: string;
  upcoming: string;
}

interface KanbanDeadlinePanelsProps {
  labels: KanbanDeadlineLabels;
  sections: KanbanDeadlineSections;
  selectedTasks: Set<string>;
  isMultiSelectMode: boolean;
  ticketPrefix?: string | null;
  onOpenTask: (task: Task) => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
}

interface DeadlineSectionConfig {
  icon: typeof AlertTriangle;
  label: string;
  panelClassName: string;
  section: keyof KanbanDeadlineSections;
  titleClassName: string;
}

function getTaskTicketPrefix(task: Task, fallback?: string | null) {
  if ('ticket_prefix' in task && typeof task.ticket_prefix === 'string') {
    return task.ticket_prefix;
  }

  return fallback;
}

function getTicketIdentifier(
  prefix: string | null | undefined,
  displayNumber: number
) {
  const effectivePrefix = prefix?.trim() || 'TASK';
  return `${effectivePrefix}-${displayNumber}`.toUpperCase();
}

function formatDeadlineDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function DeadlineTaskCard({
  isMultiSelectMode,
  onOpenTask,
  onTaskSelect,
  selected,
  task,
  ticketPrefix,
}: {
  isMultiSelectMode: boolean;
  onOpenTask: (task: Task) => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
  selected: boolean;
  task: Task;
  ticketPrefix?: string | null;
}) {
  const ticketIdentifier = getTicketIdentifier(
    getTaskTicketPrefix(task, ticketPrefix),
    task.display_number
  );
  const formattedDeadline = formatDeadlineDate(task.end_date);

  return (
    <button
      aria-pressed={selected}
      className={cn(
        'group w-full rounded-md border bg-background/80 p-2 text-left shadow-xs transition-colors',
        'hover:border-foreground/30 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-primary bg-primary/10 text-primary'
      )}
      onClick={(event) => {
        const isShiftOnlyHeld =
          event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;

        if (isMultiSelectMode || isShiftOnlyHeld) {
          onTaskSelect(task.id, event);
          return;
        }

        onOpenTask(task);
      }}
      type="button"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
          {selected && <CheckCircle2 className="size-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <Badge
              className="h-5 border-dynamic-cyan/25 bg-dynamic-cyan/10 px-1.5 font-semibold text-[10px] text-dynamic-cyan"
              variant="outline"
            >
              {ticketIdentifier}
            </Badge>
            {formattedDeadline && (
              <span className="inline-flex min-w-0 items-center gap-1 truncate text-muted-foreground text-xs">
                <Clock className="size-3 shrink-0" />
                <span className="truncate">{formattedDeadline}</span>
              </span>
            )}
          </span>
          <span className="mt-1 line-clamp-2 block font-medium text-foreground text-sm leading-snug">
            {task.name}
          </span>
        </span>
      </div>
    </button>
  );
}

function DeadlineSection({
  config,
  isMultiSelectMode,
  onOpenTask,
  onTaskSelect,
  selectedTasks,
  tasks,
  ticketPrefix,
}: {
  config: DeadlineSectionConfig;
  isMultiSelectMode: boolean;
  onOpenTask: (task: Task) => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
  selectedTasks: Set<string>;
  tasks: Task[];
  ticketPrefix?: string | null;
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

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {tasks.map((task) => (
          <DeadlineTaskCard
            key={task.id}
            isMultiSelectMode={isMultiSelectMode}
            onOpenTask={onOpenTask}
            onTaskSelect={onTaskSelect}
            selected={selectedTasks.has(task.id)}
            task={task}
            ticketPrefix={ticketPrefix}
          />
        ))}
      </div>
    </div>
  );
}

export function KanbanDeadlinePanels({
  isMultiSelectMode,
  labels,
  onOpenTask,
  onTaskSelect,
  sections,
  selectedTasks,
  ticketPrefix,
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
          config={config}
          isMultiSelectMode={isMultiSelectMode}
          onOpenTask={onOpenTask}
          onTaskSelect={onTaskSelect}
          selectedTasks={selectedTasks}
          tasks={sections[config.section]}
          ticketPrefix={ticketPrefix}
        />
      ))}
    </aside>
  );
}
