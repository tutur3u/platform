'use client';

import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';

export type TimezoneData = {
  timezone: string;
  autoAdjustDST: boolean;
  showSecondaryTimezone: boolean;
  secondaryTimezone?: string;
};

export const defaultTimezoneData: TimezoneData = {
  timezone: 'auto',
  autoAdjustDST: true,
  showSecondaryTimezone: false,
};

// Common timezones with their display names and UTC offsets
export const timezones = [
  { value: 'auto', label: 'Auto-detect (System)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (ET) - UTC-05:00' },
  { value: 'America/Chicago', label: 'Central Time (CT) - UTC-06:00' },
  { value: 'America/Denver', label: 'Mountain Time (MT) - UTC-07:00' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT) - UTC-08:00' },
  { value: 'Europe/London', label: 'Greenwich Mean Time (GMT) - UTC+00:00' },
  { value: 'Europe/Paris', label: 'Central European Time (CET) - UTC+01:00' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST) - UTC+09:00' },
  {
    value: 'Australia/Sydney',
    label: 'Australian Eastern Time (AEST) - UTC+10:00',
  },
  { value: 'Asia/Shanghai', label: 'China Standard Time (CST) - UTC+08:00' },
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST) - UTC+05:30' },
  { value: 'Europe/Moscow', label: 'Moscow Standard Time (MSK) - UTC+03:00' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST) - UTC+04:00' },
  {
    value: 'Pacific/Auckland',
    label: 'New Zealand Standard Time (NZST) - UTC+12:00',
  },
];

type TimezoneSettingsProps = {
  value: TimezoneData;
  onChange: (value: TimezoneData) => void;
};

export function TimezoneSettings({ value, onChange }: TimezoneSettingsProps) {
  const handleTimezoneChange = (timezone: string) => {
    onChange({
      ...value,
      timezone,
    });
  };

  const handleSecondaryTimezoneChange = (timezone: string) => {
    onChange({
      ...value,
      secondaryTimezone: timezone,
    });
  };

  const handleToggleChange = (field: keyof TimezoneData, checked: boolean) => {
    onChange({
      ...value,
      [field]: checked,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Select value={value.timezone} onValueChange={handleTimezoneChange}>
          <SelectTrigger id="timezone" className="w-full">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {timezones.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="auto-timezone"
          checked={value.autoAdjustDST}
          onCheckedChange={(checked) =>
            handleToggleChange('autoAdjustDST', checked)
          }
        />
        <Label htmlFor="auto-timezone">
          Automatically adjust for daylight saving time
        </Label>
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
        <div className="space-y-2 pl-6">
          <Label htmlFor="secondary-timezone">Secondary Timezone</Label>
          <Select
            value={value.secondaryTimezone || ''}
            onValueChange={handleSecondaryTimezoneChange}
          >
            <SelectTrigger id="secondary-timezone" className="w-full">
              <SelectValue placeholder="Select secondary timezone" />
            </SelectTrigger>
            <SelectContent>
              {timezones
                .filter(
                  (tz) => tz.value !== 'auto' && tz.value !== value.timezone
                )
                .map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
