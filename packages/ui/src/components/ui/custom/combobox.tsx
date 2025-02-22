'use client';

import { Button } from '../button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '../command';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { ScrollArea } from '../scroll-area';
import { Separator } from '../separator';
import { cn } from '@tuturuuu/utils';
import { CommandList } from 'cmdk';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import * as React from 'react';

export type ComboboxOptions = {
  value: string;
  label: string;
};

type Mode = 'single' | 'multiple';

interface ComboboxProps {
  t: any;
  mode?: Mode;
  options: ComboboxOptions[];
  selected: string | string[]; // Updated to handle multiple selections
  className?: string;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  useFirstValueAsDefault?: boolean;
  // eslint-disable-next-line no-unused-vars
  onChange?: (event: string | string[]) => void; // Updated to handle multiple selections
  // eslint-disable-next-line no-unused-vars
  onCreate?: (value: string) => void;
}

export function Combobox({
  t,
  options,
  selected,
  className,
  placeholder,
  mode = 'single',
  label,
  disabled,
  useFirstValueAsDefault = false,
  onChange,
  onCreate,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState<string>('');

  React.useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  React.useEffect(() => {
    if (selected) return;
    if (useFirstValueAsDefault && options.length > 0)
      onChange?.(options?.[0]?.value ?? '');
  }, [onChange, selected, options]);

  return (
    <div className={cn('block', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between',
              !selected && !selected.length && 'text-muted-foreground'
            )}
            disabled={disabled}
          >
            {label ??
              (selected && selected.length > 0 ? (
                <div className="relative mr-auto flex flex-grow flex-wrap items-center overflow-hidden">
                  <span>
                    {mode === 'multiple' && Array.isArray(selected)
                      ? selected
                          .map(
                            (selectedValue: string) =>
                              options.find(
                                (item) => item.value === selectedValue
                              )?.label
                          )
                          .join(', ')
                      : mode === 'single' &&
                        options.find((item) => item.value === selected)?.label}
                  </span>
                </div>
              ) : (
                (placeholder ?? 'Select Item')
              ))}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 max-w-sm p-0">
          <Command
            filter={(value, search) => {
              if (value.includes(search)) return 1;
              return 0;
            }}
          >
            <CommandInput
              placeholder={placeholder ?? 'Search'}
              value={query}
              onValueChange={(value: string) => setQuery(value)}
            />
            <CommandEmpty className="flex flex-col items-center justify-center p-1">
              <div className="p-8 text-sm text-muted-foreground">
                {t('common.empty')}
              </div>
              {query && (
                <>
                  <Separator />
                  <Button
                    variant="ghost"
                    className="mt-1 w-full"
                    onClick={() => {
                      if (onCreate) {
                        onCreate(query);
                        setQuery('');
                      }
                    }}
                    disabled={!query || !onCreate}
                  >
                    <Plus className="mr-2 h-4 w-4 shrink-0" />
                    <div className="w-full truncate">
                      <span className="font-normal">{t('common.add')}</span>{' '}
                      <span className="underline decoration-dashed underline-offset-2">
                        {query}
                      </span>
                    </div>
                  </Button>
                </>
              )}
            </CommandEmpty>
            <ScrollArea>
              <div className="max-h-80">
                <CommandList>
                  <CommandGroup>
                    {options.map((option) => (
                      <CommandItem
                        key={option.label}
                        value={option.label}
                        onSelect={() => {
                          if (onChange) {
                            if (
                              mode === 'multiple' &&
                              Array.isArray(selected)
                            ) {
                              onChange(
                                selected.includes(option.value)
                                  ? selected.filter(
                                      (item) => item !== option.value
                                    )
                                  : [...selected, option.value]
                              );
                            } else {
                              onChange(option.value);
                            }
                          }
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selected.includes(option.value)
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </div>
            </ScrollArea>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
