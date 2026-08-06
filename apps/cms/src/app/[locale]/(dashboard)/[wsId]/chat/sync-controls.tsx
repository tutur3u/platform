'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, Square } from '@tuturuuu/icons';
import {
  type ExternalChatSyncAction,
  getExternalChatSyncStatus,
  mutateExternalChatSync,
} from '@tuturuuu/internal-api';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const runIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ConnectedChatSyncControls({
  enabled,
  wsId,
}: {
  enabled: boolean;
  wsId: string;
}) {
  const t = useTranslations('connected-chat');
  const [remoteRunId, setRemoteRunId] = useState('');
  const queryClient = useQueryClient();
  const queryKey = ['connected-chat-sync', wsId] as const;
  const isRunActive = (state: string) =>
    state === 'running' || state === 'pending';
  const query = useQuery({
    enabled,
    queryFn: () => getExternalChatSyncStatus(wsId),
    queryKey,
    refetchInterval: (state) =>
      state.state.data?.runs.some((run) => isRunActive(run.state))
        ? 5000
        : false,
  });
  const latest = query.data?.runs[0];
  const activeRun = query.data?.runs.find((run) => isRunActive(run.state));
  const active = Boolean(activeRun);
  const mutation = useMutation({
    mutationFn: (payload: ExternalChatSyncAction) =>
      mutateExternalChatSync(wsId, payload),
    onError: () => toast.error(t('sync_action_error')),
    onSuccess: async (_data, variables) => {
      if (variables.action === 'adopt') setRemoteRunId('');
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t('sync_action_started'));
    },
  });
  const runAction = (action: ExternalChatSyncAction['action']) =>
    mutation.mutate({
      action,
      ...(action === 'cancel' && activeRun?.id
        ? { runId: activeRun.id }
        : action === 'resume' && latest?.id
          ? { runId: latest.id }
          : {}),
    });

  return (
    <section className="space-y-4 border-b pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{t('sync_title')}</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('sync_description')}
          </p>
        </div>
        <Button
          aria-label={t('refresh')}
          disabled={!enabled || query.isFetching}
          onClick={() => query.refetch()}
          size="icon"
          variant="ghost"
        >
          <RefreshCw
            className={query.isFetching ? 'size-4 animate-spin' : 'size-4'}
          />
        </Button>
      </div>

      {latest ? (
        <Alert variant={latest.state === 'failed' ? 'destructive' : 'default'}>
          <ShieldCheck className="size-4" />
          <AlertTitle>{t('sync_state', { state: latest.state })}</AlertTitle>
          <AlertDescription>
            {t('sync_counts', {
              source: sumCounts(latest.source_counts),
              target: sumCounts(latest.target_counts),
            })}
            {latest.error_code
              ? ` ${t('sync_error_code', { code: latest.error_code })}`
              : ''}
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-muted-foreground text-sm">
          {enabled ? t('sync_no_runs') : t('sync_requires_ready')}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!enabled || active || mutation.isPending}
          onClick={() => runAction('audit')}
          variant="outline"
        >
          {t('sync_audit')}
        </Button>
        <Button
          disabled={!enabled || active || mutation.isPending}
          onClick={() => runAction('start')}
        >
          {t('sync_start')}
        </Button>
        <Button
          disabled={!enabled || active || mutation.isPending}
          onClick={() => runAction('reconcile')}
          variant="outline"
        >
          {t('sync_reconcile')}
        </Button>
        {activeRun ? (
          <Button
            disabled={mutation.isPending}
            onClick={() => runAction('cancel')}
            variant="destructive"
          >
            <Square className="size-4" />
            {t('sync_cancel')}
          </Button>
        ) : latest && ['failed', 'paused'].includes(latest.state) ? (
          <Button
            disabled={!enabled || mutation.isPending}
            onClick={() => runAction('resume')}
            variant="outline"
          >
            {t('sync_resume')}
          </Button>
        ) : null}
      </div>

      <details className="border p-3">
        <summary className="cursor-pointer font-medium text-sm">
          {t('developer_details')}
        </summary>
        <div className="mt-3 space-y-2">
          <Label htmlFor="remote-sync-run">{t('sync_existing_run')}</Label>
          <p className="text-muted-foreground text-xs">
            {t('sync_existing_run_description')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="remote-sync-run"
              onChange={(event) => setRemoteRunId(event.target.value.trim())}
              placeholder="00000000-0000-0000-0000-000000000000"
              value={remoteRunId}
            />
            <Button
              disabled={
                !enabled ||
                mutation.isPending ||
                !runIdPattern.test(remoteRunId)
              }
              onClick={() =>
                mutation.mutate({ action: 'adopt', runId: remoteRunId })
              }
              variant="outline"
            >
              {t('sync_existing_run_action')}
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}

function sumCounts(counts: Record<string, number>) {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}
