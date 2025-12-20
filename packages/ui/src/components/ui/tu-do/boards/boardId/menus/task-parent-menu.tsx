'use client';

import { ArrowUpCircle, Loader2, Search, X } from '@tuturuuu/icons';
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
import { cn } from '@tuturuuu/utils/format';
import { useWorkspaceTasks } from '@tuturuuu/utils/task-helper';
import * as React from 'react';

interface TaskParentMenuProps {
  /** Current workspace ID */
  wsId: string;
  /** Current task ID (to exclude from search) */
  taskId: string;
  /** Currently set parent task */
  parentTask: RelatedTaskInfo | null;
  /** IDs of child tasks (cannot be set as parent - would create cycle) */
  childTaskIds: string[];
  /** Whether a mutation is in progress */
  isSaving: boolean;
  /** Called when parent is set */
  onSetParent: (task: RelatedTaskInfo) => void;
  /** Called when parent is removed */
  onRemoveParent: () => void;
}

export function TaskParentMenu({
  wsId,
  taskId,
  parentTask,
  childTaskIds,
  isSaving,
  onSetParent,
  onRemoveParent,
}: TaskParentMenuProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  // Exclude current task and all its children (to prevent cycles)
  const excludeIds = React.useMemo(() => {
    const ids = [taskId, ...childTaskIds];
    if (parentTask) {
      ids.push(parentTask.id);
    }
    return ids;
  }, [taskId, childTaskIds, parentTask]);

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

  // Reset search when menu closes
  const handleSubContentOpenChange = React.useCallback((open: boolean) => {
    if (!open) {
      setSearchQuery('');
    }
  }, []);

  return (
    <DropdownMenuSub onOpenChange={handleSubContentOpenChange}>
      <DropdownMenuSubTrigger>
        <ArrowUpCircle className="h-4 w-4 text-dynamic-purple" />
        Parent Task
        {parentTask && (
          <span className="ml-auto text-muted-foreground text-xs">1 set</span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72 p-0">
        {/* Current Parent Display */}
        {parentTask && (
          <div className="border-b p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{parentTask.name}</span>
                <span className="text-muted-foreground text-xs">
                  {parentTask.board_name} #{parentTask.display_number}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveParent()}
                disabled={isSaving}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Search and Select */}
        <Command shouldFilter={false} className="rounded-none border-0">
          <CommandInput
            placeholder="Search tasks..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-9"
          />
          <CommandList className="max-h-[250px]">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : tasksError ? (
              <CommandEmpty className="py-4 text-center text-muted-foreground text-xs">
                Error loading tasks
              </CommandEmpty>
            ) : tasks.length === 0 ? (
              <CommandEmpty className="py-4 text-center text-muted-foreground text-xs">
                {searchQuery ? (
                  <>
                    <Search className="mx-auto mb-1 h-4 w-4 opacity-50" />
                    No matching tasks
                  </>
                ) : (
                  'No available tasks'
                )}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={task.id}
                    onSelect={() => {
                      onSetParent(task);
                    }}
                    disabled={isSaving}
                    className="flex cursor-pointer items-center gap-2"
                  >
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
                          {task.board_name} #{task.display_number}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
