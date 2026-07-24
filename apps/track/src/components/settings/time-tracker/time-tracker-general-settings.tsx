'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { updateWorkspaceConfig } from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Separator } from '@tuturuuu/ui/separator';
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium text-lg">{t('general')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('general_description')}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div className="space-y-0.5">
          <p className="font-medium">{t('allow_future_sessions')}</p>
          <p className="text-muted-foreground text-sm">
            {t('allow_future_sessions_description')}
          </p>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={allowFutureSessions}
            onCheckedChange={setAllowFutureSessions}
          />
        )}
      </div>

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

      <Separator />
      <HeatmapDisplaySettings />
    </div>
  );
}
