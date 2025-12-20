'use client';

import { Link2, Loader2, Plus, Search, X } from '@tuturuuu/icons';
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

interface TaskRelatedMenuProps {
  /** Current workspace ID */
  wsId: string;
  /** Current task ID (to exclude from search) */
  taskId: string;
  /** Tasks that are related to this task */
  relatedTasks: RelatedTaskInfo[];
  /** Whether a mutation is in progress */
  isSaving: boolean;
  /** ID of task currently being saved (for individual loading states) */
  savingTaskId: string | null;
  /** Called when adding a related task */
  onAddRelated: (task: RelatedTaskInfo) => void;
  /** Called when removing a related task */
  onRemoveRelated: (taskId: string) => void;
}

export function TaskRelatedMenu({
  wsId,
  taskId,
  relatedTasks,
  isSaving,
  savingTaskId,
  onAddRelated,
  onRemoveRelated,
}: TaskRelatedMenuProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  // Exclude current task and all already-related tasks
  const excludeIds = React.useMemo(() => {
    return [taskId, ...relatedTasks.map((t) => t.id)];
  }, [taskId, relatedTasks]);

  // Fetch available tasks
  const { data: tasks = [], isLoading: tasksLoading } = useWorkspaceTasks(
    wsId,
    {
      excludeTaskIds: excludeIds,
      searchQuery: debouncedSearch || undefined,
      limit: 30,
    }
  );

  // Reset search when menu closes
  const handleSubContentOpenChange = React.useCallback((open: boolean) => {
    if (!open) {
      setSearchQuery('');
    }
  }, []);

  return (
    <DropdownMenuSub onOpenChange={handleSubContentOpenChange}>
      <DropdownMenuSubTrigger>
        <Link2 className="h-4 w-4 text-dynamic-blue" />
        Related Tasks
        {relatedTasks.length > 0 && (
          <span className="ml-auto text-muted-foreground text-xs">
            {relatedTasks.length}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80 p-0">
        {/* Current Related Tasks */}
        {relatedTasks.length > 0 && (
          <div className="border-b">
            <div className="border-b bg-muted/30 px-2 py-1.5">
              <span className="font-medium text-muted-foreground text-xs">
                Currently Related
              </span>
            </div>
            <ScrollArea className="max-h-[180px]">
              <div className="space-y-1 p-2">
                {relatedTasks.map((task) => (
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
                        {task.board_name} #{task.display_number}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveRelated(task.id)}
                      disabled={isSaving && savingTaskId === task.id}
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
            placeholder="Search tasks to link..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-9"
          />
          <CommandList className="max-h-[200px]">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
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
                    onSelect={() => onAddRelated(task)}
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

        {/* Help Text */}
        <div className="border-t bg-muted/30 px-2 py-1.5">
          <p className="text-center text-muted-foreground text-xs">
            Link tasks that share context or are related to each other
          </p>
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
