'use client';

import {
    AlertTriangle,
    Calendar,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    LayoutGrid,
    LayoutList,
} from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { calculateOverdueDays } from '@tuturuuu/utils/task-helpers';
import { useState } from 'react';

interface TaskItem {
  id: string;
  name: string;
  description?: string;
  priority?: TaskPriority | null;
  end_date?: string | null;
  boardId: string;
  boardName: string;
  listId: string;
  listName: string;
  list_id: string;
  boardHref: string;
  archived: boolean;
  listStatus: TaskBoardStatus;
  created_at: string;
  assignees?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
    handle?: string;
  }[];
}

interface TaskGroupProps {
  title: string;
  icon: React.ReactNode;
  tasks: Array<TaskItem>;
  count: number;
  onTaskClick: (task: TaskItem) => void;
}

export function TaskGroup({
  title,
  icon,
  tasks,
  count,
  onTaskClick,
}: TaskGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Early return after all hooks are declared
  if (count === 0) return null;

  const toggleTaskExpansion = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-between p-3 hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            {icon}
            <span className="font-medium">{title}</span>
            <Badge variant="secondary" className="ml-2">
              {count}
            </Badge>
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-2 pt-2">
        {tasks.map((task) => {
          const isExpanded = expandedTasks.has(task.id);
          const hasLongContent =
            task.name.length > 60 ||
            (task.description && task.description.length > 100);

          return (
            <Card
              key={task.id}
              className="group cursor-pointer p-4 transition-all duration-200 hover:bg-muted/50 hover:shadow-sm"
              onClick={() => onTaskClick(task)}
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1 space-y-3">
                  {/* Task Title and Priority */}
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h4
                        className={cn(
                          'font-medium text-sm leading-relaxed transition-all duration-200',
                          isExpanded ? 'line-clamp-none' : 'line-clamp-2'
                        )}
                        title={task.name}
                      >
                        {task.name}
                      </h4>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-2">
                      {task.priority === 'critical' && (
                        <Badge
                          variant="destructive"
                          className="whitespace-nowrap text-xs"
                        >
                          🔥 Urgent
                        </Badge>
                      )}
                      {task.priority === 'high' && (
                        <Badge
                          variant="secondary"
                          className="whitespace-nowrap text-xs"
                        >
                          ⚡ High
                        </Badge>
                      )}
                      {task.priority === 'normal' && (
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap text-xs"
                        >
                          📋 Medium
                        </Badge>
                      )}
                      {task.priority === 'low' && (
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap text-xs"
                        >
                          📝 Low
                        </Badge>
                      )}

                      {/* Expand/Collapse button for long content */}
                      {hasLongContent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          onClick={(e) => toggleTaskExpansion(task.id, e)}
                          title={
                            isExpanded
                              ? 'Collapse task details'
                              : 'Expand task details'
                          }
                          aria-label={
                            isExpanded
                              ? 'Collapse task details'
                              : 'Expand task details'
                          }
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Task Description */}
                  {task.description && (
                    <div className="text-muted-foreground text-xs">
                      <p
                        className={cn(
                          'whitespace-pre-line leading-relaxed transition-all duration-200',
                          isExpanded
                            ? 'scrollbar-none group-hover:scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/30 group-hover:scrollbar-thumb-muted-foreground/50 line-clamp-none max-h-32 overflow-y-auto'
                            : 'line-clamp-2'
                        )}
                        title={task.description}
                      >
                        {task.description}
                      </p>
                    </div>
                  )}

                  {/* Task Metadata */}
                  <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                    <span className="flex min-w-0 items-center gap-1">
                      <LayoutGrid className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate" title={task.boardName}>
                        {task.boardName}
                      </span>
                    </span>

                    <span className="flex min-w-0 items-center gap-1">
                      <LayoutList className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate" title={task.listName}>
                        {task.listName}
                      </span>
                    </span>

                    {task.end_date && (
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span>
                          {new Date(task.end_date).toLocaleDateString()}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Overdue Warning */}
                  {task.end_date &&
                    new Date(task.end_date) < new Date() &&
                    !task.archived &&
                    task.listStatus !== 'done' &&
                    task.listStatus !== 'closed' && (
                      <div className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 dark:bg-red-900/20">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        <span className="font-medium text-red-600 text-xs dark:text-red-400">
                          Overdue by{' '}
                          {typeof task.end_date === 'string'
                            ? calculateOverdueDays(task.end_date)
                            : 0}{' '}
                          days
                        </span>
                      </div>
                    )}
                </div>

                {/* Action Button */}
                <div className="flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 opacity-60 transition-opacity group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick(task);
                    }}
                    title="View task details"
                    aria-label="View task details"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
