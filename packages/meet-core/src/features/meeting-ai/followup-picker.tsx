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
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function FollowupPicker({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('meet.ai');
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {options.find((option) => option.id === value)?.label ??
                t('followup_choose')}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput
              placeholder={t('followup_search')}
              aria-label={label}
            />
            <CommandList>
              <CommandEmpty>{t('followup_no_matches')}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={`${option.label} ${option.id}`}
                    onSelect={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      aria-hidden
                      className={`mr-2 size-4 ${option.id === value ? 'opacity-100' : 'opacity-0'}`}
                    />
                    <span className="break-words">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
