'use client';

import { ListTree } from '@tuturuuu/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import * as React from 'react';
import { ClickableTaskItem } from './components/clickable-task-item';
import { SubtaskActionButtons } from './components/subtask-action-buttons';
import type { SubtasksSectionProps } from './types/task-relationships.types';

export function SubtasksSection({
  wsId,
  taskId,
  childTasks,
  onNavigateToTask,
  onAddSubtask,
  onAddExistingAsSubtask,
  isSaving,
}: SubtasksSectionProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  const excludeIds = React.useMemo(() => {
    const ids = taskId ? [taskId] : [];
    for (const t of childTasks) {
      ids.push(t.id);
    }
    return ids;
  }, [taskId, childTasks]);

  const hasAddOptions = onAddSubtask || onAddExistingAsSubtask;

  return (
    <div className="space-y-3">
      {/* Empty state */}
      {childTasks.length === 0 && (
        <div className="py-4 text-center">
          <ListTree className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">No sub-tasks</p>
          <p className="text-muted-foreground/70 text-xs">
            Add a sub-task to break down this task into smaller pieces
          </p>
        </div>
      )}

      {/* Task list */}
      {childTasks.length > 0 && (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-1">
            {childTasks.map((task) => (
              <ClickableTaskItem
                key={task.id}
                task={task}
                onNavigateToTask={onNavigateToTask}
                isSaving={isSaving}
                showRemove={false}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Add buttons */}
      {hasAddOptions && (
        <SubtaskActionButtons
          wsId={wsId}
          excludeIds={excludeIds}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          onAddSubtask={onAddSubtask}
          onAddExistingAsSubtask={onAddExistingAsSubtask}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
