'use client';

import {
  Check,
  ChevronsUpDown,
  ExternalLink,
  Loader2,
  Search,
  X,
} from '@tuturuuu/icons';
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

interface TaskPickerOption {
  id: string;
  name: string;
  display_number?: number | null;
  completed?: boolean | null;
  priority?: 'low' | 'normal' | 'high' | 'critical' | null;
  board_id?: string | null;
  board_name?: string;
}

interface TaskPickerPopoverProps {
  wsId: string;
  /** IDs of tasks to exclude from selection (e.g., current task, already related tasks) */
  excludeTaskIds?: string[];
  /** Placeholder text for the trigger button */
  placeholder?: string;
  /** Text shown when no tasks are found */
  emptyText?: string;
  /** Currently selected task ID (for single selection mode) */
  selectedTaskId?: string | null;
  /** Currently selected task IDs (for multi selection mode) */
  selectedTaskIds?: string[];
  /** Selection mode */
  mode?: 'single' | 'multiple';
  /** Called when a task is selected/deselected */
  onSelect: (task: TaskPickerOption) => void;
  /** Called when selection is cleared (single mode only) */
  onClear?: () => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Whether a mutation is in progress */
  isLoading?: boolean;
  /** Custom class name for the trigger */
  className?: string;
  /** Trigger button variant */
  variant?: 'default' | 'outline' | 'ghost';
  /** Size of the trigger button */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Custom trigger content */
  triggerContent?: React.ReactNode;
}

export function TaskPickerPopover({
  wsId,
  excludeTaskIds = [],
  placeholder = 'Select a task...',
  emptyText = 'No tasks found.',
  selectedTaskId,
  selectedTaskIds = [],
  mode = 'single',
  onSelect,
  onClear,
  disabled = false,
  isLoading = false,
  className,
  variant = 'outline',
  size = 'default',
  triggerContent,
}: TaskPickerPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

  // Fetch tasks from workspace
  const { data: tasks = [], isLoading: tasksLoading } = useWorkspaceTasks(
    wsId,
    {
      excludeTaskIds,
      searchQuery: debouncedSearchQuery || undefined,
      limit: 50,
      enabled: open,
    }
  );

  // Get selected task info for display
  const selectedTask = React.useMemo(() => {
    if (mode === 'single' && selectedTaskId) {
      return tasks.find((t) => t.id === selectedTaskId);
    }
    return null;
  }, [mode, selectedTaskId, tasks]);

  const selectedCount = React.useMemo(() => {
    if (mode === 'multiple') {
      return selectedTaskIds.length;
    }
    return selectedTaskId ? 1 : 0;
  }, [mode, selectedTaskId, selectedTaskIds]);

  const isTaskSelected = React.useCallback(
    (taskId: string) => {
      if (mode === 'single') {
        return taskId === selectedTaskId;
      }
      return selectedTaskIds.includes(taskId);
    },
    [mode, selectedTaskId, selectedTaskIds]
  );

  const handleSelect = React.useCallback(
    (task: TaskPickerOption) => {
      onSelect(task);
      if (mode === 'single') {
        setOpen(false);
      }
    },
    [mode, onSelect]
  );

  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClear?.();
    },
    [onClear]
  );

  // Reset search when popover closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery('');
    }
  }, [open]);

  const renderTriggerContent = () => {
    if (triggerContent) {
      return triggerContent;
    }

    if (mode === 'single' && selectedTask) {
      return (
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate">{selectedTask.name}</span>
          {onClear && (
            <X
              className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
              onClick={handleClear}
            />
          )}
        </div>
      );
    }

    if (mode === 'multiple' && selectedCount > 0) {
      return (
        <span className="text-muted-foreground">
          {selectedCount} task{selectedCount !== 1 ? 's' : ''} selected
        </span>
      );
    }

    return <span className="text-muted-foreground">{placeholder}</span>;
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          role="combobox"
          aria-expanded={open}
          aria-label={placeholder}
          className={cn('w-full justify-between', className)}
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {renderTriggerContent()}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-9999 w-(--radix-popover-trigger-width) min-w-[300px] p-0"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search tasks..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-9"
          />
          <CommandList className="max-h-[300px]">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <CommandEmpty className="py-6 text-center text-muted-foreground text-sm">
                {searchQuery ? (
                  <>
                    <Search className="mx-auto mb-2 h-5 w-5 opacity-50" />
                    No tasks matching &quot;{searchQuery}&quot;
                  </>
                ) : (
                  emptyText
                )}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {tasks.map((task) => {
                  const selected = isTaskSelected(task.id);
                  return (
                    <CommandItem
                      key={task.id}
                      value={task.id}
                      onSelect={() => handleSelect(task)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2',
                        selected && 'bg-accent'
                      )}
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0',
                          selected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'truncate font-medium',
                              task.completed &&
                                'text-muted-foreground line-through'
                            )}
                          >
                            {task.name}
                          </span>
                          {task.priority &&
                            ['high', 'critical'].includes(task.priority) && (
                              <span className="shrink-0 rounded bg-dynamic-red/10 px-1 py-0.5 font-medium text-[10px] text-dynamic-red">
                                {task.priority === 'critical' ? 'P1' : 'P2'}
                              </span>
                            )}
                        </div>
                        {task.board_name && (
                          <div className="flex items-center gap-1 text-muted-foreground text-xs">
                            <ExternalLink className="h-3 w-3" />
                            <span className="truncate">{task.board_name}</span>
                            <span className="opacity-50">
                              #{task.display_number}
                            </span>
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
