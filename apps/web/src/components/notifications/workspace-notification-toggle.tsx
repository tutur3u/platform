'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Switch } from '@tuturuuu/ui/switch';
import { Label } from '@tuturuuu/ui/label';
import { Bell, BellOff, Loader2 } from '@tuturuuu/icons';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotificationPreferences';
import { useTranslations } from 'next-intl';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import type {
  NotificationChannel,
  NotificationEventType,
} from '@/hooks/useNotificationPreferences';

interface WorkspaceNotificationToggleProps {
  wsId: string;
}

// All possible workspace event types
const ALL_EVENT_TYPES: NotificationEventType[] = [
  'task_assigned',
  'task_updated',
  'task_mention',
  'task_title_changed',
  'task_description_changed',
  'task_priority_changed',
  'task_due_date_changed',
  'task_start_date_changed',
  'task_estimation_changed',
  'task_moved',
  'task_completed',
  'task_reopened',
  'task_label_added',
  'task_label_removed',
  'task_project_linked',
  'task_project_unlinked',
  'task_assignee_removed',
  'workspace_invite',
];

const CHANNELS: NotificationChannel[] = ['web', 'email', 'push'];

export default function WorkspaceNotificationToggle({
  wsId,
}: WorkspaceNotificationToggleProps) {
  const t = useTranslations('notifications.settings');
  const { data: preferences, isLoading } = useNotificationPreferences({ wsId });
  const updatePreferences = useUpdateNotificationPreferences();
  const [isUpdating, setIsUpdating] = useState(false);

  // Calculate if all notifications are enabled
  const totalPreferences = ALL_EVENT_TYPES.length * CHANNELS.length;
  const enabledCount = preferences?.filter((p) => p.enabled).length || 0;
  const allEnabled = enabledCount === totalPreferences;
  const someEnabled = enabledCount > 0 && enabledCount < totalPreferences;

  const handleToggleAll = async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      // Extract existing advanced settings from any preference
      const existingPref = preferences?.[0];
      const advancedSettings: {
        digestFrequency?: string;
        quietHoursStart?: string;
        quietHoursEnd?: string;
        timezone?: string;
      } = {};

      if (existingPref?.digest_frequency) {
        advancedSettings.digestFrequency = existingPref.digest_frequency;
      }
      if (existingPref?.quiet_hours_start) {
        advancedSettings.quietHoursStart = existingPref.quiet_hours_start;
      }
      if (existingPref?.quiet_hours_end) {
        advancedSettings.quietHoursEnd = existingPref.quiet_hours_end;
      }
      if (existingPref?.timezone) {
        advancedSettings.timezone = existingPref.timezone;
      }

      // Create preferences for all event types and channels
      const allPreferences = ALL_EVENT_TYPES.flatMap((eventType) =>
        CHANNELS.map((channel) => ({
          eventType,
          channel,
          enabled,
        }))
      );

      await updatePreferences.mutateAsync({
        wsId,
        preferences: allPreferences,
        ...advancedSettings,
      });

      toast.success(
        enabled
          ? t('workspace-toggle.enabled-success')
          : t('workspace-toggle.disabled-success')
      );
    } catch (error) {
      console.error('Failed to toggle workspace notifications:', error);
      toast.error(t('workspace-toggle.update-failed'));
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <Card className="border-dynamic-blue/50 bg-dynamic-blue/5">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-dynamic-blue/20 p-2">
              {allEnabled ? (
                <Bell className="h-5 w-5 text-dynamic-blue" />
              ) : (
                <BellOff className="h-5 w-5 text-dynamic-blue" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">
                {t('workspace-toggle.title')}
              </CardTitle>
              <CardDescription className="text-sm">
                {allEnabled
                  ? t('workspace-toggle.all-enabled')
                  : someEnabled
                    ? t('workspace-toggle.some-enabled', {
                        count: enabledCount,
                        total: totalPreferences,
                      })
                    : t('workspace-toggle.all-disabled')}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isUpdating && (
              <Loader2 className="h-4 w-4 animate-spin text-dynamic-blue" />
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="workspace-toggle"
                checked={allEnabled}
                onCheckedChange={handleToggleAll}
                disabled={isUpdating}
              />
              <Label
                htmlFor="workspace-toggle"
                className="cursor-pointer font-medium"
              >
                {allEnabled
                  ? t('workspace-toggle.disable-all')
                  : t('workspace-toggle.enable-all')}
              </Label>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground/60">
          {t('workspace-toggle.description')}
        </p>
      </CardContent>
    </Card>
  );
}
