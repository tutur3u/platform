'use client';

import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTheme } from 'next-themes';
import { useId } from 'react';

export type CalendarTheme = 'light' | 'dark' | 'system';
export type FirstDayOfWeek = 'sunday' | 'monday' | 'saturday';
export type TimeFormat = '12h' | '24h';
export type DefaultView = 'day' | '4-days' | 'week' | 'month';

export type AppearanceData = {
  theme: CalendarTheme;
  firstDayOfWeek: FirstDayOfWeek;
  timeFormat: TimeFormat;
  defaultView: DefaultView;
  showWeekNumbers: boolean;
  showDeclinedEvents: boolean;
  showWeekends: boolean;
  compactView: boolean;
};

export const defaultAppearanceData: AppearanceData = {
  theme: 'system',
  firstDayOfWeek: 'monday',
  timeFormat: '12h',
  defaultView: 'week',
  showWeekNumbers: false,
  showDeclinedEvents: false,
  showWeekends: true,
  compactView: false,
};

type AppearanceSettingsProps = {
  value: AppearanceData;
  onChange: (value: AppearanceData) => void;
};

export function AppearanceSettings({
  value,
  onChange,
}: AppearanceSettingsProps) {
  const { theme, setTheme } = useTheme();
  const firstDayId = useId();
  const timeFormatId = useId();

  const handleThemeChange = (theme: CalendarTheme) => {
    onChange({
      ...value,
      theme,
    });
  };

  const handleSelectChange = <K extends keyof AppearanceData>(
    field: K,
    newValue: AppearanceData[K]
  ) => {
    onChange({
      ...value,
      [field]: newValue,
    });
  };

  // const handleToggleChange = (
  //   field: keyof AppearanceData,
  //   checked: boolean
  // ) => {
  //   onChange({
  //     ...value,
  //     [field]: checked,
  //   });
  // };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Calendar theme</Label>
        <Tabs
          value={value.theme}
          onValueChange={(val) => handleThemeChange(val as CalendarTheme)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="light"
              onClick={() => setTheme('light')}
              disabled={theme === 'light'}
            >
              Light
            </TabsTrigger>
            <TabsTrigger
              value="dark"
              onClick={() => setTheme('dark')}
              disabled={theme === 'dark'}
            >
              Dark
            </TabsTrigger>
            <TabsTrigger
              value="system"
              onClick={() => setTheme('system')}
              disabled={theme === 'system'}
            >
              System
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-2">
        <Label htmlFor={firstDayId}>First day of week</Label>
        <Select
          value={value.firstDayOfWeek}
          onValueChange={(val) =>
            handleSelectChange('firstDayOfWeek', val as FirstDayOfWeek)
          }
          disabled
        >
          <SelectTrigger id={firstDayId} className="w-full">
            <SelectValue placeholder="Select first day" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sunday" disabled>
              Sunday
            </SelectItem>
            <SelectItem value="monday">Monday</SelectItem>
            <SelectItem value="saturday" disabled>
              Saturday
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={timeFormatId}>Time format</Label>
        <Select
          value={value.timeFormat}
          onValueChange={(val) =>
            handleSelectChange('timeFormat', val as TimeFormat)
          }
        >
          <SelectTrigger id={timeFormatId} className="w-full">
            <SelectValue placeholder="Select time format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12h">12-hour (1:00 PM)</SelectItem>
            <SelectItem value="24h">24-hour (13:00)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* <div className="space-y-2">
        <Label htmlFor="default-view">Default view</Label>
        <Select
          value={value.defaultView}
          onValueChange={(val) =>
            handleSelectChange('defaultView', val as DefaultView)
          }
        >
          <SelectTrigger id="default-view" className="w-full">
            <SelectValue placeholder="Select default view" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="4-days">4 Days</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="month">Month</SelectItem>
          </SelectContent>
        </Select>
      </div> */}

      {/* <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="show-week-numbers">Show week numbers</Label>
          <Switch
            id="show-week-numbers"
            checked={value.showWeekNumbers}
            onCheckedChange={(checked) =>
              handleToggleChange('showWeekNumbers', checked)
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-declined">Show declined events</Label>
          <Switch
            id="show-declined"
            checked={value.showDeclinedEvents}
            onCheckedChange={(checked) =>
              handleToggleChange('showDeclinedEvents', checked)
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-weekends">Show weekends</Label>
          <Switch
            id="show-weekends"
            checked={value.showWeekends}
            onCheckedChange={(checked) =>
              handleToggleChange('showWeekends', checked)
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="compact-view">Compact view</Label>
          <Switch
            id="compact-view"
            checked={value.compactView}
            onCheckedChange={(checked) =>
              handleToggleChange('compactView', checked)
            }
          />
        </div>
      </div> */}
    </div>
  );
}
