'use client';

import { Loader2, Plus, Search, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useWorkspaceTasks } from '@tuturuuu/utils/task-helper';
import * as React from 'react';
import type {
  TaskSearchPopoverContentProps,
  TaskSearchPopoverProps,
} from './types/task-relationships.types';

// Shared task search popover content (without trigger button)
export function TaskSearchPopoverContent({
  wsId,
  excludeTaskIds,
  open,
  onSelect,
  onCreateNew,
  emptyText,
  isSaving,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
}: TaskSearchPopoverContentProps) {
  const [internalSearchQuery, setInternalSearchQuery] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);

  // Use external query if provided, otherwise use internal
  const searchQuery = externalSearchQuery ?? internalSearchQuery;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearchQuery;

  const [debouncedSearch] = useDebounce(searchQuery, 300);

  const { data: tasks = [], isLoading: tasksLoading } = useWorkspaceTasks(
    wsId,
    {
      excludeTaskIds,
      searchQuery: debouncedSearch || undefined,
      limit: 30,
      enabled: open,
    }
  );

  // Reset search when popover closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setIsCreating(false);
    }
  }, [open, setSearchQuery]);

  const handleCreateNew = React.useCallback(async () => {
    if (!onCreateNew || !searchQuery.trim() || isCreating) return;

    setIsCreating(true);
    try {
      await onCreateNew(searchQuery.trim());
    } finally {
      setIsCreating(false);
    }
  }, [onCreateNew, searchQuery, isCreating]);

  const showCreateOption = onCreateNew && searchQuery.trim().length > 0;

  return (
    <Command shouldFilter={false}>
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
        ) : (
          <>
            {/* Create new option at the top when search query exists */}
            {showCreateOption && (
              <CommandGroup>
                <CommandItem
                  value="create-new"
                  onSelect={handleCreateNew}
                  disabled={isSaving || isCreating}
                  className="flex cursor-pointer items-center gap-2 border-b"
                >
                  {isCreating ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-dynamic-purple" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-dynamic-purple" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm">
                      Create "{searchQuery.trim()}"
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Create as new task
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
            )}

            {/* Empty state */}
            {tasks.length === 0 && !showCreateOption && (
              <CommandEmpty className="py-4 text-center text-muted-foreground text-xs">
                {searchQuery ? (
                  <>
                    <Search className="mx-auto mb-1 h-4 w-4 opacity-50" />
                    No matching tasks
                  </>
                ) : (
                  emptyText
                )}
              </CommandEmpty>
            )}

            {/* Existing tasks */}
            {tasks.length > 0 && (
              <CommandGroup
                heading={showCreateOption ? 'Existing tasks' : undefined}
              >
                {tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={task.id}
                    onSelect={() => onSelect(task)}
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
          </>
        )}
      </CommandList>
    </Command>
  );
}

// Shared task search popover (with trigger button)
export function TaskSearchPopover({
  wsId,
  excludeTaskIds,
  open,
  onOpenChange,
  onSelect,
  onCreateNew,
  placeholder = '',
  emptyText,
  isSaving,
}: TaskSearchPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start gap-2 text-muted-foreground',
            placeholder ? 'w-full' : ''
          )}
          disabled={isSaving}
        >
          <Plus className="h-4 w-4" />
          {placeholder && <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-9999 w-(--radix-popover-trigger-width) p-0"
        align="start"
        sideOffset={4}
      >
        <TaskSearchPopoverContent
          wsId={wsId}
          excludeTaskIds={excludeTaskIds}
          open={open}
          onOpenChange={onOpenChange}
          onSelect={onSelect}
          onCreateNew={onCreateNew}
          emptyText={emptyText}
          isSaving={isSaving}
        />
      </PopoverContent>
    </Popover>
  );
}
