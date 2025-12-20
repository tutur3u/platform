'use client';

import { Bell } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  getPreferenceValue,
  type NotificationChannel,
  type NotificationEventType,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotificationPreferences';

interface NotificationPreferencesCardProps {
  wsId: string;
}

const CHANNELS: NotificationChannel[] = ['web', 'email', 'sms', 'push'];
const EVENT_TYPES: NotificationEventType[] = [
  // Task assignment and general updates
  'task_assigned',
  'task_updated',
  'task_mention',
  // Task field changes
  'task_title_changed',
  'task_description_changed',
  'task_priority_changed',
  'task_due_date_changed',
  'task_start_date_changed',
  'task_estimation_changed',
  'task_moved',
  // Task status changes
  'task_completed',
  'task_reopened',
  // Task relationships
  'task_label_added',
  'task_label_removed',
  'task_project_linked',
  'task_project_unlinked',
  'task_assignee_removed',
  // Workspace
  'workspace_invite',
];

export default function NotificationPreferencesCard({
  wsId,
}: NotificationPreferencesCardProps) {
  const t = useTranslations('notifications.settings');
  const tEvents = useTranslations('notifications.settings.events');
  const tChannels = useTranslations('notifications.settings.channels');

  const { data: preferences, isLoading } = useNotificationPreferences({ wsId });
  const updatePreferences = useUpdateNotificationPreferences();

  // Local state to track changes
  const [localPreferences, setLocalPreferences] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize local preferences from fetched data
  useEffect(() => {
    if (preferences) {
      const prefs: Record<string, Record<string, boolean>> = {};
      EVENT_TYPES.forEach((eventType) => {
        prefs[eventType] = {};
        CHANNELS.forEach((channel) => {
          prefs[eventType]![channel] = getPreferenceValue(
            preferences,
            eventType,
            channel
          );
        });
      });
      setLocalPreferences(prefs);
    }
  }, [preferences]);

  const handleToggle = (
    eventType: NotificationEventType,
    channel: NotificationChannel
  ) => {
    setLocalPreferences((prev) => {
      const newPrefs = { ...prev };
      if (!newPrefs[eventType]) {
        newPrefs[eventType] = {};
      }
      newPrefs[eventType][channel] = !newPrefs[eventType][channel];
      return newPrefs;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Convert local preferences to API format
    const preferencesToSave: Array<{
      eventType: NotificationEventType;
      channel: NotificationChannel;
      enabled: boolean;
    }> = [];

    EVENT_TYPES.forEach((eventType) => {
      CHANNELS.forEach((channel) => {
        preferencesToSave.push({
          eventType,
          channel,
          enabled: localPreferences[eventType]?.[channel] ?? true,
        });
      });
    });

    try {
      await updatePreferences.mutateAsync({
        wsId,
        preferences: preferencesToSave,
      });

      toast.success(t('saved'));
      setHasChanges(false);
    } catch (error) {
      toast.error('Failed to save preferences');
      console.error('Error saving preferences:', error);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-dynamic-blue/20 p-2">
              <Bell className="h-5 w-5 text-dynamic-blue" />
            </div>
            <div>
              <CardTitle>{t('title')}</CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-foreground/60 text-sm">
            Loading preferences...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/20 p-2">
            <Bell className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Table header */}
        <div className="grid grid-cols-5 gap-4 border-b pb-2">
          <div className="font-medium text-sm">Event</div>
          {CHANNELS.map((channel) => (
            <div key={channel} className="text-center font-medium text-sm">
              {tChannels(channel)}
            </div>
          ))}
        </div>

        {/* Preference rows */}
        <div className="space-y-4">
          {EVENT_TYPES.map((eventType) => (
            <div
              key={eventType}
              className="grid grid-cols-5 items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="space-y-0.5">
                <p className="font-medium text-sm">{tEvents(eventType)}</p>
              </div>
              {CHANNELS.map((channel) => (
                <div key={channel} className="flex justify-center">
                  <Switch
                    checked={localPreferences[eventType]?.[channel] ?? true}
                    onCheckedChange={() => handleToggle(eventType, channel)}
                    disabled={channel === 'sms'} // SMS not implemented yet
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Save button */}
        {hasChanges && (
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={updatePreferences.isPending}>
              {updatePreferences.isPending ? 'Saving...' : t('save')}
            </Button>
          </div>
        )}

        {/* Info text */}
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-muted-foreground text-xs">
            Note: SMS notifications are coming soon and currently disabled. Web
            notifications require browser permission.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
