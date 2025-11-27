'use client';

import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import * as React from 'react';
import { ClickableTaskItem } from './components/clickable-task-item';
import { TaskSearchPopover } from './task-search-popover';
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
  onCreateBlockingTask,
  onCreateBlockedByTask,
}: DependenciesSectionProps) {
  const [subTab, setSubTab] = React.useState<DependencySubTab>('blocks');
  const [searchOpen, setSearchOpen] = React.useState(false);

  const allExcludeIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (taskId) ids.add(taskId);
    blockingTasks.forEach((t) => ids.add(t.id));
    blockedByTasks.forEach((t) => ids.add(t.id));
    return Array.from(ids);
  }, [taskId, blockingTasks, blockedByTasks]);

  const currentList = subTab === 'blocks' ? blockingTasks : blockedByTasks;
  const handleAdd = subTab === 'blocks' ? onAddBlocking : onAddBlockedBy;
  const handleRemove =
    subTab === 'blocks' ? onRemoveBlocking : onRemoveBlockedBy;
  const handleCreateNew =
    subTab === 'blocks' ? onCreateBlockingTask : onCreateBlockedByTask;

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
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Add task */}
      <TaskSearchPopover
        wsId={wsId}
        excludeTaskIds={allExcludeIds}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(task) => {
          handleAdd(task);
          setSearchOpen(false);
        }}
        onCreateNew={
          handleCreateNew
            ? async (name) => {
                await handleCreateNew(name);
                setSearchOpen(false);
              }
            : undefined
        }
        placeholder={
          subTab === 'blocks'
            ? 'Add task this blocks...'
            : 'Add blocking task...'
        }
        emptyText="No available tasks"
        isSaving={isSaving}
      />

      <p className="text-muted-foreground text-xs">
        {subTab === 'blocks'
          ? 'Tasks that cannot start until this one is complete.'
          : 'Tasks that must complete before this one can start.'}
      </p>
    </div>
  );
}
