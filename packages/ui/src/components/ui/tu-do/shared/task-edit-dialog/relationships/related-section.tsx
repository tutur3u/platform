'use client';

import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import * as React from 'react';
import { ClickableTaskItem } from './components/clickable-task-item';
import { TaskRelationshipActionButtons } from './components/task-relationship-action-buttons';
import type { RelatedSectionProps } from './types/task-relationships.types';

export function RelatedSection({
  wsId,
  taskId,
  relatedTasks,
  isSaving,
  savingTaskId,
  onAddRelated,
  onRemoveRelated,
  onNavigateToTask,
  onAddRelatedTaskDialog,
}: RelatedSectionProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  const excludeIds = React.useMemo(() => {
    const ids = taskId ? [taskId] : [];
    for (const t of relatedTasks) {
      ids.push(t.id);
    }
    return ids;
  }, [taskId, relatedTasks]);

  return (
    <div className="space-y-3">
      {/* Related tasks list */}
      {relatedTasks.length > 0 && (
        <ScrollArea className="max-h-[150px]">
          <div className="space-y-1">
            {relatedTasks.map((task) => (
              <ClickableTaskItem
                key={task.id}
                task={task}
                onNavigateToTask={onNavigateToTask}
                onRemove={() => onRemoveRelated(task.id)}
                isSaving={isSaving}
                isRemoving={isSaving && savingTaskId === task.id}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Add related task with dropdown */}
      <TaskRelationshipActionButtons
        wsId={wsId}
        excludeIds={excludeIds}
        searchOpen={searchOpen}
        onSearchOpenChange={setSearchOpen}
        onAddExisting={(task) => {
          onAddRelated(task);
          setSearchOpen(false);
        }}
        onCreateNew={onAddRelatedTaskDialog}
        isSaving={isSaving}
        buttonLabel="Link related task"
        createNewLabel="Create new related task"
        addExistingLabel="Add existing related task"
        emptyText="No available tasks"
      />

      <p className="text-muted-foreground text-xs">
        Link tasks that share context or are related to each other.
      </p>
    </div>
  );
}
