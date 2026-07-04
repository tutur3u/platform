'use client';

import { Check, ChevronsUpDown } from '@tuturuuu/icons';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
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
import timezones from '@tuturuuu/utils/timezones';
import { useState } from 'react';
import type { MeetTogetherContent } from './meet-together-content';

export function TimezoneSelector({
  content,
  onValueChange,
  value,
}: {
  content: MeetTogetherContent['form'];
  onValueChange: (value: Timezone) => void;
  value?: Timezone;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="w-full @lg:min-w-96 @md:min-w-72 justify-between bg-background/50 transition hover:bg-background/80"
          role="combobox"
          variant="outline"
        >
          {value ? value.text : content.selectTimezone}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-96 w-full min-w-72 p-0">
        <Command>
          <CommandInput className="h-9" placeholder={content.selectTimezone} />
          <CommandList>
            <CommandEmpty>{content.noTimezoneFound}</CommandEmpty>
            <CommandGroup>
              {timezones.map((timezone) => (
                <CommandItem
                  key={`${timezone.text}-${timezone.value}`}
                  onSelect={() => {
                    onValueChange(timezone);
                    setOpen(false);
                  }}
                  value={`${timezone.value}${timezone.text}`}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value?.value === timezone.value
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  {timezone.text}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
