'use client';

import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { PlusIcon, Trash2 } from 'lucide-react';
import { useId } from 'react';

export type ReminderTime =
  | '0' // At time of event
  | '5' // 5 minutes before
  | '10' // 10 minutes before
  | '15' // 15 minutes before
  | '30' // 30 minutes before
  | '60' // 1 hour before
  | '120' // 2 hours before
  | '1440'; // 1 day before

export type NotificationMethod = 'email' | 'push' | 'both';

export type ReminderSetting = {
  id: string;
  time: ReminderTime;
  method: NotificationMethod;
};

export type NotificationData = {
  enableEventReminders: boolean;
  defaultReminderTime: ReminderTime;
  enableDailySummary: boolean;
  enableInvitationNotifications: boolean;
  customReminders: ReminderSetting[];
};

export const defaultNotificationData: NotificationData = {
  enableEventReminders: true,
  defaultReminderTime: '15',
  enableDailySummary: true,
  enableInvitationNotifications: true,
  customReminders: [],
};

type NotificationSettingsProps = {
  value: NotificationData;
  onChange: (value: NotificationData) => void;
};

export function NotificationSettings({
  value,
  onChange,
}: NotificationSettingsProps) {
  const eventRemindersId = useId();
  const defaultReminderId = useId();
  const dailySummaryId = useId();
  const invitationNotificationsId = useId();

  const handleToggleChange = (
    field: keyof NotificationData,
    checked: boolean
  ) => {
    onChange({
      ...value,
      [field]: checked,
    });
  };

  const handleDefaultReminderChange = (time: string) => {
    onChange({
      ...value,
      defaultReminderTime: time as ReminderTime,
    });
  };

  const handleAddCustomReminder = () => {
    const newReminder: ReminderSetting = {
      id: Date.now().toString(),
      time: '15',
      method: 'both',
    };

    onChange({
      ...value,
      customReminders: [...value.customReminders, newReminder],
    });
  };

  const handleRemoveCustomReminder = (id: string) => {
    onChange({
      ...value,
      customReminders: value.customReminders.filter(
        (reminder) => reminder.id !== id
      ),
    });
  };

  const handleCustomReminderChange = (
    id: string,
    field: keyof Omit<ReminderSetting, 'id'>,
    newValue: string
  ) => {
    onChange({
      ...value,
      customReminders: value.customReminders.map((reminder) => {
        if (reminder.id === id) {
          return {
            ...reminder,
            [field]: newValue,
          };
        }
        return reminder;
      }),
    });
  };

  const reminderTimeOptions = [
    { value: '0', label: 'At time of event' },
    { value: '5', label: '5 minutes before' },
    { value: '10', label: '10 minutes before' },
    { value: '15', label: '15 minutes before' },
    { value: '30', label: '30 minutes before' },
    { value: '60', label: '1 hour before' },
    { value: '120', label: '2 hours before' },
    { value: '1440', label: '1 day before' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Label htmlFor={eventRemindersId}>Event reminders</Label>
        <Switch
          id={eventRemindersId}
          checked={value.enableEventReminders}
          onCheckedChange={(checked) =>
            handleToggleChange('enableEventReminders', checked)
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={defaultReminderId}>Default reminder time</Label>
        <Select
          value={value.defaultReminderTime}
          onValueChange={handleDefaultReminderChange}
          disabled={!value.enableEventReminders}
        >
          <SelectTrigger id={defaultReminderId} className="w-full">
            <SelectValue placeholder="Select reminder time" />
          </SelectTrigger>
          <SelectContent>
            {reminderTimeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.enableEventReminders && value.customReminders.length > 0 && (
        <div className="space-y-4">
          <Label>Custom reminders</Label>
          {value.customReminders.map((reminder) => (
            <div key={reminder.id} className="flex items-center gap-2">
              <Select
                value={reminder.time}
                onValueChange={(val) =>
                  handleCustomReminderChange(
                    reminder.id,
                    'time',
                    val as ReminderTime
                  )
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {reminderTimeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={reminder.method}
                onValueChange={(val) =>
                  handleCustomReminderChange(
                    reminder.id,
                    'method',
                    val as NotificationMethod
                  )
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="push">Push notification</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveCustomReminder(reminder.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {value.enableEventReminders && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddCustomReminder}
          className="mt-2"
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Add custom reminder
        </Button>
      )}

      <div className="flex items-center justify-between">
        <Label htmlFor={dailySummaryId}>Daily agenda summary</Label>
        <Switch
          id={dailySummaryId}
          checked={value.enableDailySummary}
          onCheckedChange={(checked) =>
            handleToggleChange('enableDailySummary', checked)
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor={invitationNotificationsId}>Calendar invitations</Label>
        <Switch
          id={invitationNotificationsId}
          checked={value.enableInvitationNotifications}
          onCheckedChange={(checked) =>
            handleToggleChange('enableInvitationNotifications', checked)
          }
        />
      </div>
    </div>
  );
}
