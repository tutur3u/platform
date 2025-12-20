'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useRouter } from 'next/navigation';
import { addRecentTask } from '../utils/recent-items';
import type { TaskSearchResult } from '../utils/use-task-search';

dayjs.extend(relativeTime);

interface TaskSectionProps {
  tasks: TaskSearchResult[];
  isLoading: boolean;
  wsId: string | null;
  workspaceName?: string;
  query: string;
  onSelect?: () => void;
}

// Priority icon mapping
const priorityConfig = {
  critical: {
    icon: AlertTriangle,
    color: 'text-dynamic-red',
    bgColor: 'bg-dynamic-red/10',
    label: 'Critical',
  },
  high: {
    icon: ArrowUp,
    color: 'text-dynamic-orange',
    bgColor: 'bg-dynamic-orange/10',
    label: 'High',
  },
  normal: {
    icon: ArrowRight,
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/10',
    label: 'Normal',
  },
  low: {
    icon: ArrowDown,
    color: 'text-dynamic-gray',
    bgColor: 'bg-dynamic-gray/10',
    label: 'Low',
  },
};

// List status configuration
const listStatusConfig = {
  not_started: {
    color: 'text-dynamic-gray',
    bgColor: 'bg-dynamic-gray/10',
    label: 'Not Started',
  },
  active: {
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/10',
    label: 'Active',
  },
  done: {
    color: 'text-dynamic-green',
    bgColor: 'bg-dynamic-green/10',
    label: 'Done',
  },
  closed: {
    color: 'text-dynamic-purple',
    bgColor: 'bg-dynamic-purple/10',
    label: 'Closed',
  },
};

export function TaskSection({
  tasks,
  isLoading,
  wsId,
  workspaceName,
  query,
  onSelect,
}: TaskSectionProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <CommandGroup heading="Tasks">
        <CommandItem
          disabled
          className="justify-center text-muted-foreground text-sm"
        >
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            Searching tasks...
          </div>
        </CommandItem>
      </CommandGroup>
    );
  }

  if (tasks.length === 0) {
    return query.trim() ? (
      <CommandGroup heading="Tasks">
        <CommandItem
          disabled
          className="justify-center text-muted-foreground text-sm"
        >
          No tasks found matching "{query}"
        </CommandItem>
      </CommandGroup>
    ) : null;
  }

  const handleTaskSelect = (task: TaskSearchResult) => {
    if (!wsId) return;

    // Track in recent items
    addRecentTask(task.id, task.name, task.board_name);

    // Navigate to task (assuming task detail page exists)
    // Adjust this URL based on your routing structure
    router.push(`/${wsId}/tasks/${task.id}`);

    // Close command palette
    onSelect?.();
  };

  const headingText = query.trim()
    ? `Tasks${workspaceName ? ` • ${workspaceName}` : ''}`
    : `Recent Tasks${workspaceName ? ` • ${workspaceName}` : ''}`;

  return (
    <CommandGroup heading={headingText}>
      {tasks.map((task) => {
        const priority = task.priority ? priorityConfig[task.priority] : null;
        const listStatus = task.list_status
          ? listStatusConfig[task.list_status as keyof typeof listStatusConfig]
          : null;
        const isOverdue =
          task.end_date && dayjs(task.end_date).isBefore(dayjs());
        const isDueSoon =
          !isOverdue &&
          task.end_date &&
          dayjs(task.end_date).diff(dayjs(), 'day') <= 3;

        return (
          <CommandItem
            key={task.id}
            value={`task-${task.id}-${task.name}`}
            onSelect={() => handleTaskSelect(task)}
            className="flex items-start gap-3 py-3"
          >
            {/* Status Icon */}
            <div className="mt-0.5 shrink-0">
              {task.completed ? (
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {/* Content */}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {/* Task Name */}
              <div className="flex items-start gap-2">
                <span
                  className={`flex-1 font-medium leading-tight ${task.completed ? 'line-through opacity-60' : ''}`}
                >
                  {task.name}
                </span>
                {task.is_assigned_to_current_user && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Assigned to you
                  </Badge>
                )}
              </div>

              {/* Board and List Context */}
              <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                {task.board_name && (
                  <>
                    <span>{task.board_name}</span>
                    {task.list_name && (
                      <>
                        <span>›</span>
                        <span>{task.list_name}</span>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Metadata Row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* List Status */}
                {listStatus && (
                  <div
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${listStatus.bgColor}`}
                  >
                    <Circle
                      className={`h-2 w-2 fill-current ${listStatus.color}`}
                    />
                    <span className={listStatus.color}>{listStatus.label}</span>
                  </div>
                )}

                {/* Priority */}
                {priority && (
                  <div
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${priority.bgColor}`}
                  >
                    <priority.icon className={`h-3 w-3 ${priority.color}`} />
                    <span className={priority.color}>{priority.label}</span>
                  </div>
                )}

                {/* Due Date */}
                {task.end_date && (
                  <div
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
                      isOverdue
                        ? 'bg-dynamic-red/10 text-dynamic-red'
                        : isDueSoon
                          ? 'bg-dynamic-orange/10 text-dynamic-orange'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    <span>
                      {isOverdue ? 'Overdue' : dayjs(task.end_date).fromNow()}
                    </span>
                  </div>
                )}

                {/* Created Date */}
                {task.created_at && (
                  <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                    <Calendar className="h-3 w-3" />
                    <span>Created {dayjs(task.created_at).fromNow()}</span>
                  </div>
                )}

                {/* Assignees */}
                {task.assignees && task.assignees.length > 0 && (
                  <div className="flex -space-x-1">
                    {task.assignees.slice(0, 3).map((assignee) => (
                      <div
                        key={assignee.id}
                        className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-[10px]"
                        title={assignee.display_name || 'User'}
                      >
                        {assignee.display_name?.[0]?.toUpperCase() || '?'}
                      </div>
                    ))}
                    {task.assignees.length > 3 && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px]">
                        +{task.assignees.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* External Link Icon */}
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
