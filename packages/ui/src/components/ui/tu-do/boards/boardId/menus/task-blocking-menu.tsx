'use client';

import { Ban, Loader2, Plus, Search, X } from '@tuturuuu/icons';
import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { useWorkspaceTasks } from '@tuturuuu/utils/task-helper';
import * as React from 'react';

interface TaskBlockingMenuTranslations {
  dependencies: string;
  blocks: string;
  blocked_by: string;
  search_tasks_to_block: string;
  search_blocking_tasks: string;
  error_loading_tasks: string;
  no_matching_tasks: string;
  no_available_tasks: string;
  remove_dependency: string;
  tasks_that_cannot_start: string;
  tasks_that_must_complete: string;
}

interface TaskBlockingMenuProps {
  /** Current workspace ID */
  wsId: string;
  /** Current task ID (to exclude from search) */
  taskId: string;
  /** Tasks that this task blocks (dependent on this task) */
  blockingTasks: RelatedTaskInfo[];
  /** Tasks that block this task (this task depends on them) */
  blockedByTasks: RelatedTaskInfo[];
  /** Whether a mutation is in progress */
  isSaving: boolean;
  /** ID of task currently being saved (for individual loading states) */
  savingTaskId: string | null;
  /** Called when adding a task that this task blocks */
  onAddBlocking: (task: RelatedTaskInfo) => void;
  /** Called when removing a task that this task blocks */
  onRemoveBlocking: (taskId: string) => void;
  /** Called when adding a task that blocks this task */
  onAddBlockedBy: (task: RelatedTaskInfo) => void;
  /** Called when removing a task that blocks this task */
  onRemoveBlockedBy: (taskId: string) => void;
  /** Translations for the menu */
  translations: TaskBlockingMenuTranslations;
}

export function TaskBlockingMenu({
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
  translations,
}: TaskBlockingMenuProps) {
  const [activeTab, setActiveTab] = React.useState<'blocks' | 'blocked-by'>(
    'blocks'
  );
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  // Exclude current task and all already-related tasks
  const excludeIds = React.useMemo(() => {
    const ids = new Set([taskId]);
    for (const t of blockingTasks) {
      ids.add(t.id);
    }
    for (const t of blockedByTasks) {
      ids.add(t.id);
    }
    return Array.from(ids);
  }, [taskId, blockingTasks, blockedByTasks]);

  // Fetch available tasks
  const {
    data: tasks = [],
    isLoading: tasksLoading,
    isError: tasksError,
  } = useWorkspaceTasks(wsId, {
    excludeTaskIds: excludeIds,
    searchQuery: debouncedSearch || undefined,
    limit: 30,
  });

  // Reset search when tab changes
  React.useEffect(() => {
    setSearchQuery('');
  }, []);

  const totalCount = blockingTasks.length + blockedByTasks.length;
  const currentList = activeTab === 'blocks' ? blockingTasks : blockedByTasks;
  const handleAdd = activeTab === 'blocks' ? onAddBlocking : onAddBlockedBy;
  const handleRemove =
    activeTab === 'blocks' ? onRemoveBlocking : onRemoveBlockedBy;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Ban className="h-4 w-4 text-dynamic-red" />
        {translations.dependencies}
        {totalCount > 0 && (
          <span className="ml-auto text-muted-foreground text-xs">
            {totalCount}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80 p-0">
        {/* Tab Switcher */}
        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setActiveTab('blocks')}
            className={cn(
              'flex-1 px-3 py-2 font-medium text-sm transition-colors',
              activeTab === 'blocks'
                ? 'border-dynamic-red border-b-2 text-dynamic-red'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {translations.blocks} ({blockingTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('blocked-by')}
            className={cn(
              'flex-1 px-3 py-2 font-medium text-sm transition-colors',
              activeTab === 'blocked-by'
                ? 'border-dynamic-orange border-b-2 text-dynamic-orange'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {translations.blocked_by} ({blockedByTasks.length})
          </button>
        </div>

        {/* Current List */}
        {currentList.length > 0 && (
          <div className="border-b">
            <ScrollArea className="max-h-37.5">
              <div className="space-y-1 p-2">
                {currentList.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2 rounded p-1.5 hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          'truncate text-sm',
                          task.completed && 'text-muted-foreground line-through'
                        )}
                      >
                        {task.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {task.board_name}
                        {typeof task.display_number === 'number' &&
                          ` #${task.display_number}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(task.id)}
                      disabled={isSaving && savingTaskId === task.id}
                      aria-label={translations.remove_dependency}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      {isSaving && savingTaskId === task.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Search and Add */}
        <Command shouldFilter={false} className="rounded-none border-0">
          <CommandInput
            placeholder={
              activeTab === 'blocks'
                ? translations.search_tasks_to_block
                : translations.search_blocking_tasks
            }
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-9"
          />
          <CommandList className="max-h-50">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : tasksError ? (
              <CommandEmpty className="py-4 text-center text-muted-foreground text-xs">
                {translations.error_loading_tasks}
              </CommandEmpty>
            ) : tasks.length === 0 ? (
              <CommandEmpty className="py-4 text-center text-muted-foreground text-xs">
                {searchQuery ? (
                  <>
                    <Search className="mx-auto mb-1 h-4 w-4 opacity-50" />
                    {translations.no_matching_tasks}
                  </>
                ) : (
                  translations.no_available_tasks
                )}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={task.id}
                    onSelect={() => handleAdd(task)}
                    disabled={isSaving}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className={cn(
                          'truncate text-sm',
                          task.completed && 'text-muted-foreground line-through'
                        )}
                      >
                        {task.name}
                      </span>
                      {task.board_name && (
                        <span className="text-muted-foreground text-xs">
                          {task.board_name}
                          {typeof task.display_number === 'number' &&
                            ` #${task.display_number}`}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>

        <div className="border-t bg-muted/30 px-2 py-1.5">
          <p className="text-center text-muted-foreground text-xs">
            {activeTab === 'blocks'
              ? translations.tasks_that_cannot_start
              : translations.tasks_that_must_complete}
          </p>
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
