'use client';

import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import * as React from 'react';
import { ClickableTaskItem } from './components/clickable-task-item';
import { TaskSearchPopover } from './task-search-popover';
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
  onCreateRelatedTask,
}: RelatedSectionProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  const excludeIds = React.useMemo(() => {
    const ids = taskId ? [taskId] : [];
    relatedTasks.forEach((t) => ids.push(t.id));
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

      {/* Add related task */}
      <TaskSearchPopover
        wsId={wsId}
        excludeTaskIds={excludeIds}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(task) => {
          onAddRelated(task);
          setSearchOpen(false);
        }}
        onCreateNew={
          onCreateRelatedTask
            ? async (name) => {
                await onCreateRelatedTask(name);
                setSearchOpen(false);
              }
            : undefined
        }
        placeholder="Link related task..."
        emptyText="No available tasks"
        isSaving={isSaving}
      />

      <p className="text-muted-foreground text-xs">
        Link tasks that share context or are related to each other.
      </p>
    </div>
  );
}
