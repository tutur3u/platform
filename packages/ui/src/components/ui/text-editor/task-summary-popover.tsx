'use client';

import {
  Box,
  Calendar,
  CircleSlash,
  ExternalLink,
  Flag,
  Layers,
  Pencil,
  Tag,
  Users,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import type { ReactNode } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Badge } from '../badge';
import { Button } from '../button';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { TaskLabelsDisplay } from '../tu-do/shared/task-labels-display';
import { getAssigneeInitials } from '../tu-do/utils/taskColorUtils';
import {
  getPriorityIcon,
  getPriorityLabel,
} from '../tu-do/utils/taskPriorityUtils';

interface TaskSummaryPopoverProps {
  children: ReactNode;
  task: Task | null;
  taskList?: TaskList | null;
  isLoading?: boolean;
  onEdit: () => void;
  onGoToTask?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  blockedBy?: Task[];
  workspaceId?: string;
}

export function TaskSummaryPopover({
  children,
  task,
  taskList,
  isLoading = false,
  onEdit,
  onGoToTask,
  open,
  onOpenChange,
  blockedBy,
  workspaceId,
}: TaskSummaryPopoverProps) {
  if (isLoading) {
    return <>{children}</>;
  }

  if (!task) {
    return <>{children}</>;
  }

  const hasAssignees = task.assignees && task.assignees.length > 0;
  const hasLabels = task.labels && task.labels.length > 0;
  const hasProjects = task.projects && task.projects.length > 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-full min-w-60 touch-none overflow-hidden p-0 shadow-xl"
        align="start"
        sideOffset={8}
        onClick={(e) => {
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
          // Do not preventDefault on click, as it might block legitimate actions like buttons
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
          // Do not preventDefault on mousedown globally, it might prevent focus or text selection
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
        }}
      >
        <div
          className="flex flex-col text-sm"
          onClick={(e) => {
            e.stopPropagation();
            (e as any).stopImmediatePropagation?.();
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            (e as any).stopImmediatePropagation?.();
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-border border-b bg-muted/30 px-3 py-2.5">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium font-mono text-muted-foreground text-xs opacity-70">
                  #{task.display_number}
                </span>
              </div>
              <h3 className="line-clamp-2 font-semibold text-sm leading-snug">
                {task.name}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEdit();
              }}
              title="Edit task"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Description */}
          {task.description && (
            <div className="border-border/50 border-b px-3 py-2">
              <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                {task.description}
              </p>
            </div>
          )}

          {/* Properties List */}
          <div className="flex flex-col gap-3 px-3 py-3">
            {/* List / Status */}
            {taskList && (
              <div className="flex items-center gap-3">
                <div className="flex w-5 shrink-0 items-center justify-center text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'h-5 px-1.5 font-medium text-[10px]',
                    taskList.color &&
                      `border-dynamic-${taskList.color.toLowerCase()}/30 bg-dynamic-${taskList.color.toLowerCase()}/5 text-dynamic-${taskList.color.toLowerCase()}`
                  )}
                >
                  {taskList.name}
                </Badge>
              </div>
            )}

            {/* Priority */}
            {task.priority && (
              <div className="flex items-center gap-3">
                <div className="flex w-5 shrink-0 items-center justify-center text-muted-foreground">
                  <Flag className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'flex items-center justify-center',
                      task.priority === 'critical' && 'text-dynamic-red',
                      task.priority === 'high' && 'text-dynamic-orange',
                      task.priority === 'normal' && 'text-dynamic-yellow',
                      task.priority === 'low' && 'text-dynamic-blue'
                    )}
                  >
                    {getPriorityIcon(task.priority, 'h-3.5 w-3.5')}
                  </div>
                  <span className="font-medium text-xs">
                    {getPriorityLabel(task.priority)}
                  </span>
                </div>
              </div>
            )}

            {/* Dates */}
            {(task.end_date || task.completed_at) && (
              <div className="flex items-center gap-3">
                <div className="flex w-5 shrink-0 items-center justify-center text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {task.end_date && (
                    <span>
                      Due {format(new Date(task.end_date), 'MMM d, yyyy')}
                    </span>
                  )}
                  {task.end_date && task.completed_at && (
                    <span className="text-muted-foreground opacity-50">•</span>
                  )}
                  {task.completed_at && (
                    <span className="text-muted-foreground">
                      Completed{' '}
                      {format(new Date(task.completed_at), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Assignees */}
            {hasAssignees && (
              <div className="flex items-center gap-3">
                <div className="flex w-5 shrink-0 items-center justify-center text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center -space-x-1.5 transition-all hover:space-x-0.5">
                  {task.assignees!.slice(0, 5).map((assignee) => (
                    <Avatar
                      key={assignee.id}
                      className="h-5 w-5 border border-background ring-1 ring-border transition-transform hover:z-10 hover:scale-110"
                      title={assignee.display_name || 'Unknown'}
                    >
                      {assignee.avatar_url && (
                        <AvatarImage
                          src={assignee.avatar_url}
                          alt={assignee.display_name || 'User'}
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <AvatarFallback className="font-bold text-[8px]">
                        {getAssigneeInitials(assignee.display_name, null)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {task.assignees!.length > 5 && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-background bg-muted font-bold text-[8px] ring-1 ring-border">
                      +{task.assignees!.length - 5}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Labels */}
            {hasLabels && (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />
                </div>
                <TaskLabelsDisplay
                  labels={[...task.labels!].sort((a, b) =>
                    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
                  )}
                  size="sm"
                  showIcon={false}
                  className="flex-1"
                />
              </div>
            )}

            {/* Projects */}
            {hasProjects && (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                  <Box className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {task.projects!.map((project) => (
                    <Badge
                      key={project.id}
                      variant="outline"
                      className="h-5 border-dynamic-cyan/20 bg-dynamic-cyan/10 px-1.5 font-medium text-[10px] text-dynamic-cyan"
                    >
                      {project.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Blocked By */}
            {blockedBy && blockedBy.length > 0 && (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-dynamic-red">
                  <CircleSlash className="h-3.5 w-3.5" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="mb-0.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                    Blocked by
                  </span>
                  {blockedBy.map((blocker) => (
                    <a
                      key={blocker.id}
                      href={`/${workspaceId || '_'}/tasks/${blocker.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-1.5 truncate text-xs transition-colors hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground opacity-70 group-hover:text-foreground">
                        #{blocker.display_number}
                      </span>
                      <span className="truncate">{blocker.name}</span>
                      <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer - Go to task */}
          {onGoToTask && (
            <div className="mt-1 border-border border-t p-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onGoToTask();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-sm p-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open task details
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
