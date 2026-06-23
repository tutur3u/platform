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
import bundledTimezones from '@tuturuuu/utils/timezones';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';

type BundledTimezone = {
  text: string;
  utc: string[];
};

type TimezoneGroup =
  | 'timezone_group_all'
  | 'timezone_group_current'
  | 'timezone_group_suggested';

type TimezoneOption = {
  group: TimezoneGroup;
  label: string;
  offsetLabel: string;
  value: string;
};

const pinnedTimezones = [
  DEFAULT_SCHEDULE_TIMEZONE,
  'UTC',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
];

function supportedTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch {
    return [];
  }

  return [];
}

function getTimezoneOffsetMinutes(timeZone: string, date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone,
      year: 'numeric',
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(date).map((part) => [part.type, part.value])
    );
    const zonedTimestamp = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );

    return Math.round((zonedTimestamp - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function formatTimezoneOffset(timeZone: string) {
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  const paddedHours = String(hours).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');
  const compactGmt =
    minutes === 0
      ? `GMT${sign}${hours}`
      : `GMT${sign}${hours}:${paddedMinutes}`;

  return `UTC${sign}${paddedHours}:${paddedMinutes} / ${compactGmt}`;
}

function buildTimezoneOptions(currentValue: string) {
  const options = new Map<string, TimezoneOption>();
  const addOption = (
    value: string,
    label?: string,
    group: TimezoneGroup = 'timezone_group_all'
  ) => {
    if (!value || options.has(value)) return;
    options.set(value, {
      group,
      label: label ?? value.replace(/_/g, ' '),
      offsetLabel: formatTimezoneOffset(value),
      value,
    });
  };

  for (const value of pinnedTimezones) {
    addOption(value, value, 'timezone_group_suggested');
  }

  if (currentValue) {
    addOption(currentValue, currentValue, 'timezone_group_current');
  }

  for (const value of supportedTimezones()) {
    addOption(value);
  }

  for (const timezone of bundledTimezones as BundledTimezone[]) {
    for (const value of timezone.utc) {
      addOption(value, timezone.text);
    }
  }

  return Array.from(options.values()).sort((a, b) => {
    const aPinned = pinnedTimezones.indexOf(a.value);
    const bPinned = pinnedTimezones.indexOf(b.value);
    if (aPinned !== -1 || bPinned !== -1) {
      return (
        (aPinned === -1 ? 999 : aPinned) - (bPinned === -1 ? 999 : bPinned)
      );
    }

    return a.value.localeCompare(b.value);
  });
}

function timezoneGroupLabel(
  t: ReturnType<typeof useTranslations<'ws-user-group-schedule'>>,
  group: TimezoneGroup
) {
  switch (group) {
    case 'timezone_group_current':
      return t('timezone_group_current');
    case 'timezone_group_suggested':
      return t('timezone_group_suggested');
    default:
      return t('timezone_group_all');
  }
}

export function SessionTimezoneCombobox({
  ariaLabel,
  className,
  emptyLabel,
  leadingIcon,
  onValueChange,
  placeholder,
  searchPlaceholder,
  value,
}: {
  ariaLabel: string;
  className?: string;
  emptyLabel: string;
  leadingIcon?: ReactNode;
  onValueChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  value: string;
}) {
  const t = useTranslations('ws-user-group-schedule');
  const [open, setOpen] = useState(false);
  const options = useMemo(() => buildTimezoneOptions(value), [value]);
  const selected = options.find((option) => option.value === value);
  const groupedOptions = useMemo(() => {
    const groups = new Map<TimezoneGroup, TimezoneOption[]>();
    for (const option of options) {
      const rows = groups.get(option.group) ?? [];
      rows.push(option);
      groups.set(option.group, rows);
    }
    return groups;
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            'min-w-0 justify-between overflow-hidden bg-background font-normal',
            className
          )}
          role="combobox"
          variant="outline"
        >
          <span className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            {leadingIcon ? (
              <span className="shrink-0 text-muted-foreground">
                {leadingIcon}
              </span>
            ) : (
              <span />
            )}
            <span className="min-w-0 truncate text-left">
              {selected?.value ?? value ?? placeholder}
            </span>
            {selected ? (
              <span className="max-w-36 shrink-0 truncate text-muted-foreground text-xs">
                {selected.offsetLabel}
              </span>
            ) : (
              <span />
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0">
        <Command>
          <CommandInput className="h-9" placeholder={searchPlaceholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {Array.from(groupedOptions.entries()).map(([group, rows]) => (
              <CommandGroup key={group} heading={timezoneGroupLabel(t, group)}>
                {rows.map((option) => (
                  <CommandItem
                    key={`${option.group}-${option.value}`}
                    value={`${option.value} ${option.label} ${option.offsetLabel}`}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4',
                        option.value === value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate font-medium text-sm">
                          {option.value}
                        </span>
                        <span className="shrink-0 text-muted-foreground text-xs">
                          {option.offsetLabel}
                        </span>
                      </div>
                      {option.label !== option.value ? (
                        <div className="truncate text-muted-foreground text-xs">
                          {option.label}
                        </div>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
