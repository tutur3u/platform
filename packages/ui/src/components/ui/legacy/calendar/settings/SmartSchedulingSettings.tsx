import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Slider } from '@tuturuuu/ui/slider';
import { Switch } from '@tuturuuu/ui/switch';
import React from 'react';

export type SmartSchedulingData = {
  enabled: boolean;
  avoidOverlaps: boolean;
  respectBlockedTime: boolean;
  defaultTaskDuration: number; // in minutes
  focusTimePreferences: {
    morning: boolean;
    afternoon: boolean;
    evening: boolean;
  };
  respectWorkingHours: boolean;
  workingHours: {
    start: number; // hour of day (0-23)
    end: number; // hour of day (0-23)
  };
  maxTasksPerDay: number;
  categoryTimeSettings?: Record<string, any>;
};

export const defaultSmartSchedulingData: SmartSchedulingData = {
  enabled: true,
  avoidOverlaps: true,
  respectBlockedTime: true,
  defaultTaskDuration: 60, // Default to 1 hour
  focusTimePreferences: {
    morning: true,
    afternoon: false,
    evening: false,
  },
  respectWorkingHours: true,
  workingHours: {
    start: 9, // 9 AM
    end: 17, // 5 PM
  },
  maxTasksPerDay: 5,
  categoryTimeSettings: {},
};

interface SmartSchedulingSettingsProps {
  value: SmartSchedulingData;
  onChange: (value: SmartSchedulingData) => void;
}

export function SmartSchedulingSettings({ value, onChange }: SmartSchedulingSettingsProps) {
  const handleToggleChange = (field: keyof SmartSchedulingData, checked: boolean) => {
    onChange({ ...value, [field]: checked });
  };

  const handleFocusTimeChange = (time: keyof typeof value.focusTimePreferences, checked: boolean) => {
    onChange({
      ...value,
      focusTimePreferences: {
        ...value.focusTimePreferences,
        [time]: checked,
      },
    });
  };

  const handleWorkingHoursChange = (field: keyof typeof value.workingHours, hour: number) => {
    onChange({
      ...value,
      workingHours: {
        ...value.workingHours,
        [field]: hour,
      },
    });
  };

  const handleSliderChange = (field: 'defaultTaskDuration' | 'maxTasksPerDay', newValue: number[]) => {
    onChange({
      ...value,
      [field]: newValue[0],
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Smart Scheduling</h3>
        <p className="text-sm text-muted-foreground">
          Configure how AI schedules tasks and events on your calendar
        </p>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="enable-smart-scheduling">Enable Smart Scheduling</Label>
            <Switch
              id="enable-smart-scheduling"
              checked={value.enabled}
              onCheckedChange={(checked) => handleToggleChange('enabled', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="avoid-overlaps">Avoid overlapping events</Label>
            <Switch
              id="avoid-overlaps"
              checked={value.avoidOverlaps}
              onCheckedChange={(checked) => handleToggleChange('avoidOverlaps', checked)}
              disabled={!value.enabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="respect-blocked">Respect blocked time on calendar</Label>
            <Switch
              id="respect-blocked"
              checked={value.respectBlockedTime}
              onCheckedChange={(checked) => handleToggleChange('respectBlockedTime', checked)}
              disabled={!value.enabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="respect-working-hours">Respect working hours</Label>
            <Switch
              id="respect-working-hours"
              checked={value.respectWorkingHours}
              onCheckedChange={(checked) => handleToggleChange('respectWorkingHours', checked)}
              disabled={!value.enabled}
            />
          </div>
        </div>
      </div>

      {value.enabled && (
        <>
          <div className="space-y-4">
            <h4 className="text-md font-medium">Working Hours</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="working-start">Start Time</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={value.workingHours.start}
                    onChange={(e) => handleWorkingHoursChange('start', parseInt(e.target.value))}
                    className="w-16 rounded-md border border-input bg-background px-2 py-1"
                    disabled={!value.respectWorkingHours}
                  />
                  <span>:00</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="working-end">End Time</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={value.workingHours.end}
                    onChange={(e) => handleWorkingHoursChange('end', parseInt(e.target.value))}
                    className="w-16 rounded-md border border-input bg-background px-2 py-1"
                    disabled={!value.respectWorkingHours}
                  />
                  <span>:00</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-md font-medium">Focus Time Preferences</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="focus-morning"
                  checked={value.focusTimePreferences.morning}
                  onCheckedChange={(checked) => handleFocusTimeChange('morning', checked)}
                />
                <Label htmlFor="focus-morning">Morning</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="focus-afternoon"
                  checked={value.focusTimePreferences.afternoon}
                  onCheckedChange={(checked) => handleFocusTimeChange('afternoon', checked)}
                />
                <Label htmlFor="focus-afternoon">Afternoon</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="focus-evening"
                  checked={value.focusTimePreferences.evening}
                  onCheckedChange={(checked) => handleFocusTimeChange('evening', checked)}
                />
                <Label htmlFor="focus-evening">Evening</Label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-md font-medium">Default Task Duration</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Duration</span>
                <span className="text-sm font-medium">{value.defaultTaskDuration} minutes</span>
              </div>
              <Slider
                defaultValue={[value.defaultTaskDuration]}
                min={15}
                max={180}
                step={15}
                onValueChange={(val) => handleSliderChange('defaultTaskDuration', val)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-md font-medium">Maximum Tasks Per Day</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Max Tasks</span>
                <span className="text-sm font-medium">{value.maxTasksPerDay}</span>
              </div>
              <Slider
                defaultValue={[value.maxTasksPerDay]}
                min={1}
                max={10}
                step={1}
                onValueChange={(val) => handleSliderChange('maxTasksPerDay', val)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
} 