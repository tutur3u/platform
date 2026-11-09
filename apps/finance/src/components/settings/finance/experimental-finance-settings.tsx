'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Props {
  workspaceId: string;
}

export default function ExperimentalFinanceSettings({ workspaceId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const { data: configValue, isLoading: isLoadingConfig } = useWorkspaceConfig(
    workspaceId,
    'ENABLE_EXPERIMENTAL_FINANCE',
    'false'
  );

  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoadingConfig) return;

    const val = configValue === 'true';
    if (!initialized || configValue !== undefined) {
      setEnabled(val);
      setInitialized(true);
    }
  }, [isLoadingConfig, configValue, initialized]);

  const updateMutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/settings/ENABLE_EXPERIMENTAL_FINANCE`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: String(newValue) }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
    onSuccess: (_, newValue) => {
      setEnabled(newValue);
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          'ENABLE_EXPERIMENTAL_FINANCE',
        ],
      });
      toast.success(t('update_success'));
    },
    onError: () => {
      toast.error(t('update_error'));
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          'ENABLE_EXPERIMENTAL_FINANCE',
        ],
      });
    },
  });

  const handleToggle = (checked: boolean) => {
    setEnabled(checked); // Optimistic update
    updateMutation.mutate(checked);
  };

  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SettingsSection>
      <SettingItemTab
        title={
          <Label htmlFor="momo-zalopay-toggle">
            {t('enable_momo_zalopay_label')}
          </Label>
        }
        description={t('enable_momo_zalopay_description')}
      >
        <Switch
          id="momo-zalopay-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={updateMutation.isPending}
        />
      </SettingItemTab>
    </SettingsSection>
  );
}
