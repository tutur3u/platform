'use client';

import { Activity, AlertTriangle, Calendar, Clock, X } from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useRef } from 'react';

interface TaskDetailCardProps {
  clickCardVisible: boolean;
  clickedTask: {
    id: string;
    name: string;
    description?: string;
    status: string;
    boardName?: string;
    listName?: string;
    createdDate?: Date;
    end_date?: string;
    priority?: TaskPriority;
    assignee_name?: string;
  } | null;
  clickCardPosition: { x: number; y: number };
  clickedTaskDuration: string;
  handleCloseClick: () => void;
}

export function TaskDetailCard({
  clickCardVisible,
  clickedTask,
  clickCardPosition,
  clickedTaskDuration,
  handleCloseClick,
}: TaskDetailCardProps) {
  const clickCardRef = useRef<HTMLDivElement>(null);

  if (!clickCardVisible || !clickedTask) {
    return null;
  }

  return (
    <>
      {/* Subtle backdrop */}
      <button
        type="button"
        className="fixed inset-0 z-[9998] bg-black/5 backdrop-blur-[1px]"
        onClick={handleCloseClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleCloseClick();
          }
        }}
        aria-label="Close task details"
      />

      <div
        ref={clickCardRef}
        className="slide-in-from-bottom-2 fixed z-[9999] max-w-sm animate-in rounded-lg border border-gray-200 bg-white shadow-xl duration-200 dark:border-gray-700 dark:bg-gray-900"
        style={{
          left: Math.max(
            10,
            Math.min(clickCardPosition.x, window.innerWidth - 350)
          ),
          top: Math.max(
            10,
            Math.min(clickCardPosition.y, window.innerHeight - 200)
          ),
        }}
      >
        {/* Compact Header */}
        <div className="rounded-t-lg border-gray-100 border-b bg-gradient-to-r from-blue-50 to-indigo-50 p-3 dark:border-gray-800 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="truncate font-semibold text-gray-800 text-sm dark:text-gray-100">
                {clickedTask.name}
              </h4>
              <div className="mt-1 flex items-center gap-1">
                <Badge variant="outline" className="px-1 py-0 text-xs">
                  {clickedTask.boardName || 'Unknown Board'}
                </Badge>
                <span className="text-muted-foreground text-xs">•</span>
                <Badge variant="outline" className="px-1 py-0 text-xs">
                  {clickedTask.listName || 'Unknown List'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'font-medium text-xs',
                  clickedTask.status === 'done' &&
                    'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400',
                  clickedTask.status === 'closed' &&
                    'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
                  clickedTask.status === 'active' &&
                    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
                  clickedTask.status === 'not_started' &&
                    'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                )}
              >
                {clickedTask.status === 'done' ? (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                    Done
                  </span>
                ) : clickedTask.status === 'closed' ? (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                    Closed
                  </span>
                ) : clickedTask.status === 'active' ? (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"></span>
                    Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                    Pending
                  </span>
                )}
              </Badge>
              <button
                type="button"
                onClick={handleCloseClick}
                className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Compact Content */}
        <div className="space-y-2 p-3">
          {clickedTask.description && (
            <p className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-400/30 hover:scrollbar-thumb-gray-400/50 max-h-24 overflow-y-auto whitespace-pre-line text-gray-600 text-xs dark:text-gray-400">
              {clickedTask.description}
            </p>
          )}

          {/* Compact Info Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-green-500" />
                <span className="text-muted-foreground">Created:</span>
              </div>
              <div className="pl-4 font-medium">
                {clickedTask.createdDate
                  ? clickedTask.createdDate.toLocaleDateString()
                  : 'N/A'}
              </div>

              {clickedTask.end_date && (
                <>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-orange-500" />
                    <span className="text-muted-foreground">Due:</span>
                  </div>
                  <div className="pl-4 font-medium">
                    {new Date(clickedTask.end_date).toLocaleDateString()}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-blue-500" />
                <span className="text-muted-foreground">Duration:</span>
              </div>
              <div className="pl-4 font-medium">{clickedTaskDuration}</div>

              {clickedTask.priority && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Priority:</span>
                  </div>
                  <div className="pl-4">
                    <Badge
                      variant={
                        clickedTask.priority === 'critical'
                          ? 'destructive'
                          : clickedTask.priority === 'high'
                            ? 'default'
                            : clickedTask.priority === 'normal'
                              ? 'secondary'
                              : 'outline'
                      }
                      className="text-xs"
                    >
                      {clickedTask.priority === 'critical'
                        ? '🔥 Urgent'
                        : clickedTask.priority === 'high'
                          ? '⚡ High'
                          : clickedTask.priority === 'normal'
                            ? '📋 Medium'
                            : '📝 Low'}
                    </Badge>
                  </div>
                </>
              )}
            </div>
          </div>

          {clickedTask.assignee_name && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-linear-to-br from-blue-400 to-purple-500 font-medium text-white text-xs">
                {clickedTask.assignee_name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-xs">
                {clickedTask.assignee_name}
              </span>
            </div>
          )}

          {/* Compact Progress */}
          <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-600">
            <div
              className={cn(
                'h-1.5 rounded-full transition-all',
                clickedTask.status === 'done' || clickedTask.status === 'closed'
                  ? 'bg-green-500'
                  : clickedTask.status === 'active'
                    ? 'bg-blue-500'
                    : 'bg-gray-400 dark:bg-gray-500'
              )}
              style={{
                width:
                  clickedTask.status === 'done' ||
                  clickedTask.status === 'closed'
                    ? '100%'
                    : clickedTask.status === 'active'
                      ? '60%'
                      : '10%',
              }}
            />
          </div>

          {/* Compact Overdue Warning */}
          {clickedTask.end_date &&
            new Date(clickedTask.end_date) < new Date() &&
            clickedTask.status !== 'done' &&
            clickedTask.status !== 'closed' && (
              <div className="flex items-center gap-1 rounded border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-900/20">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="font-medium text-red-600 text-xs dark:text-red-400">
                  Overdue by{' '}
                  {Math.ceil(
                    (Date.now() - new Date(clickedTask.end_date).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )}{' '}
                  days
                </span>
              </div>
            )}
        </div>
      </div>
    </>
  );
}
