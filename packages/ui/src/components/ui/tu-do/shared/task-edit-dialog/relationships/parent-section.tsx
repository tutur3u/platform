'use client';

import * as React from 'react';
import { ClickableTaskItem } from './components/clickable-task-item';
import { TaskRelationshipActionButtons } from './components/task-relationship-action-buttons';
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
  onAddParentTask,
  disabled,
}: ParentSectionProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  const excludeIds = React.useMemo(() => {
    const ids = taskId ? [taskId, ...childTaskIds] : childTaskIds;
    return ids;
  }, [taskId, childTaskIds]);

  return (
    <div className="space-y-3">
      {parentTask ? (
        <ClickableTaskItem
          task={parentTask}
          onNavigateToTask={onNavigateToTask}
          onRemove={onRemoveParent}
          isSaving={isSaving}
          isRemoving={isSaving && savingTaskId === parentTask.id}
          disabled={disabled}
        />
      ) : (
        <TaskRelationshipActionButtons
          wsId={wsId}
          excludeIds={excludeIds}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          onAddExisting={(task) => {
            onSetParent(task);
            setSearchOpen(false);
          }}
          onCreateNew={onAddParentTask}
          isSaving={isSaving}
          buttonLabel="Set parent task"
          createNewLabel="Create new parent task"
          addExistingLabel="Add existing task as parent"
          emptyText="No available parent tasks"
          disabled={disabled}
        />
      )}

      <p className="text-muted-foreground text-xs">
        A parent task groups related work. This task becomes a sub-task of the
        parent.
      </p>
    </div>
  );
}
