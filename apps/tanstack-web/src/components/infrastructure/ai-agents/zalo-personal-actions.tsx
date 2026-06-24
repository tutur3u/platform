'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  Square,
} from '@tuturuuu/icons';
import type {
  AiAgentDefinition,
  AiAgentZaloPersonalAction,
} from '@tuturuuu/internal-api/infrastructure/ai';
import {
  getAiAgentZaloPersonalStatus,
  runAiAgentZaloPersonalAction,
} from '@tuturuuu/internal-api/infrastructure/ai';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'use-intl';
import { QUERY_KEY } from './ai-agents-utils';
import {
  actionErrorMessage,
  actionSuccessMessage,
} from './zalo-personal-action-messages';
import { ActionButton, StatusLine } from './zalo-personal-action-primitives';

type Channel = AiAgentDefinition['channels'][number];

export function ZaloPersonalActions({
  agentId,
  channel,
  disabled,
  onRefresh,
}: {
  agentId?: string;
  channel?: Channel;
  disabled?: boolean;
  onRefresh?: () => void;
}) {
  const t = useTranslations('ai-agents-settings');
  const queryClient = useQueryClient();
  const enabled = Boolean(
    agentId && channel?.id && channel.zaloAccountMode === 'personal'
  );
  const statusQuery = useQuery({
    enabled,
    queryFn: async () => {
      const result = await getAiAgentZaloPersonalStatus(
        agentId ?? '',
        channel?.id ?? ''
      );
      return result.status;
    },
    queryKey: [...QUERY_KEY, agentId, channel?.id, 'zalo-personal'],
  });
  const status = statusQuery.data;
  const actionMutation = useMutation({
    mutationFn: async (action: AiAgentZaloPersonalAction) => {
      const result = await runAiAgentZaloPersonalAction(
        agentId ?? '',
        channel?.id ?? '',
        action
      );
      return { action, status: result.status };
    },
    onError: (error, action) =>
      toast.error(error.message || actionErrorMessage(t, action)),
    onSuccess: ({ action }) => {
      toast.success(actionSuccessMessage(t, action));
      void queryClient.invalidateQueries({
        queryKey: [...QUERY_KEY, agentId, channel?.id, 'zalo-personal'],
      });
      onRefresh?.();
    },
  });

  if (!enabled) {
    return null;
  }

  const busy = disabled || actionMutation.isPending || statusQuery.isFetching;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-sm">{t('zalo_personal.title')}</div>
          <div className="text-muted-foreground text-xs">
            {status?.enabled
              ? t('zalo_personal.enabled_notice')
              : t('zalo_personal.disabled_notice')}
          </div>
        </div>
        <Badge
          variant={
            status?.running
              ? 'success'
              : status?.enabled
                ? 'secondary'
                : 'error'
          }
        >
          {status?.running
            ? t('zalo_personal.running')
            : status?.enabled
              ? t('zalo_personal.stopped')
              : t('zalo_personal.feature_disabled')}
        </Badge>
      </div>

      <div className="grid gap-2 text-sm md:grid-cols-2">
        <StatusLine
          label={t('zalo_personal.own_id')}
          value={status?.ownId || channel?.zaloPersonalOwnId || '-'}
        />
        <StatusLine
          label={t('fields.last_event')}
          value={status?.lastEventAt ?? channel?.lastEventAt ?? '-'}
        />
      </div>

      {status?.lastError ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive text-xs">
          {status.lastError}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ActionButton
          disabled={busy}
          icon={<CheckCircle2 className="size-4" />}
          label={t('actions.validate_zalo_personal')}
          loading={actionMutation.isPending}
          onClick={() => actionMutation.mutate('validate')}
          pendingAction={actionMutation.variables}
          targetAction="validate"
        />
        <ActionButton
          disabled={busy || status?.running === true}
          icon={<Play className="size-4" />}
          label={t('actions.start_zalo_personal')}
          loading={actionMutation.isPending}
          onClick={() => actionMutation.mutate('start')}
          pendingAction={actionMutation.variables}
          targetAction="start"
        />
        <ActionButton
          disabled={busy || status?.running !== true}
          icon={<Square className="size-4" />}
          label={t('actions.stop_zalo_personal')}
          loading={actionMutation.isPending}
          onClick={() => actionMutation.mutate('stop')}
          pendingAction={actionMutation.variables}
          targetAction="stop"
          variant="secondary"
        />
        <Button
          aria-label={t('actions.refresh')}
          disabled={busy}
          onClick={() => void statusQuery.refetch()}
          size="icon"
          type="button"
          variant="outline"
        >
          {statusQuery.isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
