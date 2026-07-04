'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Loader2 } from '@tuturuuu/icons';
import type {
  WorkspaceNotificationPreference,
  WorkspaceNotificationPreferenceUpdate,
} from '@tuturuuu/internal-api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  getAllWorkspaceNotificationEvents,
  WORKSPACE_NOTIFICATION_CHANNELS,
} from './notification-event-groups';
import { workspaceNotificationPreferencesQueryKey } from './query-keys';

type WorkspaceNotificationToggleProps = {
  preferences: WorkspaceNotificationPreference[];
  updateWorkspacePreferences: (
    preferences: WorkspaceNotificationPreferenceUpdate[]
  ) => Promise<void>;
  workspaceId: string;
};

export function WorkspaceNotificationToggle({
  preferences,
  updateWorkspacePreferences,
  workspaceId,
}: WorkspaceNotificationToggleProps) {
  const t = useTranslations('notifications.settings');
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);
  const totalPreferences =
    getAllWorkspaceNotificationEvents().length *
    WORKSPACE_NOTIFICATION_CHANNELS.length;
  const enabledCount = preferences.filter((pref) => pref.enabled).length;
  const allEnabled = enabledCount === totalPreferences;
  const someEnabled = enabledCount > 0 && enabledCount < totalPreferences;

  const mutation = useMutation({
    mutationFn: updateWorkspacePreferences,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: workspaceNotificationPreferencesQueryKey(workspaceId),
      });
    },
  });

  const handleToggleAll = async (enabled: boolean) => {
    setIsUpdating(true);

    try {
      const updates = getAllWorkspaceNotificationEvents().flatMap((eventType) =>
        WORKSPACE_NOTIFICATION_CHANNELS.map((channel) => ({
          channel,
          enabled,
          eventType,
        }))
      );

      await mutation.mutateAsync(updates);
      toast.success(
        enabled
          ? t('workspace-toggle.enabled-success')
          : t('workspace-toggle.disabled-success')
      );
    } catch {
      toast.error(t('workspace-toggle.update-failed'));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="border-dynamic-blue/50 bg-dynamic-blue/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
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
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin text-dynamic-blue" />
            ) : null}
            <div className="flex items-center gap-2">
              <Switch
                checked={allEnabled}
                disabled={isUpdating}
                id="workspace-toggle"
                onCheckedChange={handleToggleAll}
              />
              <Label
                className="cursor-pointer font-medium"
                htmlFor="workspace-toggle"
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
        <p className="text-foreground/60 text-sm">
          {t('workspace-toggle.description')}
        </p>
      </CardContent>
    </Card>
  );
}
