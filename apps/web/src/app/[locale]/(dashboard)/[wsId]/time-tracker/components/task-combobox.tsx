'use client';

import { Check, ChevronsUpDown } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { getTicketIdentifier } from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { TaskWithDetails } from './session-history/session-types';

interface TaskComboboxProps {
  /**
   * The currently selected task ID ('none' for no selection)
   */
  value: string;
  /**
   * Callback when task selection changes
   */
  onValueChange: (taskId: string) => void;
  /**
   * List of available tasks
   */
  tasks: TaskWithDetails[] | null | undefined;
  /**
   * Whether tasks are currently loading
   */
  isLoading?: boolean;
  /**
   * Optional CSS class name for the trigger button
   */
  className?: string;
  /**
   * Optional ID for the trigger button
   */
  id?: string;
  /**
   * Whether the combobox is disabled
   */
  disabled?: boolean;
}

export function TaskCombobox({
  value,
  onValueChange,
  tasks,
  isLoading = false,
  className,
  id,
  disabled = false,
}: TaskComboboxProps) {
  const t = useTranslations('time-tracker.missed_entry_dialog');
  const [open, setOpen] = useState(false);

  const selectedTask = tasks?.find((task) => task.id === value);
  const displayText = isLoading
    ? t('form.loadingTasks')
    : value && value !== 'none' && selectedTask
      ? `${getTicketIdentifier(
          selectedTask.ticket_prefix,
          selectedTask.display_number ?? 0
        )} - ${selectedTask.name}`
      : value === 'none'
        ? t('form.noTask')
        : t('form.selectTask');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
          disabled={disabled || isLoading}
        >
          <span className="truncate">{displayText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={t('form.searchTasks')} />
          <CommandList>
            <CommandEmpty>{t('form.noTasksFound')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="none"
                onSelect={() => {
                  onValueChange('none');
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === 'none' ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {t('form.noTask')}
              </CommandItem>
              {tasks?.map(
                (task) =>
                  task.id && (
                    <CommandItem
                      key={task.id}
                      value={`${getTicketIdentifier(task.ticket_prefix, task.display_number ?? 0)} - ${task.name}`}
                      onSelect={() => {
                        onValueChange(task.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === task.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium text-muted-foreground text-xs">
                          {getTicketIdentifier(
                            task.ticket_prefix,
                            task.display_number ?? 0
                          )}
                        </span>
                        <span>{task.name}</span>
                      </div>
                    </CommandItem>
                  )
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
