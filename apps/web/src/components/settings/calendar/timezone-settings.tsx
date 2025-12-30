'use client';

import { Check, ChevronDown } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Switch } from '@tuturuuu/ui/switch';
import React from 'react';

export type TimezoneData = {
  timezone: string;
  showSecondaryTimezone: boolean;
  secondaryTimezone?: string;
};

export const defaultTimezoneData: TimezoneData = {
  timezone: 'auto',
  showSecondaryTimezone: false,
};

type TimezoneOption = {
  value: string;
  label: string;
};

type TimezoneGroups = {
  [key: string]: TimezoneOption[];
};

// Helper to get numeric offset in minutes and formatted string
function getTimezoneOffsetInfo(
  timeZone: string,
  date: Date = new Date()
): { offsetMinutes: number; offsetString: string } {
  try {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
    const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / 60000;
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const minutes = String(absOffset % 60).padStart(2, '0');
    return {
      offsetMinutes,
      offsetString: `${sign}${hours}:${minutes}`,
    };
  } catch {
    return { offsetMinutes: 0, offsetString: '+00:00' };
  }
}

// Generate timezone list grouped by region/continent and sorted by offset
const generateTimezoneList = (): TimezoneGroups => {
  const timezones = Intl.supportedValuesOf('timeZone');
  const groups: TimezoneGroups = {
    'Auto & UTC': [
      { value: 'auto', label: 'Auto-detect (System)' },
      { value: 'UTC', label: '+00:00 – UTC (Coordinated Universal Time)' },
    ],
  };

  // Build a map of region -> array of timezones with offset info
  const regionMap: Record<
    string,
    Array<{ value: string; label: string; offsetMinutes: number; city: string }>
  > = {};

  timezones.forEach((tz) => {
    const parts = tz.split('/');
    const region = parts[0] || 'Other';
    const cityName = parts[parts.length - 1]?.replace(/_/g, ' ') || tz;
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'long',
    });
    const timeZoneName =
      formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')
        ?.value || '';
    const { offsetMinutes, offsetString } = getTimezoneOffsetInfo(tz, date);
    if (!regionMap[region]) regionMap[region] = [];
    regionMap[region].push({
      value: tz,
      label: `${offsetString} – ${cityName} (${timeZoneName})`,
      offsetMinutes,
      city: cityName,
    });
  });

  // Sort each region's timezones by offset, then by city name
  Object.keys(regionMap).forEach((region) => {
    if (regionMap[region]) {
      regionMap[region]!.sort(
        (a, b) =>
          a.offsetMinutes - b.offsetMinutes || a.city.localeCompare(b.city)
      );
      groups[region] = regionMap[region]!.map(({ value, label }) => ({
        value,
        label,
      }));
    }
  });

  return groups;
};

const timezoneGroups = generateTimezoneList();
const allTimezones = Object.values(timezoneGroups).flat();

// Helper function to filter timezones
const filterTimezones = (query: string): TimezoneGroups => {
  if (!query) return timezoneGroups;

  const searchQuery = query.toLowerCase();
  const filtered = allTimezones.filter(
    (tz) =>
      tz.label.toLowerCase().includes(searchQuery) ||
      tz.value.toLowerCase().includes(searchQuery)
  );

  return { 'Search Results': filtered } as TimezoneGroups;
};

type TimezoneSettingsProps = {
  value: TimezoneData;
  onChange: (value: TimezoneData) => void;
};

export function TimezoneSettings({ value, onChange }: TimezoneSettingsProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [secondarySearchQuery, setSecondarySearchQuery] = React.useState('');
  const [primaryOpen, setPrimaryOpen] = React.useState(false);
  const [secondaryOpen, setSecondaryOpen] = React.useState(false);
  const [recentTimezones, setRecentTimezones] = React.useState<string[]>([]);
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);
  const [activeSecondaryIndex, setActiveSecondaryIndex] =
    React.useState<number>(-1);
  const scrollToDetectedRef = React.useRef<HTMLDivElement>(null);
  const scrollToRegionRef = React.useRef<HTMLDivElement>(null);

  const filteredTimezones = React.useMemo(
    () => filterTimezones(searchQuery),
    [searchQuery]
  );
  const filteredSecondaryTimezones = React.useMemo(
    () => filterTimezones(secondarySearchQuery),
    [secondarySearchQuery]
  );

  // Flatten filtered timezones for keyboard navigation
  const flatFilteredTimezones = React.useMemo(() => {
    return Object.values(filteredTimezones).flat();
  }, [filteredTimezones]);
  const flatFilteredSecondaryTimezones = React.useMemo(() => {
    return Object.values(filteredSecondaryTimezones).flat();
  }, [filteredSecondaryTimezones]);

  // Get all region group names (excluding 'Auto & UTC')
  const regionGroupNames = React.useMemo(
    () => Object.keys(timezoneGroups).filter((g) => g !== 'Auto & UTC'),
    []
  );

  React.useEffect(() => {
    setActiveIndex(
      flatFilteredTimezones.findIndex((tz) => tz.value === value.timezone)
    );
  }, [flatFilteredTimezones.findIndex, value.timezone]);
  React.useEffect(() => {
    setActiveSecondaryIndex(
      flatFilteredSecondaryTimezones.findIndex(
        (tz) => tz.value === value.secondaryTimezone
      )
    );
  }, [flatFilteredSecondaryTimezones.findIndex, value.secondaryTimezone]);

  // Detect user's timezone on mount
  React.useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // If auto is selected, update the timezone
      if (value.timezone === 'auto') {
        onChange({
          ...value,
          timezone: tz,
        });
      }
    } catch (error) {
      console.error('Failed to detect timezone:', error);
    }
  }, [onChange, value]);

  const handleTimezoneChange = (timezone: string) => {
    // Update recent timezones
    setRecentTimezones((prev) => {
      const filtered = prev.filter((tz) => tz !== timezone);
      return [timezone, ...filtered].slice(0, 5);
    });

    // If the new primary timezone matches the secondary, clear the secondary
    if (timezone === value.secondaryTimezone) {
      onChange({
        ...value,
        timezone,
        secondaryTimezone: undefined,
      });
    } else {
      onChange({
        ...value,
        timezone,
      });
    }
    setPrimaryOpen(false);
  };

  const handleSecondaryTimezoneChange = (timezone: string) => {
    onChange({
      ...value,
      secondaryTimezone: timezone,
    });
    setSecondaryOpen(false);
  };

  const handleShowSecondaryChange = (checked: boolean) => {
    onChange({
      ...value,
      showSecondaryTimezone: checked,
      secondaryTimezone: checked ? value.secondaryTimezone : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!primaryOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatFilteredTimezones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (
      e.key === 'Enter' &&
      activeIndex >= 0 &&
      activeIndex < flatFilteredTimezones.length
    ) {
      e.preventDefault();
      const tz = flatFilteredTimezones[activeIndex];
      if (tz) handleTimezoneChange(tz.value);
    }
  };
  const handleSecondaryKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!secondaryOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSecondaryIndex((i) =>
        Math.min(i + 1, flatFilteredSecondaryTimezones.length - 1)
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSecondaryIndex((i) => Math.max(i - 1, 0));
    } else if (
      e.key === 'Enter' &&
      activeSecondaryIndex >= 0 &&
      activeSecondaryIndex < flatFilteredSecondaryTimezones.length
    ) {
      e.preventDefault();
      const tz = flatFilteredSecondaryTimezones[activeSecondaryIndex];
      if (tz) handleSecondaryTimezoneChange(tz.value);
    }
  };

  // Helper to update active index on mouse/touch
  const updateActiveIndex = (idx: number, isSecondary = false) => {
    if (isSecondary) setActiveSecondaryIndex(idx);
    else setActiveIndex(idx);
  };

  // Handler for jump to region group
  const handleJumpToRegionGroup = (region: string) => {
    const groupIdx = regionGroupNames.indexOf(region);
    if (groupIdx === -1) return;
    setTimeout(() => {
      if (!scrollToRegionRef.current) return;
      const headings = scrollToRegionRef.current.querySelectorAll(
        '[data-region-group]'
      );
      const heading = headings.item(groupIdx);
      if (heading) {
        (heading as HTMLElement).scrollIntoView({ block: 'start' });
      }
    }, 0);
  };

  const renderTimezoneGroups = (
    timezones: TimezoneGroups,
    selectedTimezone?: string,
    excludeTimezone?: string,
    disabledTimezones: string[] = [],
    onSelect?: (tz: string) => void,
    activeIdx?: number,
    _flatList?: TimezoneOption[],
    isSecondary?: boolean
  ) => {
    let itemIdx = -1;
    return (
      <>
        {Object.entries(timezones).map(
          ([group, tzList], idx, arr) =>
            tzList.length > 0 && (
              <div key={group} data-region-group className="py-1">
                <div className="rounded-t-md bg-muted px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                  {group}
                </div>
                {tzList
                  .filter(
                    (tz) => !excludeTimezone || tz.value !== excludeTimezone
                  )
                  .map((tz) => {
                    itemIdx++;
                    const isDisabled = disabledTimezones.includes(tz.value);
                    const isSelected = tz.value === selectedTimezone;
                    const isActive = activeIdx === itemIdx;
                    return (
                      <button
                        type="button"
                        key={tz.value}
                        role="option"
                        aria-selected={isSelected}
                        className={`flex w-full items-center rounded-md px-2 py-2 text-left text-sm transition-colors ${isSelected ? 'bg-accent font-semibold text-accent-foreground' : ''} ${isActive ? 'bg-muted text-foreground' : 'hover:bg-accent hover:text-accent-foreground'} ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        onClick={() =>
                          !isDisabled && onSelect && onSelect(tz.value)
                        }
                        disabled={isDisabled}
                        tabIndex={-1}
                        ref={(el) => {
                          if (isActive && el)
                            el.scrollIntoView({ block: 'nearest' });
                        }}
                        onMouseMove={() =>
                          updateActiveIndex(itemIdx, isSecondary)
                        }
                        onTouchStart={() =>
                          updateActiveIndex(itemIdx, isSecondary)
                        }
                      >
                        <span className="block max-w-full flex-1 truncate whitespace-nowrap">
                          {tz.label}
                        </span>
                        {isSelected && (
                          <Check className="ml-2 h-4 w-4 text-primary" />
                        )}
                      </button>
                    );
                  })}
                {idx < arr.length - 1 && (
                  <div className="mx-2 my-2 h-px bg-border" />
                )}
              </div>
            )
        )}
      </>
    );
  };

  const getSelectedTimezoneLabel = (timezone: string) => {
    if (timezone === 'auto') return 'Auto-detect (System)';
    const tz = allTimezones.find((t) => t.value === timezone);
    return tz?.label || timezone;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="timezone">Primary Timezone</Label>
        <Popover open={primaryOpen} onOpenChange={setPrimaryOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={primaryOpen}
              className="w-full justify-between"
            >
              {getSelectedTimezoneLabel(value.timezone)}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="pointer-events-auto min-w-(--radix-popover-trigger-width) rounded-lg border bg-popover p-0 shadow-lg"
            align="start"
            role="listbox"
            tabIndex={0}
            style={{ touchAction: 'pan-y' }}
          >
            <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-t-lg border-b bg-background p-2">
              <input
                type="text"
                placeholder="Search timezone..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="mb-1 flex flex-wrap gap-1">
                {regionGroupNames.map((region) => (
                  <Button
                    key={region}
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="rounded border border-border px-2 py-1 text-xs"
                    onClick={() => handleJumpToRegionGroup(region)}
                  >
                    {region}
                  </Button>
                ))}
              </div>
            </div>
            <div
              className="pointer-events-auto max-h-[320px] overflow-y-auto rounded-b-lg"
              onKeyDown={handleKeyDown}
              role="presentation"
              style={{ touchAction: 'pan-y' }}
              ref={(el) => {
                scrollToDetectedRef.current = el;
                scrollToRegionRef.current = el;
              }}
            >
              {recentTimezones.length > 0 && !searchQuery && (
                <div className="py-1">
                  <div className="rounded-t-md bg-muted px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                    Recent Timezones
                  </div>
                  {recentTimezones.map((tz, idx) => {
                    const timezone = allTimezones.find((t) => t.value === tz);
                    if (!timezone) return null;
                    const isSelected = tz === value.timezone;
                    const isActive = activeIndex === idx;
                    return (
                      <button
                        type="button"
                        key={tz}
                        role="option"
                        aria-selected={isSelected}
                        className={`flex w-full items-center rounded-md px-2 py-2 text-left text-sm transition-colors ${isSelected ? 'bg-accent font-semibold text-accent-foreground' : ''} ${isActive ? 'bg-muted text-foreground' : 'hover:bg-accent hover:text-accent-foreground'} ${tz === value.secondaryTimezone ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        onClick={() =>
                          tz !== value.secondaryTimezone &&
                          handleTimezoneChange(tz)
                        }
                        disabled={tz === value.secondaryTimezone}
                        tabIndex={-1}
                        ref={(el) => {
                          if (isActive && el)
                            el.scrollIntoView({ block: 'nearest' });
                        }}
                        onMouseMove={() => updateActiveIndex(idx)}
                        onTouchStart={() => updateActiveIndex(idx)}
                      >
                        <span className="block max-w-full flex-1 truncate whitespace-nowrap">
                          {timezone.label}
                        </span>
                        {isSelected && (
                          <Check className="ml-2 h-4 w-4 text-primary" />
                        )}
                      </button>
                    );
                  })}
                  <div className="mx-2 my-2 h-px bg-border" />
                </div>
              )}
              {Object.entries(filteredTimezones).map(
                ([group, tzList]) =>
                  tzList.length > 0 &&
                  group !== 'Auto & UTC' && (
                    <div key={group} data-region-group className="py-1">
                      <div className="rounded-t-md bg-muted px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                        {group}
                      </div>
                      {tzList.map((tz, idx) => {
                        const isDisabled = value.secondaryTimezone
                          ? tz.value === value.secondaryTimezone
                          : false;
                        const isSelected = tz.value === value.timezone;
                        const isActive = activeIndex === idx; // This may need to be adjusted for flat index
                        return (
                          <button
                            type="button"
                            key={tz.value}
                            role="option"
                            aria-selected={isSelected}
                            className={`flex w-full items-center rounded-md px-2 py-2 text-left text-sm transition-colors ${isSelected ? 'bg-accent font-semibold text-accent-foreground' : ''} ${isActive ? 'bg-muted text-foreground' : 'hover:bg-accent hover:text-accent-foreground'} ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            onClick={() =>
                              !isDisabled && handleTimezoneChange(tz.value)
                            }
                            disabled={isDisabled}
                            tabIndex={-1}
                          >
                            <span className="block max-w-full flex-1 truncate whitespace-nowrap">
                              {tz.label}
                            </span>
                            {isSelected && (
                              <Check className="ml-2 h-4 w-4 text-primary" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="show-secondary"
          checked={value.showSecondaryTimezone}
          onCheckedChange={handleShowSecondaryChange}
        />
        <Label htmlFor="show-secondary">Show secondary timezone</Label>
      </div>

      {value.showSecondaryTimezone && (
        <div className="space-y-2">
          <Label htmlFor="secondary-timezone">Secondary Timezone</Label>
          <Popover open={secondaryOpen} onOpenChange={setSecondaryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={secondaryOpen}
                className="w-full justify-between"
              >
                {value.secondaryTimezone
                  ? getSelectedTimezoneLabel(value.secondaryTimezone)
                  : 'Select secondary timezone'}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="pointer-events-auto min-w-(--radix-popover-trigger-width) rounded-lg border bg-popover p-0 shadow-lg"
              align="start"
              role="listbox"
              tabIndex={0}
              style={{ touchAction: 'pan-y' }}
            >
              <div className="sticky top-0 z-10 rounded-t-lg border-b bg-background p-2">
                <input
                  type="text"
                  placeholder="Search timezone..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={secondarySearchQuery}
                  onChange={(e) => setSecondarySearchQuery(e.target.value)}
                  onKeyDown={handleSecondaryKeyDown}
                />
              </div>
              <div
                className="pointer-events-auto max-h-[320px] overflow-y-auto rounded-b-lg"
                onKeyDown={handleSecondaryKeyDown}
                role="presentation"
                style={{ touchAction: 'pan-y' }}
              >
                {renderTimezoneGroups(
                  filteredSecondaryTimezones,
                  value.secondaryTimezone,
                  undefined,
                  [value.timezone],
                  handleSecondaryTimezoneChange,
                  activeSecondaryIndex,
                  flatFilteredSecondaryTimezones,
                  true
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
