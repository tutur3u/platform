'use client';

import { Check, X } from '@tuturuuu/icons';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import { type ComponentType, type ReactNode, useState } from 'react';
import {
  handleTaskOptionShortcut,
  TaskOptionShortcutHint,
} from '../../../task-option-shortcuts';
import { filterQuickCreateOptions } from './quick-create-values';

export interface QuickCreateOption {
  id: string;
  /** Text used for filtering and, without `content`, for display. */
  label: string;
  leading?: ReactNode;
  content?: ReactNode;
}

export interface QuickCreatePickerAction {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
}

interface QuickCreateOptionPickerProps {
  options: readonly QuickCreateOption[];
  selectedIds: readonly string[];
  searchPlaceholder: string;
  emptyLabel: string;
  onSelect: (id: string) => void;
  clearLabel?: string;
  onClear?: () => void;
  action?: QuickCreatePickerAction;
  /** Digits 1-9 pick the matching visible option. */
  numericShortcuts?: boolean;
}

/**
 * A keyboard-first option list: typing filters, arrows move, Enter picks,
 * and Escape bubbles to the popover so it closes before the dialog does.
 */
export function QuickCreateOptionPicker({
  options,
  selectedIds,
  searchPlaceholder,
  emptyLabel,
  onSelect,
  clearLabel,
  onClear,
  action,
  numericShortcuts = false,
}: QuickCreateOptionPickerProps) {
  const [query, setQuery] = useState('');
  const visibleOptions = filterQuickCreateOptions(
    options,
    query,
    (option) => option.label
  );
  const showClear = !!onClear && !!clearLabel && selectedIds.length > 0;
  const ActionIcon = action?.icon;

  return (
    <Command
      shouldFilter={false}
      className="rounded-none border-0"
      onKeyDownCapture={(event) =>
        handleTaskOptionShortcut(event, numericShortcuts, (digit) => {
          const option = digit > 0 ? visibleOptions[digit - 1] : undefined;
          if (!option) return false;
          onSelect(option.id);
          return true;
        })
      }
    >
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder={searchPlaceholder}
        className="h-9 max-sm:text-base"
      />
      <CommandList className="max-h-64">
        {visibleOptions.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-xs">
            {emptyLabel}
          </div>
        ) : (
          <CommandGroup>
            {visibleOptions.map((option, index) => {
              const selected = selectedIds.includes(option.id);
              return (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  data-checked={selected ? 'true' : undefined}
                  onSelect={() => onSelect(option.id)}
                  className="min-h-9 gap-2"
                >
                  {option.leading}
                  <span className="min-w-0 flex-1 truncate">
                    {option.content ?? option.label}
                  </span>
                  <TaskOptionShortcutHint
                    digit={index + 1}
                    visible={numericShortcuts && index < 9}
                  />
                  {selected ? (
                    <Check
                      aria-hidden="true"
                      className="size-4 shrink-0 text-primary"
                    />
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {showClear || action ? (
          <>
            <CommandSeparator />
            <CommandGroup>
              {showClear ? (
                <CommandItem
                  value="__clear__"
                  onSelect={onClear}
                  className="gap-2 text-muted-foreground"
                >
                  <X aria-hidden="true" className="size-4" />
                  {clearLabel}
                </CommandItem>
              ) : null}
              {action && ActionIcon ? (
                <CommandItem
                  value="__action__"
                  onSelect={action.onSelect}
                  className="gap-2 text-muted-foreground"
                >
                  <ActionIcon className="size-4" />
                  {action.label}
                </CommandItem>
              ) : null}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </Command>
  );
}
