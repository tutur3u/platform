'use client';

import { Check, ChevronsUpDown, Plus } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import * as React from 'react';
import { Button } from '../button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../command';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Separator } from '../separator';

export type ComboboxOption = {
  value: string;
  label: string;
};

export type ComboboxAction = {
  key: string;
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
};

/** @deprecated Use ComboboxOption instead */
export type ComboboxOptions = ComboboxOption;

type Mode = 'single' | 'multiple';

interface ComboboxProps {
  /** Options to display in the combobox */
  options: ComboboxOption[];
  /** Optional action items rendered separately from options */
  actions?: ComboboxAction[];
  /** Where to render action items relative to options */
  actionsPosition?: 'top' | 'bottom';
  /** Currently selected value(s) */
  selected: string | string[];
  /** Callback when selection changes */
  onChange?: (event: string | string[]) => void;
  /** Selection mode - 'single' or 'multiple' */
  mode?: Mode;
  /** Placeholder text for the trigger button when nothing is selected */
  placeholder?: string;
  /** Placeholder text for the search input */
  searchPlaceholder?: string;
  /** Text to display when no results are found */
  emptyText?: string;
  /** Text to display when creating a new item (used with onCreate) */
  createText?: string;
  /** Override label shown on the trigger button */
  label?: string;
  /** Additional class name for the container */
  className?: string;
  /** Whether the combobox is disabled */
  disabled?: boolean;
  /** Whether to select the first option by default */
  useFirstValueAsDefault?: boolean;
  /** Callback to create a new option from the search query */
  onCreate?: (value: string) => void;
  /**
   * Translation function (legacy support)
   * @deprecated Use emptyText, createText props instead
   */
  t?: (key: any) => any;
}

export function Combobox({
  options,
  actions,
  actionsPosition = 'bottom',
  selected,
  onChange,
  mode = 'single',
  placeholder = 'Select item...',
  searchPlaceholder,
  emptyText,
  createText,
  label,
  className,
  disabled,
  useFirstValueAsDefault = false,
  onCreate,
  t,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState<string>('');
  const actionValuePrefix = '__combobox_action__';

  // Resolve text with fallbacks: explicit prop > t function > default
  const resolvedEmptyText =
    emptyText ?? t?.('common.empty') ?? 'No results found.';
  const resolvedCreateText = createText ?? t?.('common.add') ?? 'Create';
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? placeholder ?? 'Search...';

  React.useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  React.useEffect(() => {
    if (selected) return;
    if (useFirstValueAsDefault && options.length > 0)
      onChange?.(options?.[0]?.value ?? '');
  }, [onChange, selected, options, useFirstValueAsDefault]);

  const selectedLabel =
    mode === 'single'
      ? options.find((option) => option.value === selected)?.label
      : mode === 'multiple' && Array.isArray(selected)
        ? selected
            .map(
              (selectedValue) =>
                options.find((option) => option.value === selectedValue)?.label
            )
            .filter(Boolean)
            .join(', ')
        : undefined;

  const isSelected = (value: string) => {
    if (mode === 'multiple' && Array.isArray(selected)) {
      return selected.includes(value);
    }
    return selected === value;
  };

  const renderActions = () => {
    if (!actions?.length) return null;

    return (
      <CommandGroup>
        {actions.map((action) => (
          <CommandItem
            key={action.key}
            value={`${actionValuePrefix}:${action.key}`}
            disabled={action.disabled}
            onSelect={() => {
              action.onSelect();
              setOpen(false);
              setQuery('');
            }}
            className="font-medium text-primary [&_svg]:text-primary"
          >
            {action.icon}
            <span className="truncate">{action.label}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    );
  };

  return (
    <div className={cn('block', className)}>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between',
              !selectedLabel && 'text-muted-foreground'
            )}
            disabled={disabled}
          >
            {label ?? selectedLabel ?? placeholder}
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-9999 w-(--radix-popover-trigger-width) p-0"
          align="start"
          sideOffset={4}
        >
          <Command
            filter={(value, search) => {
              if (value.startsWith(actionValuePrefix)) return 1;
              if (value.toLowerCase().includes(search.toLowerCase())) return 1;
              return 0;
            }}
          >
            <CommandInput
              placeholder={resolvedSearchPlaceholder}
              value={query}
              onValueChange={(value: string) => setQuery(value)}
            />
            <CommandEmpty className="flex flex-col items-center justify-center p-1">
              <div className="p-8 text-muted-foreground text-sm">
                {resolvedEmptyText}
              </div>
              {onCreate && (
                <>
                  <Separator />
                  <Button
                    variant="ghost"
                    className="mt-1 w-full"
                    onClick={() => {
                      if (onCreate) {
                        onCreate(query);
                        setOpen(false);
                        setQuery('');
                      }
                    }}
                    disabled={!query || !onCreate}
                  >
                    <Plus className="mr-2 h-4 w-4 shrink-0" />
                    <div className="w-full truncate">
                      <span className="font-normal">{resolvedCreateText}</span>{' '}
                      <span className="underline decoration-dashed underline-offset-2">
                        {query}
                      </span>
                    </div>
                  </Button>
                </>
              )}
            </CommandEmpty>
            <CommandList
              className="max-h-50 overflow-y-auto overscroll-contain"
              style={
                {
                  touchAction: 'pan-y',
                  WebkitOverflowScrolling: 'touch',
                } as React.CSSProperties
              }
            >
              {actionsPosition === 'top' && actions?.length ? (
                <>
                  {renderActions()}
                  <CommandSeparator />
                </>
              ) : null}
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      if (onChange) {
                        if (mode === 'multiple' && Array.isArray(selected)) {
                          onChange(
                            selected.includes(option.value)
                              ? selected.filter((item) => item !== option.value)
                              : [...selected, option.value]
                          );
                        } else {
                          onChange(option.value);
                        }
                      }
                      if (mode === 'single') {
                        setOpen(false);
                      }
                    }}
                  >
                    {option.label}
                    <Check
                      className={cn(
                        'ml-auto',
                        isSelected(option.value) ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
              {actionsPosition === 'bottom' && actions?.length ? (
                <>
                  <CommandSeparator />
                  {renderActions()}
                </>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
