'use client';

import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@tuturuuu/ui/select';
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

// Group timezones by continent/region
const timezoneGroups: TimezoneGroups = {
  'Auto & UTC': [
    { value: 'auto', label: 'Auto-detect (System)' },
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  ],
  'North America (UTC-10 to -4)': [
    { value: 'America/Adak', label: 'Hawaii-Aleutian Time (HAT) - UTC-10:00' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKT) - UTC-09:00' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT) - UTC-08:00' },
    { value: 'America/Denver', label: 'Mountain Time (MT) - UTC-07:00' },
    { value: 'America/Phoenix', label: 'Mountain Time (MT) - UTC-07:00 (No DST)' },
    { value: 'America/Chicago', label: 'Central Time (CT) - UTC-06:00' },
    { value: 'America/New_York', label: 'Eastern Time (ET) - UTC-05:00' },
    { value: 'America/Halifax', label: 'Atlantic Time (AT) - UTC-04:00' },
  ],
  'South America (UTC-5 to -3)': [
    { value: 'America/Lima', label: 'Peru Time (PET) - UTC-05:00' },
    { value: 'America/Caracas', label: 'Venezuela Time (VET) - UTC-04:00' },
    { value: 'America/Santiago', label: 'Chile Time (CLT) - UTC-04:00' },
    { value: 'America/Argentina/Buenos_Aires', label: 'Argentina Time (ART) - UTC-03:00' },
    { value: 'America/Sao_Paulo', label: 'Brasilia Time (BRT) - UTC-03:00' },
  ],
  'Europe (UTC+0 to +3)': [
    { value: 'Europe/London', label: 'Greenwich Mean Time (GMT) - UTC+00:00' },
    { value: 'Europe/Paris', label: 'Central European Time (CET) - UTC+01:00' },
    { value: 'Europe/Berlin', label: 'Central European Time (CET) - UTC+01:00' },
    { value: 'Europe/Helsinki', label: 'Eastern European Time (EET) - UTC+02:00' },
    { value: 'Europe/Moscow', label: 'Moscow Standard Time (MSK) - UTC+03:00' },
  ],
  'Africa (UTC+0 to +3)': [
    { value: 'Africa/Casablanca', label: 'Morocco Time (WET) - UTC+00:00' },
    { value: 'Africa/Lagos', label: 'West Africa Time (WAT) - UTC+01:00' },
    { value: 'Africa/Cairo', label: 'Eastern European Time (EET) - UTC+02:00' },
    { value: 'Africa/Johannesburg', label: 'South Africa Standard Time (SAST) - UTC+02:00' },
    { value: 'Africa/Nairobi', label: 'East Africa Time (EAT) - UTC+03:00' },
  ],
  'Middle East (UTC+2 to +4)': [
    { value: 'Asia/Jerusalem', label: 'Israel Standard Time (IST) - UTC+02:00' },
    { value: 'Asia/Amman', label: 'Eastern European Time (EET) - UTC+02:00' },
    { value: 'Asia/Riyadh', label: 'Arabia Standard Time (AST) - UTC+03:00' },
    { value: 'Asia/Tehran', label: 'Iran Standard Time (IRST) - UTC+03:30' },
    { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST) - UTC+04:00' },
  ],
  'Asia (UTC+5:30 to +9)': [
    { value: 'Asia/Kolkata', label: 'India Standard Time (IST) - UTC+05:30' },
    { value: 'Asia/Kathmandu', label: 'Nepal Time (NPT) - UTC+05:45' },
    { value: 'Asia/Dhaka', label: 'Bangladesh Standard Time (BST) - UTC+06:00' },
    { value: 'Asia/Bangkok', label: 'Indochina Time (ICT) - UTC+07:00' },
    { value: 'Asia/Singapore', label: 'Singapore Time (SGT) - UTC+08:00' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong Time (HKT) - UTC+08:00' },
    { value: 'Asia/Manila', label: 'Philippine Time (PHT) - UTC+08:00' },
    { value: 'Asia/Shanghai', label: 'China Standard Time (CST) - UTC+08:00' },
    { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST) - UTC+09:00' },
    { value: 'Asia/Seoul', label: 'Korea Standard Time (KST) - UTC+09:00' },
  ],
  'Oceania (UTC+8 to +12)': [
    { value: 'Australia/Perth', label: 'Australian Western Time (AWST) - UTC+08:00' },
    { value: 'Australia/Darwin', label: 'Australian Central Time (ACST) - UTC+09:30 (No DST)' },
    { value: 'Australia/Adelaide', label: 'Australian Central Time (ACST) - UTC+09:30' },
    { value: 'Australia/Brisbane', label: 'Australian Eastern Time (AEST) - UTC+10:00 (No DST)' },
    { value: 'Australia/Sydney', label: 'Australian Eastern Time (AEST) - UTC+10:00' },
    { value: 'Pacific/Guam', label: 'Chamorro Standard Time (ChST) - UTC+10:00' },
    { value: 'Pacific/Auckland', label: 'New Zealand Standard Time (NZST) - UTC+12:00' },
    { value: 'Pacific/Fiji', label: 'Fiji Time (FJT) - UTC+12:00' },
  ],
};

// Flatten timezones for search
const allTimezones = Object.values(timezoneGroups).flat();

// Helper function to get UTC offset from timezone
const getUTCOffset = (timezone: string): string | null => {
  if (timezone === 'auto') {
    // Use browser's system timezone
    try {
      const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!systemTz) return null;
      const date = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: systemTz,
        timeZoneName: 'short',
      });
      const parts = formatter.formatToParts(date);
      const offset = parts.find(part => part.type === 'timeZoneName')?.value;
      return offset || null;
    } catch {
      return null;
    }
  }
  if (timezone === 'UTC') return 'UTC+00:00';
  try {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(date);
    const offset = parts.find(part => part.type === 'timeZoneName')?.value;
    return offset || null;
  } catch {
    return null;
  }
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

  const handleTimezoneChange = (timezone: string) => {
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

  const handleToggleChange = (field: keyof TimezoneData, checked: boolean) => {
    // Only handle showSecondaryTimezone toggle
    if (field === 'showSecondaryTimezone') {
      if (!checked) {
        onChange({
          ...value,
          showSecondaryTimezone: checked,
          secondaryTimezone: undefined,
        });
      } else {
        onChange({
          ...value,
          showSecondaryTimezone: checked,
        });
      }
    }
  };

  const filteredTimezones = React.useMemo(() => {
    if (!searchQuery) return timezoneGroups;
    
    const query = searchQuery.toLowerCase();
    const filtered = allTimezones.filter(tz => 
      tz.label.toLowerCase().includes(query) || 
      tz.value.toLowerCase().includes(query)
    );
    
    return { 'Search Results': filtered } as TimezoneGroups;
  }, [searchQuery]);

  const filteredSecondaryTimezones = React.useMemo(() => {
    if (!secondarySearchQuery) return timezoneGroups;
    
    const query = secondarySearchQuery.toLowerCase();
    const filtered = allTimezones.filter(tz => 
      tz.label.toLowerCase().includes(query) || 
      tz.value.toLowerCase().includes(query)
    );
    
    return { 'Search Results': filtered } as TimezoneGroups;
  }, [secondarySearchQuery]);

  const renderTimezoneGroups = (
    timezones: TimezoneGroups, 
    excludeTimezone?: string,
    disabledTimezones: string[] = []
  ) => {
    const primaryOffset = value.timezone !== 'auto' ? getUTCOffset(value.timezone) : null;
    
    return (
      <>
        {Object.entries(timezones).map(([group, timezones]) => (
          timezones.length > 0 && (
            <SelectGroup key={group}>
              <SelectLabel className="px-2 py-1.5 text-sm font-semibold">
                {group}
              </SelectLabel>
              {timezones
                .filter(tz => !excludeTimezone || tz.value !== excludeTimezone)
                .map((tz) => {
                  const tzOffset = getUTCOffset(tz.value);
                  const isDisabled = disabledTimezones.includes(tz.value);
                  
                  return (
                    <SelectItem 
                      key={tz.value} 
                      value={tz.value}
                      disabled={isDisabled}
                      className={isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                    >
                      <span className="block truncate whitespace-nowrap max-w-full">{tz.label}</span>
                      {isDisabled && ' (Selected)'}
                    </SelectItem>
                  );
                })}
              <SelectSeparator />
            </SelectGroup>
          )
        ))}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="timezone">Primary Timezone</Label>
        <Select 
          value={value.timezone} 
          onValueChange={handleTimezoneChange}
          open={primaryOpen}
          onOpenChange={setPrimaryOpen}
        >
          <SelectTrigger id="timezone" className="w-full">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent className="overflow-x-hidden w-full max-w-full">
            <div className="sticky top-0 z-10 bg-background p-2">
              <input
                type="text"
                placeholder="Search timezone..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto overflow-x-hidden w-full">
              {renderTimezoneGroups(
                filteredTimezones,
                undefined,
                value.secondaryTimezone ? [value.secondaryTimezone] : []
              )}
            </div>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="show-secondary"
          checked={value.showSecondaryTimezone}
          onCheckedChange={(checked) =>
            handleToggleChange('showSecondaryTimezone', checked)
          }
        />
        <Label htmlFor="show-secondary">Show secondary timezone</Label>
      </div>

      {value.showSecondaryTimezone && (
        <div className="space-y-2">
          <Label htmlFor="secondary-timezone">Secondary Timezone</Label>
          <Select
            value={value.secondaryTimezone || ''}
            onValueChange={handleSecondaryTimezoneChange}
            open={secondaryOpen}
            onOpenChange={setSecondaryOpen}
          >
            <SelectTrigger id="secondary-timezone" className="w-full">
              <SelectValue placeholder="Select secondary timezone" />
            </SelectTrigger>
            <SelectContent className="overflow-x-hidden w-full max-w-full">
              <div className="sticky top-0 z-10 bg-background p-2">
                <input
                  type="text"
                  placeholder="Search timezone..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={secondarySearchQuery}
                  onChange={(e) => setSecondarySearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto overflow-x-hidden w-full">
                {renderTimezoneGroups(
                  filteredSecondaryTimezones,
                  undefined,
                  [value.timezone]
                )}
              </div>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
