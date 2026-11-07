'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

export function GuestSelfJoinSetting({
  disabled,
  wsId,
}: {
  disabled: boolean;
  wsId: string;
}) {
  const t = useTranslations('ws-members');
  const queryClient = useQueryClient();
  const configId = ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID;
  const { data: value, isLoading } = useWorkspaceConfig<string>(
    wsId,
    configId,
    'false'
  );
  const checked = (value ?? 'false').trim().toLowerCase() === 'true';

  const mutation = useMutation({
    mutationFn: (nextChecked: boolean) =>
      updateWorkspaceConfig(wsId, configId, String(nextChecked)),
    onError: () => toast.error(t('guest_self_join_update_error')),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId, configId],
      });
      toast.success(t('guest_self_join_update_success'));
    },
  });

  return (
    <SettingItemTab
      description={t('guest_self_join_description')}
      title={t('guest_self_join_label')}
    >
      {isLoading ? (
        <Loader2 className="shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Switch
          checked={checked}
          disabled={disabled || mutation.isPending}
          onCheckedChange={(nextChecked) => mutation.mutate(nextChecked)}
        />
      )}
    </SettingItemTab>
  );
}
