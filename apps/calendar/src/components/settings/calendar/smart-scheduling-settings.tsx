'use client';

import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Slider } from '@tuturuuu/ui/slider';
import { Switch } from '@tuturuuu/ui/switch';

export type SmartSchedulingData = {
  enableSmartScheduling: boolean;
  minBuffer: number; // in minutes
  preferredBuffer: number; // in minutes
  energyProfile:
    | 'morning_person'
    | 'night_owl'
    | 'afternoon_peak'
    | 'evening_peak';
  preferredMeetingTimes: 'morning' | 'afternoon' | 'distributed';
  avoidBackToBackMeetings: boolean;
  maximumMeetingsPerDay: number;
  focusTimeBlocks: {
    enabled: boolean;
    duration: number; // in minutes
    frequency: 'daily' | 'weekly';
    preferredTime: 'morning' | 'afternoon';
  };
  productivityScore: number; // 0-100
};

export const defaultSmartSchedulingData: SmartSchedulingData = {
  enableSmartScheduling: true,
  minBuffer: 5,
  preferredBuffer: 15,
  energyProfile: 'morning_person',
  preferredMeetingTimes: 'afternoon',
  avoidBackToBackMeetings: true,
  maximumMeetingsPerDay: 5,
  focusTimeBlocks: {
    enabled: true,
    duration: 120,
    frequency: 'daily',
    preferredTime: 'morning',
  },
  productivityScore: 70,
};

type SmartSchedulingSettingsProps = {
  value: SmartSchedulingData;
  onChange: (value: SmartSchedulingData) => void;
};

export function SmartSchedulingSettings({
  value,
  onChange,
}: SmartSchedulingSettingsProps) {
  const handleToggleChange = (
    field: keyof SmartSchedulingData,
    checked: boolean
  ) => {
    onChange({
      ...value,
      [field]: checked,
    });
  };

  const handleFocusTimeToggle = (checked: boolean) => {
    onChange({
      ...value,
      focusTimeBlocks: {
        ...value.focusTimeBlocks,
        enabled: checked,
      },
    });
  };

  const handleFocusTimeChange = (
    field: keyof Omit<SmartSchedulingData['focusTimeBlocks'], 'enabled'>,
    newValue: string | number
  ) => {
    onChange({
      ...value,
      focusTimeBlocks: {
        ...value.focusTimeBlocks,
        [field]: newValue,
      },
    });
  };

  const handleBufferChange = (
    field: 'minBuffer' | 'preferredBuffer',
    buffer: string
  ) => {
    const bufferMinutes = parseInt(buffer, 10);
    if (!Number.isNaN(bufferMinutes) && bufferMinutes >= 0) {
      onChange({
        ...value,
        [field]: bufferMinutes,
      });
    }
  };

  const handleMaxMeetingsChange = (max: string) => {
    const maxMeetings = parseInt(max, 10);
    if (!Number.isNaN(maxMeetings) && maxMeetings > 0) {
      onChange({
        ...value,
        maximumMeetingsPerDay: maxMeetings,
      });
    }
  };

  const handleProductivityScoreChange = (score: number[]) => {
    onChange({
      ...value,
      productivityScore: score[0] ?? value.productivityScore,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Label htmlFor="enable-smart-scheduling">Enable smart scheduling</Label>
        <Switch
          id="enable-smart-scheduling"
          checked={value.enableSmartScheduling}
          onCheckedChange={(checked) =>
            handleToggleChange('enableSmartScheduling', checked)
          }
        />
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-lg">Scheduling Preferences</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="min-buffer">Minimum buffer (Hard)</Label>
            <Select
              value={value.minBuffer.toString()}
              onValueChange={(val) => handleBufferChange('minBuffer', val)}
              disabled={!value.enableSmartScheduling}
            >
              <SelectTrigger id="min-buffer" className="w-full">
                <SelectValue placeholder="Select buffer time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No buffer</SelectItem>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="preferred-buffer">Preferred buffer (Soft)</Label>
            <Select
              value={value.preferredBuffer.toString()}
              onValueChange={(val) =>
                handleBufferChange('preferredBuffer', val)
              }
              disabled={!value.enableSmartScheduling}
            >
              <SelectTrigger id="preferred-buffer" className="w-full">
                <SelectValue placeholder="Select buffer time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="energy-profile">Energy Profile</Label>
          <Select
            value={value.energyProfile}
            onValueChange={(val) =>
              onChange({
                ...value,
                energyProfile: val as SmartSchedulingData['energyProfile'],
              })
            }
            disabled={!value.enableSmartScheduling}
          >
            <SelectTrigger id="energy-profile" className="w-full">
              <SelectValue placeholder="Select energy profile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning_person">Morning Person</SelectItem>
              <SelectItem value="afternoon_peak">Afternoon Peak</SelectItem>
              <SelectItem value="evening_peak">Evening Peak</SelectItem>
              <SelectItem value="night_owl">Night Owl</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferred-times">Preferred meeting times</Label>
          <Select
            value={value.preferredMeetingTimes}
            onValueChange={(val) =>
              onChange({
                ...value,
                preferredMeetingTimes:
                  val as SmartSchedulingData['preferredMeetingTimes'],
              })
            }
            disabled={!value.enableSmartScheduling}
          >
            <SelectTrigger id="preferred-times" className="w-full">
              <SelectValue placeholder="Select preferred times" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning">Morning</SelectItem>
              <SelectItem value="afternoon">Afternoon</SelectItem>
              <SelectItem value="distributed">
                Distributed throughout the day
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="avoid-back-to-back">
            Avoid back-to-back meetings
          </Label>
          <Switch
            id="avoid-back-to-back"
            checked={value.avoidBackToBackMeetings}
            onCheckedChange={(checked) =>
              handleToggleChange('avoidBackToBackMeetings', checked)
            }
            disabled={!value.enableSmartScheduling}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="max-meetings">Maximum meetings per day</Label>
          <Select
            value={value.maximumMeetingsPerDay.toString()}
            onValueChange={handleMaxMeetingsChange}
            disabled={!value.enableSmartScheduling}
          >
            <SelectTrigger id="max-meetings" className="w-full">
              <SelectValue placeholder="Select maximum meetings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 meetings</SelectItem>
              <SelectItem value="3">3 meetings</SelectItem>
              <SelectItem value="4">4 meetings</SelectItem>
              <SelectItem value="5">5 meetings</SelectItem>
              <SelectItem value="6">6 meetings</SelectItem>
              <SelectItem value="8">8 meetings</SelectItem>
              <SelectItem value="10">10 meetings</SelectItem>
              <SelectItem value="15">15 meetings</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-lg">Focus Time</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="enable-focus-time">Schedule focus time blocks</Label>
          <Switch
            id="enable-focus-time"
            checked={value.focusTimeBlocks.enabled}
            onCheckedChange={handleFocusTimeToggle}
            disabled={!value.enableSmartScheduling}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="focus-duration">Focus time duration</Label>
          <Select
            value={value.focusTimeBlocks.duration.toString()}
            onValueChange={(val) =>
              handleFocusTimeChange('duration', parseInt(val, 10))
            }
            disabled={
              !value.enableSmartScheduling || !value.focusTimeBlocks.enabled
            }
          >
            <SelectTrigger id="focus-duration" className="w-full">
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="60">1 hour</SelectItem>
              <SelectItem value="90">1.5 hours</SelectItem>
              <SelectItem value="120">2 hours</SelectItem>
              <SelectItem value="180">3 hours</SelectItem>
              <SelectItem value="240">4 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="focus-frequency">Focus time frequency</Label>
          <Select
            value={value.focusTimeBlocks.frequency}
            onValueChange={(val) =>
              handleFocusTimeChange('frequency', val as 'daily' | 'weekly')
            }
            disabled={
              !value.enableSmartScheduling || !value.focusTimeBlocks.enabled
            }
          >
            <SelectTrigger id="focus-frequency" className="w-full">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="focus-time">Preferred focus time</Label>
          <Select
            value={value.focusTimeBlocks.preferredTime}
            onValueChange={(val) =>
              handleFocusTimeChange(
                'preferredTime',
                val as 'morning' | 'afternoon'
              )
            }
            disabled={
              !value.enableSmartScheduling || !value.focusTimeBlocks.enabled
            }
          >
            <SelectTrigger id="focus-time" className="w-full">
              <SelectValue placeholder="Select preferred time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning">Morning</SelectItem>
              <SelectItem value="afternoon">Afternoon</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-lg">Productivity Balance</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label htmlFor="productivity-score">
              Meeting vs. Focus Time Balance
            </Label>
            <span className="text-sm">{value.productivityScore}%</span>
          </div>
          <Slider
            id="productivity-score"
            min={0}
            max={100}
            step={5}
            value={[value.productivityScore]}
            onValueChange={handleProductivityScoreChange}
            disabled={!value.enableSmartScheduling}
            className="py-4"
          />
          <div className="flex justify-between text-muted-foreground text-sm">
            <span>More meetings</span>
            <span>More focus time</span>
          </div>
        </div>
      </div>
    </div>
  );
}
