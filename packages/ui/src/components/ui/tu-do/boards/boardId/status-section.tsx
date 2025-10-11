'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Plus,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { EnhancedTaskList } from './enhanced-task-list';
import { TaskListForm } from './task-list-form';

interface Props {
  status: TaskBoardStatus;
  lists: TaskList[];
  tasksByList: Record<string, Task[]>;
  boardId: string;
  onUpdate: () => void;
  hideTasksMode?: boolean;
  isPersonalWorkspace?: boolean;
}

const statusColors: Record<TaskBoardStatus, string> = {
  not_started:
    'border-dynamic-gray/40 bg-gradient-to-br from-dynamic-gray/10 to-dynamic-gray/5',
  active:
    'border-dynamic-blue/40 bg-gradient-to-br from-dynamic-blue/10 to-dynamic-blue/5',
  done: 'border-dynamic-green/40 bg-gradient-to-br from-dynamic-green/10 to-dynamic-green/5',
  closed:
    'border-dynamic-purple/40 bg-gradient-to-br from-dynamic-purple/10 to-dynamic-purple/5',
};

const statusHoverColors: Record<TaskBoardStatus, string> = {
  not_started:
    'hover:border-dynamic-gray/60 hover:shadow-lg hover:shadow-dynamic-gray/10',
  active:
    'hover:border-dynamic-blue/60 hover:shadow-lg hover:shadow-dynamic-blue/10',
  done: 'hover:border-dynamic-green/60 hover:shadow-lg hover:shadow-dynamic-green/10',
  closed:
    'hover:border-dynamic-purple/60 hover:shadow-lg hover:shadow-dynamic-purple/10',
};

const statusBadgeColors: Record<TaskBoardStatus, string> = {
  not_started: 'bg-dynamic-gray/20 text-dynamic-gray border-dynamic-gray/30',
  active: 'bg-dynamic-blue/20 text-dynamic-blue border-dynamic-blue/30',
  done: 'bg-dynamic-green/20 text-dynamic-green border-dynamic-green/30',
  closed: 'bg-dynamic-purple/20 text-dynamic-purple border-dynamic-purple/30',
};

const statusLabels: Record<TaskBoardStatus, string> = {
  not_started: 'Not Started',
  active: 'Active',
  done: 'Done',
  closed: 'Closed',
};

export const statusIcons = {
  not_started: <CircleDashed className="h-4 w-4" />,
  active: <Circle className="h-4 w-4" />,
  done: <CircleCheck className="h-4 w-4" />,
  closed: <CircleSlash className="h-4 w-4" />,
};

const statusDescriptions: Record<TaskBoardStatus, string> = {
  not_started: 'Ideas and planned work',
  active: 'Work in progress',
  done: 'Completed work',
  closed: 'Archived or cancelled',
};

export function StatusSection({
  status,
  lists,
  tasksByList,
  boardId,
  onUpdate,
  hideTasksMode = false,
  isPersonalWorkspace,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `status-${status}`,
    data: {
      type: 'Status',
      status,
    },
  });

  const totalTasks = lists.reduce(
    (sum, list) => sum + (tasksByList[list.id]?.length || 0),
    0
  );

  const statusIcon = statusIcons[status] || <Circle className="h-4 w-4" />;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full flex-col rounded-lg border-2 shadow-sm transition-all duration-200',
        statusColors[status],
        statusHoverColors[status],
        isOver && 'scale-[1.02] ring-2 ring-offset-2',
        isOver && status === 'not_started' && 'ring-dynamic-gray/50',
        isOver && status === 'active' && 'ring-dynamic-blue/50',
        isOver && status === 'done' && 'ring-dynamic-green/50',
        isOver && status === 'closed' && 'ring-dynamic-purple/50'
      )}
    >
      {/* Status Header */}
      <div className="flex items-center justify-between rounded-t-lg border-b bg-background/40 p-3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
              status === 'not_started' &&
                'bg-dynamic-gray/20 text-dynamic-gray',
              status === 'active' && 'bg-dynamic-blue/20 text-dynamic-blue',
              status === 'done' && 'bg-dynamic-green/20 text-dynamic-green',
              status === 'closed' && 'bg-dynamic-purple/20 text-dynamic-purple'
            )}
          >
            {statusIcon}
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm leading-tight">
              {statusLabels[status]}
            </h3>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {statusDescriptions[status]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1 font-semibold text-xs shadow-sm',
              statusBadgeColors[status]
            )}
          >
            <span>{lists.length}</span>
            <span className="font-normal opacity-80">
              {lists.length === 1 ? 'list' : 'lists'}
            </span>
          </div>
          {!hideTasksMode && (
            <div className="flex items-center gap-1 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-xs shadow-sm">
              <span className="font-semibold">{totalTasks}</span>
              <span className="text-muted-foreground">
                {totalTasks === 1 ? 'task' : 'tasks'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Lists Grid */}
      <div
        className={cn(
          'min-h-[200px] flex-1 space-y-3 overflow-y-auto p-3',
          isOver && 'bg-primary/5'
        )}
      >
        {lists.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-lg border-2 border-border/40 border-dashed bg-background/30 p-6 text-center text-muted-foreground backdrop-blur-sm transition-colors hover:border-border/60">
            <div
              className={cn(
                'mb-3 flex h-14 w-14 items-center justify-center rounded-xl shadow-sm',
                status === 'not_started' &&
                  'bg-dynamic-gray/20 text-dynamic-gray',
                status === 'active' && 'bg-dynamic-blue/20 text-dynamic-blue',
                status === 'done' && 'bg-dynamic-green/20 text-dynamic-green',
                status === 'closed' &&
                  'bg-dynamic-purple/20 text-dynamic-purple'
              )}
            >
              <div className="scale-150">{statusIcon}</div>
            </div>
            <p className="font-semibold text-foreground text-sm">
              No lists in {statusLabels[status].toLowerCase()}
            </p>
            <p className="mt-1.5 max-w-[200px] text-xs leading-relaxed">
              {status === 'not_started' &&
                'Add lists to organize new ideas and planned work'}
              {status === 'active' && 'Add lists to track work in progress'}
              {status === 'done' && 'Add lists to celebrate completed work'}
              {status === 'closed' &&
                'Add a list for archived or cancelled work'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {lists
              .sort((a, b) => (a.position || 0) - (b.position || 0))
              .map((list) => (
                <EnhancedTaskList
                  key={list.id}
                  list={list}
                  tasks={tasksByList[list.id] || []}
                  boardId={boardId}
                  onUpdate={onUpdate}
                  hideTasksMode={hideTasksMode}
                  isPersonalWorkspace={isPersonalWorkspace}
                />
              ))}
          </div>
        )}

        {/* Add List Button/Form */}
        <div className="pt-1">
          {showAddForm ? (
            <div className="fade-in slide-in-from-top-2 animate-in rounded-lg border-2 border-border/60 bg-background/80 p-3 shadow-sm backdrop-blur-sm duration-200">
              <TaskListForm
                boardId={boardId}
                defaultStatus={status}
                inline
                onListCreated={() => {
                  setShowAddForm(false);
                  onUpdate();
                }}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className={cn(
                'group w-full justify-start gap-2 border-2 border-border/40 border-dashed transition-all hover:border-border/60 hover:border-solid hover:bg-background/50 hover:shadow-sm',
                status === 'closed' &&
                  lists.length >= 1 &&
                  'cursor-not-allowed opacity-50 hover:bg-transparent hover:shadow-none'
              )}
              disabled={status === 'closed' && lists.length >= 1}
            >
              <Plus className="h-4 w-4 transition-transform group-hover:scale-110" />
              <span className="font-medium text-xs">Add list</span>
              {status === 'closed' && lists.length >= 1 && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  (max 1)
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
