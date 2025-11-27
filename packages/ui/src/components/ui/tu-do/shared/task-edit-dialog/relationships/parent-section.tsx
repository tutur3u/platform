'use client';

import * as React from 'react';
import { ClickableTaskItem } from './components/clickable-task-item';
import { TaskSearchPopover } from './task-search-popover';
import type { ParentSectionProps } from './types/task-relationships.types';

export function ParentSection({
  wsId,
  taskId,
  parentTask,
  childTaskIds,
  isSaving,
  savingTaskId,
  onSetParent,
  onRemoveParent,
  onNavigateToTask,
  onCreateParent,
}: ParentSectionProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <div className="space-y-3">
      {parentTask ? (
        <ClickableTaskItem
          task={parentTask}
          onNavigateToTask={onNavigateToTask}
          onRemove={onRemoveParent}
          isSaving={isSaving}
          isRemoving={isSaving && savingTaskId === parentTask.id}
        />
      ) : (
        <TaskSearchPopover
          wsId={wsId}
          excludeTaskIds={taskId ? [taskId, ...childTaskIds] : childTaskIds}
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelect={(task) => {
            onSetParent(task);
            setSearchOpen(false);
          }}
          onCreateNew={
            onCreateParent
              ? async (name) => {
                  await onCreateParent(name);
                  setSearchOpen(false);
                }
              : undefined
          }
          placeholder="Set parent task..."
          emptyText="No available parent tasks"
          isSaving={isSaving}
        />
      )}

      <p className="text-muted-foreground text-xs">
        A parent task groups related work. This task becomes a sub-task of the
        parent.
      </p>
    </div>
  );
}
