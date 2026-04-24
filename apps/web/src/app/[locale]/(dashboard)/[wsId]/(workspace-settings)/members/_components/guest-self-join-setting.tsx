'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { Loader2 } from '@tuturuuu/icons';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

interface Props {
  wsId: string;
  disabled?: boolean;
}

export function GuestSelfJoinSetting({ wsId, disabled = false }: Props) {
  const t = useTranslations('ws-members');
  const queryClient = useQueryClient();
  const configId = ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID;

  const { data: value, isLoading } = useWorkspaceConfig<string>(
    wsId,
    configId,
    'false'
  );

  const checked = (value ?? 'false').trim().toLowerCase() === 'true';

  const updateMutation = useMutation({
    mutationFn: async (nextChecked: boolean) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/settings/${configId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: String(nextChecked) }),
      });

      if (!response.ok) {
        throw new Error('Failed to update guest self-join setting');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId, configId],
      });
      toast.success(t('guest_self_join_update_success'));
    },
    onError: () => {
      toast.error(t('guest_self_join_update_error'));
    },
  });

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
        <div className="space-y-1">
          <p className="font-medium text-base">{t('guest_self_join_label')}</p>
          <p className="text-muted-foreground text-sm">
            {t('guest_self_join_description')}
          </p>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={checked}
            disabled={disabled || updateMutation.isPending}
            onCheckedChange={(nextChecked) => updateMutation.mutate(nextChecked)}
          />
        )}
      </div>
    </div>
  );
}
