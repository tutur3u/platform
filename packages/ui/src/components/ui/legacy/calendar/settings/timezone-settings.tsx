'use client';

import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Switch } from '@tuturuuu/ui/switch';
import { Check, ChevronDown, Search } from '@tuturuuu/ui/icons';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tuturuuu/ui/command';
import * as React from 'react';

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
  region: string;
  offset: string;
};

// Helper to get timezone offset and format
function getTimezoneInfo(timeZone: string): { offset: string; region: string } {
  try {
    const date = new Date();
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
    const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / 60000;
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const minutes = String(absOffset % 60).padStart(2, '0');
    const offset = `${sign}${hours}:${minutes}`;
    
    const parts = timeZone.split('/');
    const region = parts[0] || 'Other';
    
    return { offset, region };
  } catch {
    return { offset: '+00:00', region: 'Other' };
  }
}

// Common timezones that most users will need
const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Seoul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'Pacific/Honolulu',
] as const;

// Generate timezone list with better organization
const generateTimezones = (): TimezoneOption[] => {
  const timezones = Intl.supportedValuesOf('timeZone');
  const options: TimezoneOption[] = [
    { value: 'auto', label: 'Auto-detect (System)', region: 'System', offset: '' },
  ];

  // Add common timezones first
  COMMON_TIMEZONES.forEach((tz) => {
    if (timezones.includes(tz)) {
      const parts = tz.split('/');
      const cityName = parts[parts.length - 1]?.replace(/_/g, ' ') || tz;
      
      try {
        const date = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'long',
        });
        const timeZoneName = formatter.formatToParts(date).find(
          (part) => part.type === 'timeZoneName'
        )?.value || '';
        
        const { offset } = getTimezoneInfo(tz);
        
        options.push({
          value: tz,
          label: `${cityName} (${timeZoneName})`,
          region: 'Common',
          offset,
        });
      } catch {
        // Skip invalid timezones
      }
    }
  });

  // Add other timezones grouped by region (but limit to avoid overwhelming)
  const otherTimezones = timezones.filter(tz => !COMMON_TIMEZONES.includes(tz as typeof COMMON_TIMEZONES[number]));
  
  // Only add a subset of other timezones to avoid overwhelming the user
  const limitedOtherTimezones = otherTimezones.slice(0, 100); // Limit to 100 additional timezones
  
  limitedOtherTimezones.forEach((tz) => {
    const parts = tz.split('/');
    const region = parts[0] || 'Other';
    const cityName = parts[parts.length - 1]?.replace(/_/g, ' ') || tz;
    
    try {
      const date = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'long',
      });
      const timeZoneName = formatter.formatToParts(date).find(
        (part) => part.type === 'timeZoneName'
      )?.value || '';
      
      const { offset } = getTimezoneInfo(tz);
      
      options.push({
        value: tz,
        label: `${cityName} (${timeZoneName})`,
        region,
        offset,
      });
    } catch {
      // Skip invalid timezones
    }
  });

  // Sort by region priority, then by offset, then by city name
  const regionPriority = ['System', 'Common', 'America', 'Europe', 'Asia', 'Australia', 'Pacific', 'Africa', 'Antarctica', 'Arctic', 'Other'];
  
  return options.sort((a, b) => {
    const aPriority = regionPriority.indexOf(a.region);
    const bPriority = regionPriority.indexOf(b.region);
    
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.offset !== b.offset) return a.offset.localeCompare(b.offset);
    return a.label.localeCompare(b.label);
  });
};

const timezones = generateTimezones();

type TimezoneSettingsProps = {
  value: TimezoneData;
  onChange: (value: TimezoneData) => void;
};

export function TimezoneSettings({ value, onChange }: TimezoneSettingsProps) {
  const [primaryOpen, setPrimaryOpen] = React.useState(false);
  const [secondaryOpen, setSecondaryOpen] = React.useState(false);
  const [primarySearch, setPrimarySearch] = React.useState('');
  const [secondarySearch, setSecondarySearch] = React.useState('');

  // Helper function to get detected timezone
  const getDetectedTimezone = React.useCallback(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return null;
    }
  }, []);

  const handlePrimaryTimezoneChange = (timezone: string) => {
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
    setPrimarySearch('');
  };

  const handleSecondaryTimezoneChange = (timezone: string) => {
    onChange({
      ...value,
      secondaryTimezone: timezone,
    });
    setSecondaryOpen(false);
    setSecondarySearch('');
  };

  const handleShowSecondaryChange = (checked: boolean) => {
    onChange({
      ...value,
      showSecondaryTimezone: checked,
      secondaryTimezone: checked ? value.secondaryTimezone : undefined,
    });
  };

  const getSelectedTimezoneLabel = (timezone: string) => {
    if (timezone === 'auto') {
      const detectedTz = getDetectedTimezone();
      if (detectedTz) {
        try {
          const { offset } = getTimezoneInfo(detectedTz);
          const parts = detectedTz.split('/');
          const cityName = parts[parts.length - 1]?.replace(/_/g, ' ') || detectedTz;
          
          const date = new Date();
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: detectedTz,
            timeZoneName: 'long',
          });
          const timeZoneName = formatter.formatToParts(date).find(
            (part) => part.type === 'timeZoneName'
          )?.value || '';
          
          const label = timeZoneName ? `${cityName} (${timeZoneName})` : cityName;
          const offsetDisplay = offset ? ` ${offset}` : '';
          return `${label}${offsetDisplay} (Auto-detected)`;
        } catch {
          return 'Auto-detect (System)';
        }
      }
      return 'Auto-detect (System)';
    }
    
    const tz = timezones.find((t) => t.value === timezone);
    if (tz) {
      // Check if this is the auto-detected timezone
      const detectedTz = getDetectedTimezone();
      const isAutoDetected = detectedTz && timezone === detectedTz;
      const autoIndicator = isAutoDetected ? ' (Auto-detected)' : '';
      const offsetDisplay = tz.offset ? ` ${tz.offset}` : '';
      return `${tz.label}${offsetDisplay}${autoIndicator}`;
    }
    
    // If not found in our list, try to get info directly
    try {
      const { offset } = getTimezoneInfo(timezone);
      const detectedTz = getDetectedTimezone();
      const isAutoDetected = detectedTz && timezone === detectedTz;
      const autoIndicator = isAutoDetected ? ' (Auto-detected)' : '';
      const offsetDisplay = offset ? ` ${offset}` : '';
      
      // Try to get a readable name
      const parts = timezone.split('/');
      const cityName = parts[parts.length - 1]?.replace(/_/g, ' ') || timezone;
      
      const date = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'long',
      });
      const timeZoneName = formatter.formatToParts(date).find(
        (part) => part.type === 'timeZoneName'
      )?.value || '';
      
      const label = timeZoneName ? `${cityName} (${timeZoneName})` : cityName;
      return `${label}${offsetDisplay}${autoIndicator}`;
    } catch {
      return timezone;
    }
  };

  // Reusable function to filter timezones
  const filterTimezones = React.useCallback((
    search: string,
    baseTimezones: TimezoneOption[],
    excludeValue?: string
  ): TimezoneOption[] => {
    // Filter out excluded value if provided
    const filtered = excludeValue 
      ? baseTimezones.filter(tz => tz.value !== excludeValue)
      : baseTimezones;
    
    if (!search) return filtered;
    
    const searchLower = search.toLowerCase();
    const searchResults = filtered.filter(
      (tz) =>
        tz.label.toLowerCase().includes(searchLower) ||
        tz.value.toLowerCase().includes(searchLower) ||
        tz.region.toLowerCase().includes(searchLower) ||
        tz.offset.toLowerCase().includes(searchLower)
    );
    
    // If searching, also include any timezone that matches from the full list
    if (search.length > 2) {
      const allTimezones = Intl.supportedValuesOf('timeZone');
      const additionalMatches = allTimezones
        .filter(tz => {
          if (excludeValue && tz === excludeValue) return false;
          const tzLower = tz.toLowerCase();
          const cityName = tz.split('/').pop()?.replace(/_/g, ' ').toLowerCase() || '';
          return tzLower.includes(searchLower) || cityName.includes(searchLower);
        })
        .filter(tz => !searchResults.some(existing => existing.value === tz))
        .slice(0, 20) // Limit additional results
        .map(tz => {
          const parts = tz.split('/');
          const region = parts[0] || 'Other';
          const cityName = parts[parts.length - 1]?.replace(/_/g, ' ') || tz;
          
          try {
            const date = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: tz,
              timeZoneName: 'long',
            });
            const timeZoneName = formatter.formatToParts(date).find(
              (part) => part.type === 'timeZoneName'
            )?.value || '';
            
            const { offset } = getTimezoneInfo(tz);
            
            return {
              value: tz,
              label: `${cityName} (${timeZoneName})`,
              region,
              offset,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as TimezoneOption[];
      
      return [...searchResults, ...additionalMatches];
    }
    
    return searchResults;
  }, []);

  // Filter timezones based on search
  const filteredPrimaryTimezones = React.useMemo(
    () => filterTimezones(primarySearch, timezones),
    [filterTimezones, primarySearch]
  );

  const filteredSecondaryTimezones = React.useMemo(
    () => filterTimezones(secondarySearch, timezones, value.timezone),
    [filterTimezones, secondarySearch, value.timezone]
  );

  // Group timezones by region for better organization
  const groupedPrimaryTimezones = React.useMemo(() => {
    const groups: Record<string, TimezoneOption[]> = {};
    filteredPrimaryTimezones.filter(Boolean).forEach(tz => {
      if (!groups[tz.region]) {
        groups[tz.region] = [];
      }
      const group = groups[tz.region];
      if (group) {
        group.push(tz);
      }
    });
    return groups;
  }, [filteredPrimaryTimezones]);

  const groupedSecondaryTimezones = React.useMemo(() => {
    const groups: Record<string, TimezoneOption[]> = {};
    filteredSecondaryTimezones.filter(Boolean).forEach(tz => {
      if (!groups[tz.region]) {
        groups[tz.region] = [];
      }
      const group = groups[tz.region];
      if (group) {
        group.push(tz);
      }
    });
    return groups;
  }, [filteredSecondaryTimezones]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="timezone">Primary Timezone</Label>
        <Popover open={primaryOpen} onOpenChange={setPrimaryOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              aria-expanded={primaryOpen}
              className="w-full justify-between"
            >
              {getSelectedTimezoneLabel(value.timezone)}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command>
              <div className="flex items-center border-b px-3 py-2">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <CommandInput
                  placeholder="Search timezones..."
                  value={primarySearch}
                  onValueChange={setPrimarySearch}
                  className="border-0 focus:ring-0"
                />
              </div>
              <CommandList>
                <CommandEmpty>No timezone found.</CommandEmpty>
                <div 
                  className="h-[300px] overflow-y-auto"
                  // Custom scroll handling required - Command component interferes with natural scrolling in popover context
                  onWheel={(e) => {
                    e.stopPropagation();
                    const target = e.currentTarget;
                    target.scrollTop += e.deltaY;
                  }}
                >
                  {Object.entries(groupedPrimaryTimezones).map(([region, tzList]) => (
                    <CommandGroup key={region} heading={region}>
                      {tzList.map((tz) => (
                        <CommandItem
                          key={tz.value}
                          value={tz.value}
                          onSelect={() => handlePrimaryTimezoneChange(tz.value)}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center">
                            <span className="mr-2 text-xs text-muted-foreground w-16">
                              {tz.offset}
                            </span>
                            <span>{tz.label}</span>
                            {getDetectedTimezone() && tz.value === getDetectedTimezone() && (
                              <span className="ml-2 text-xs text-blue-400">(Auto-detected)</span>
                            )}
                          </div>
                          {tz.value === value.timezone && (
                            <Check className="ml-2 h-4 w-4" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </div>
              </CommandList>
            </Command>
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
                aria-expanded={secondaryOpen}
                className="w-full justify-between"
              >
                {value.secondaryTimezone
                  ? getSelectedTimezoneLabel(value.secondaryTimezone)
                  : 'Select secondary timezone'}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command>
                <div className="flex items-center border-b px-3 py-2">
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <CommandInput
                    placeholder="Search timezones..."
                    value={secondarySearch}
                    onValueChange={setSecondarySearch}
                    className="border-0 focus:ring-0"
                  />
                </div>
                <CommandList>
                  <CommandEmpty>No timezone found.</CommandEmpty>
                  <div 
                    className="h-[300px] overflow-y-auto"
                    // Custom scroll handling required - Command component interferes with natural scrolling in popover context
                    onWheel={(e) => {
                      e.stopPropagation();
                      const target = e.currentTarget;
                      target.scrollTop += e.deltaY;
                    }}
                  >
                    {Object.entries(groupedSecondaryTimezones).map(([region, tzList]) => (
                      <CommandGroup key={region} heading={region}>
                        {tzList.map((tz) => (
                          <CommandItem
                            key={tz.value}
                            value={tz.value}
                            onSelect={() => handleSecondaryTimezoneChange(tz.value)}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center">
                              <span className="mr-2 text-xs text-muted-foreground w-16">
                                {tz.offset}
                              </span>
                              <span>{tz.label}</span>
                              {getDetectedTimezone() && tz.value === getDetectedTimezone() && (
                                <span className="ml-2 text-xs text-blue-400">(Auto-detected)</span>
                              )}
                            </div>
                            {tz.value === value.secondaryTimezone && (
                              <Check className="ml-2 h-4 w-4" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </div>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
