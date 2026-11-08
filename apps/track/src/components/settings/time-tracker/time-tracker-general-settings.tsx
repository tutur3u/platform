'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { updateWorkspaceConfig } from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionFooter,
} from '@tuturuuu/ui/custom/settings-section';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { HeatmapDisplaySettings } from './heatmap-display-settings';

const ALLOW_FUTURE_SESSIONS_CONFIG_ID = 'ALLOW_FUTURE_SESSIONS';

export function TimeTrackerGeneralSettings({ wsId }: { wsId: string }) {
  const t = useTranslations('settings.time_tracker');
  const queryClient = useQueryClient();
  const { data: configValue, isLoading } = useWorkspaceConfig<string>(
    wsId,
    ALLOW_FUTURE_SESSIONS_CONFIG_ID,
    'false'
  );
  const [allowFutureSessions, setAllowFutureSessions] = useState(false);

  useEffect(() => {
    if (configValue == null) return;
    setAllowFutureSessions(configValue.trim().toLowerCase() === 'true');
  }, [configValue]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateWorkspaceConfig(
        wsId,
        ALLOW_FUTURE_SESSIONS_CONFIG_ID,
        String(allowFutureSessions)
      ),
    onError: () => toast.error(t('update_error')),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId, ALLOW_FUTURE_SESSIONS_CONFIG_ID],
      });
      toast.success(t('update_success'));
    },
  });

  const savedValue = configValue?.trim().toLowerCase() === 'true';

  return (
    <div className="space-y-8">
      <SettingsSection>
        <SettingItemTab
          title={t('allow_future_sessions')}
          description={t('allow_future_sessions_description')}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={allowFutureSessions}
              onCheckedChange={setAllowFutureSessions}
            />
          )}
        </SettingItemTab>

        <SettingsSectionFooter>
          <Button
            disabled={
              isLoading ||
              updateMutation.isPending ||
              allowFutureSessions === savedValue
            }
            onClick={() => updateMutation.mutate()}
            type="button"
          >
            {updateMutation.isPending ? t('saving') : t('save')}
          </Button>
        </SettingsSectionFooter>
      </SettingsSection>

      <HeatmapDisplaySettings />
    </div>
  );
}
