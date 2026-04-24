'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

interface Props {
  wsId: string;
  disabled?: boolean;
  /** Omit outer card chrome when nested (e.g. inside a dialog). */
  embedded?: boolean;
}

export function GuestSelfJoinSetting({
  wsId,
  disabled = false,
  embedded = false,
}: Props) {
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
      await updateWorkspaceConfig(wsId, configId, String(nextChecked));
    },
    onMutate: async (nextChecked: boolean) => {
      const queryKey = ['workspace-config', wsId, configId] as const;

      await queryClient.cancelQueries({ queryKey });

      const previousValue = queryClient.getQueryData<string | null>(queryKey);

      queryClient.setQueryData<string | null>(queryKey, String(nextChecked));

      return { previousValue, queryKey };
    },
    onSuccess: () => {
      toast.success(t('guest_self_join_update_success'));
    },
    onError: (_, __, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousValue);
      }
      toast.error(t('guest_self_join_update_error'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId, configId],
      });
    },
  });

  const inner = (
    <div className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="font-medium text-base">{t('guest_self_join_label')}</p>
        <p className="text-muted-foreground text-sm">
          {t('guest_self_join_description')}
        </p>
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Switch
          checked={checked}
          disabled={disabled || updateMutation.isPending}
          onCheckedChange={(nextChecked) => updateMutation.mutate(nextChecked)}
        />
      )}
    </div>
  );

  if (embedded) return inner;

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      {inner}
    </div>
  );
}
