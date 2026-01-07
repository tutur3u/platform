'use client';

import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import * as React from 'react';
import { ClickableTaskItem } from './components/clickable-task-item';
import { TaskRelationshipActionButtons } from './components/task-relationship-action-buttons';
import type {
  DependenciesSectionProps,
  DependencySubTab,
} from './types/task-relationships.types';

export function DependenciesSection({
  wsId,
  taskId,
  blockingTasks,
  blockedByTasks,
  isSaving,
  savingTaskId,
  onAddBlocking,
  onRemoveBlocking,
  onAddBlockedBy,
  onRemoveBlockedBy,
  onNavigateToTask,
  onAddBlockingTaskDialog,
  onAddBlockedByTaskDialog,
  disabled,
}: DependenciesSectionProps) {
  const [subTab, setSubTab] = React.useState<DependencySubTab>('blocks');
  const [searchOpen, setSearchOpen] = React.useState(false);

  const allExcludeIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (taskId) ids.add(taskId);
    for (const t of blockingTasks) {
      ids.add(t.id);
    }
    for (const t of blockedByTasks) {
      ids.add(t.id);
    }
    return Array.from(ids);
  }, [taskId, blockingTasks, blockedByTasks]);

  const currentList = subTab === 'blocks' ? blockingTasks : blockedByTasks;
  const handleAdd = subTab === 'blocks' ? onAddBlocking : onAddBlockedBy;
  const handleRemove =
    subTab === 'blocks' ? onRemoveBlocking : onRemoveBlockedBy;
  const handleCreateNew =
    subTab === 'blocks' ? onAddBlockingTaskDialog : onAddBlockedByTaskDialog;

  return (
    <div className="space-y-3">
      {/* Sub-tab navigation */}
      <div className="flex gap-2">
        <Button
          variant={subTab === 'blocks' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSubTab('blocks')}
          className="h-7 text-xs"
        >
          Blocks ({blockingTasks.length})
        </Button>
        <Button
          variant={subTab === 'blocked-by' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSubTab('blocked-by')}
          className="h-7 text-xs"
        >
          Blocked By ({blockedByTasks.length})
        </Button>
      </div>

      {/* Task list */}
      {currentList.length > 0 && (
        <ScrollArea className="max-h-[150px]">
          <div className="space-y-1">
            {currentList.map((task) => (
              <ClickableTaskItem
                key={task.id}
                task={task}
                onNavigateToTask={onNavigateToTask}
                onRemove={() => handleRemove(task.id)}
                isSaving={isSaving}
                isRemoving={isSaving && savingTaskId === task.id}
                disabled={disabled}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Add task with dropdown */}
      <TaskRelationshipActionButtons
        wsId={wsId}
        excludeIds={allExcludeIds}
        searchOpen={searchOpen}
        onSearchOpenChange={setSearchOpen}
        onAddExisting={(task) => {
          handleAdd(task);
          setSearchOpen(false);
        }}
        onCreateNew={handleCreateNew}
        isSaving={isSaving}
        buttonLabel={
          subTab === 'blocks' ? 'Add task this blocks' : 'Add blocking task'
        }
        createNewLabel={
          subTab === 'blocks'
            ? 'Create new task this blocks'
            : 'Create new blocking task'
        }
        addExistingLabel={
          subTab === 'blocks'
            ? 'Add existing task this blocks'
            : 'Add existing blocking task'
        }
        emptyText="No available tasks"
        disabled={disabled}
      />

      <p className="text-muted-foreground text-xs">
        {subTab === 'blocks'
          ? 'Tasks that cannot start until this one is complete.'
          : 'Tasks that must complete before this one can start.'}
      </p>
    </div>
  );
}
