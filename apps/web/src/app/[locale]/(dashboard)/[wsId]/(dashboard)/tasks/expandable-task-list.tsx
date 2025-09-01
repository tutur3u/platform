'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ChevronDown, ChevronUp, UserRound } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useState } from 'react';
import TaskDueDate from './task-due-date';

interface Task {
  id: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  end_date?: string | null;
  list: {
    id: string;
    name: string | null;
    board: {
      id: string;
      name: string | null;
      ws_id: string;
      workspaces: {
        id: string;
        name: string | null;
        personal: boolean | null;
      } | null;
    } | null;
  } | null;
  assignees: Array<{
    user: {
      id: string;
      display_name: string | null;
      avatar_url?: string | null;
    } | null;
  }> | null;
}

interface ExpandableTaskListProps {
  tasks: Task[];
  isPersonal?: boolean;
  initialLimit?: number;
}

export default function ExpandableTaskList({
  tasks,
  isPersonal = false,
  initialLimit = 5,
}: ExpandableTaskListProps) {
  const [showAll, setShowAll] = useState(false);
  const displayedTasks = showAll ? tasks : tasks.slice(0, initialLimit);
  const hasMoreTasks = tasks.length > initialLimit;

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case 'critical':
      case 'urgent':
        return 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20';
      case 'high':
        return 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20';
      case 'medium':
        return 'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20';
      case 'low':
        return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20';
      default:
        return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20';
    }
  };

  return (
    <div className="space-y-3">
      {displayedTasks.map((task) => (
        <div
          key={task.id}
          className="group rounded-xl border border-dynamic-orange/10 bg-gradient-to-br from-dynamic-orange/5 to-dynamic-red/5 p-4 transition-all duration-300"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <h4 className="line-clamp-1 font-semibold text-sm">
                    {task.name}
                  </h4>
                  {task.description && (
                    <p className="mt-1 line-clamp-2 text-dynamic-orange/70 text-xs">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-dynamic-orange/60 text-xs">
                    {isPersonal && task.list?.board?.ws_id && (
                      <>
                        <Link
                          href={`/${task.list.board.ws_id}`}
                          className={cn(
                            'font-semibold transition-colors hover:underline',
                            task.list?.board?.workspaces?.personal
                              ? 'text-dynamic-purple hover:text-dynamic-purple/80'
                              : 'text-dynamic-blue hover:text-dynamic-blue/80'
                          )}
                        >
                          {task.list?.board?.workspaces?.personal ? (
                            <UserRound className="h-3 w-3" />
                          ) : (
                            task.list?.board?.workspaces?.name
                          )}
                        </Link>
                        <span>•</span>
                      </>
                    )}
                    {task.list?.board?.id && task.list?.board?.ws_id && (
                      <>
                        <Link
                          href={`/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`}
                          className="font-semibold text-dynamic-green transition-colors hover:text-dynamic-green/80 hover:underline"
                        >
                          {task.list?.board?.name || 'Board'}
                        </Link>
                        <span>•</span>
                      </>
                    )}
                    {task.list?.name &&
                      task.list?.board?.id &&
                      task.list?.board?.ws_id && (
                        <>
                          <Link
                            href={`/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`}
                            className="font-semibold text-dynamic-orange transition-colors hover:text-dynamic-orange/80 hover:underline"
                          >
                            {task.list.name}
                          </Link>
                          {task.end_date && <span>•</span>}
                        </>
                      )}
                    {task.end_date && <TaskDueDate dueDate={task.end_date} />}
                  </div>
                </div>
              </div>
            </div>
            <div className="ml-3 flex flex-col items-end gap-2">
              {task.priority && (
                <Badge
                  className={cn(
                    'font-semibold text-xs transition-colors',
                    getPriorityColor(task.priority)
                  )}
                >
                  {task.priority}
                </Badge>
              )}
              <div className="text-dynamic-orange/60 text-xs">
                {task.assignees && task.assignees.length > 1 && (
                  <span className="font-medium">
                    +{task.assignees.length - 1} others
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {hasMoreTasks && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="h-8 px-3 transition-colors hover:bg-dynamic-orange/10 hover:text-dynamic-orange"
          >
            {showAll ? (
              <>
                <ChevronUp className="mr-1 h-3 w-3" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-3 w-3" />
                Show {tasks.length - initialLimit} More
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
