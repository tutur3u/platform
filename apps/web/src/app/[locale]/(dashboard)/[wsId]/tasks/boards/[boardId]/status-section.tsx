'use client';

import { EnhancedTaskList } from './enhanced-task-list';
import { TaskListForm } from './task-list-form';
import { useDroppable } from '@dnd-kit/core';
import {
  Task,
  TaskBoardStatus,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Plus,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

interface Props {
  status: TaskBoardStatus;
  lists: TaskList[];
  tasksByList: Record<string, Task[]>;
  boardId: string;
  onUpdate: () => void;
  hideTasksMode?: boolean;
}

const statusColors: Record<TaskBoardStatus, string> = {
  not_started: 'border-dynamic-gray/30 bg-dynamic-gray/10',
  active: 'border-dynamic-blue/30 bg-dynamic-blue/10',
  done: 'border-dynamic-green/30 bg-dynamic-green/10',
  closed: 'border-dynamic-purple/30 bg-dynamic-purple/10',
};

const statusLabels: Record<TaskBoardStatus, string> = {
  not_started: 'Not Started',
  active: 'Active',
  done: 'Done',
  closed: 'Closed',
};

const statusIcons = {
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
        'flex h-full flex-col rounded-xl border-2 transition-all duration-200',
        statusColors[status],
        isOver && 'scale-[1.02] ring-2 ring-primary/50',
        'hover:shadow-md'
      )}
    >
      {/* Status Header */}
      <div className="flex items-center justify-between rounded-t-xl border-b p-4">
        <div className="flex items-center gap-3">
          <span className="text-lg">{statusIcon}</span>
          <div>
            <h3 className="font-semibold text-foreground">
              {statusLabels[status]}
            </h3>
            <p className="text-xs text-muted-foreground">
              {statusDescriptions[status]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-medium">
            {lists.length} {lists.length === 1 ? 'list' : 'lists'}
          </Badge>
          {hideTasksMode ? (
            <Badge
              variant="outline"
              className="font-medium text-muted-foreground"
            >
              Tasks hidden
            </Badge>
          ) : (
            <Badge variant="outline" className="font-medium">
              {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
            </Badge>
          )}
        </div>
      </div>

      {/* Lists Grid */}
      <div
        className={cn(
          'min-h-[200px] flex-1 rounded-lg p-4',
          isOver && 'bg-primary/5'
        )}
      >
        {lists.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <div className="mb-3 rounded-full bg-muted/30 p-3">
              <span className="text-2xl">{statusIcon}</span>
            </div>
            <p className="text-sm font-medium">
              No lists in {statusLabels[status].toLowerCase()}
            </p>
            <p className="mt-1 max-w-40 text-center text-xs">
              {status === 'not_started' &&
                'Add lists for new ideas and planned work'}
              {status === 'active' && 'Add lists for work in progress'}
              {status === 'done' && 'Add lists for completed work'}
              {status === 'closed' && 'Add a list for archived work'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
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
                />
              ))}
          </div>
        )}

        {/* Add List Button/Form */}
        <div className="mt-4">
          {showAddForm ? (
            <div className="rounded-lg border p-3 backdrop-blur-sm">
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
                'w-full justify-start gap-2 border-2 border-dashed transition-all',
                'hover:border-solid',
                status === 'closed' &&
                  lists.length >= 1 &&
                  'cursor-not-allowed opacity-50'
              )}
              disabled={status === 'closed' && lists.length >= 1}
            >
              <Plus className="h-4 w-4" />
              Add list to {statusLabels[status].toLowerCase()}
              {status === 'closed' && lists.length >= 1 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  (max 1 closed list)
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
