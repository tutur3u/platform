'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  LoaderCircle,
  Play,
  QrCode,
  RefreshCw,
  ScanLine,
  Square,
  X,
} from '@tuturuuu/icons';
import type {
  AiAgentChannelConfig,
  AiAgentZaloPersonalAction,
  AiAgentZaloPersonalHistorySyncResult,
  AiAgentZaloPersonalPhoneSyncJobSnapshot,
  AiAgentZaloPersonalPhoneSyncResult,
  AiAgentZaloPersonalQrLoginSession,
  AiAgentZaloPersonalQrLoginStatus,
} from '@tuturuuu/internal-api/infrastructure/ai';
import {
  abortAiAgentZaloPersonalQrLogin,
  getAiAgentZaloPersonalQrLoginStatus,
  getAiAgentZaloPersonalStatus,
  runAiAgentZaloPersonalAction,
  startAiAgentZaloPersonalQrLogin,
} from '@tuturuuu/internal-api/infrastructure/ai';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { toast } from '../sonner';
import {
  formatZaloPersonalError,
  KeyValue,
  PanelSection,
} from './chat-agent-details-utils';

const QR_QUERY_KEY = 'chat-zalo-personal-qr';
const STATUS_QUERY_KEY = 'chat-zalo-personal-status';

const ACTIVE_QR_STATUSES = new Set<AiAgentZaloPersonalQrLoginStatus>([
  'pending',
  'qr_generated',
  'scanned',
  'credentials_ready',
  'authenticated',
]);

const QR_STATUS_KEYS = {
  aborted: 'agent_zalo_personal_qr_aborted',
  authenticated: 'agent_zalo_personal_qr_authenticated',
  credentials_ready: 'agent_zalo_personal_qr_credentials_ready',
  declined: 'agent_zalo_personal_qr_declined',
  expired: 'agent_zalo_personal_qr_expired',
  failed: 'agent_zalo_personal_qr_failed',
  pending: 'agent_zalo_personal_qr_pending',
  persisted: 'agent_zalo_personal_qr_persisted',
  qr_generated: 'agent_zalo_personal_qr_generated',
  scanned: 'agent_zalo_personal_qr_scanned',
} as const satisfies Record<AiAgentZaloPersonalQrLoginStatus, string>;

const ACTION_LABEL_KEYS = {
  'cancel-sync-phone': 'agent_zalo_personal_sync_phone_cancel',
  start: 'agent_zalo_personal_start',
  stop: 'agent_zalo_personal_stop',
  'sync-history': 'agent_zalo_personal_sync_history',
  'sync-phone': 'agent_zalo_personal_sync_phone',
  validate: 'agent_zalo_personal_validate',
} as const satisfies Record<AiAgentZaloPersonalAction, string>;

const ACTION_SUCCESS_KEYS = {
  'cancel-sync-phone': 'agent_zalo_personal_sync_phone_cancelled',
  start: 'agent_zalo_personal_start_success',
  stop: 'agent_zalo_personal_stop_success',
  validate: 'agent_zalo_personal_validate_success',
} as const satisfies Record<
  Exclude<AiAgentZaloPersonalAction, 'sync-history' | 'sync-phone'>,
  string
>;

export function AgentZaloPersonalPanel({
  agentId,
  channel,
  isPending,
  onRefresh,
}: {
  agentId: string;
  channel: AiAgentChannelConfig;
  isPending: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations('chat');
  const queryClient = useQueryClient();
  const [startedSession, setStartedSession] =
    useState<AiAgentZaloPersonalQrLoginSession | null>(null);
  const handledTerminalRef = useRef<string | null>(null);
  const sessionId = startedSession?.sessionId ?? null;
  const statusQuery = useQuery({
    queryFn: () => getAiAgentZaloPersonalStatus(agentId, channel.id),
    queryKey: [STATUS_QUERY_KEY, agentId, channel.id],
    refetchInterval: (query) =>
      isActivePhoneSyncJob(query.state.data?.phoneSyncJob) ? 3000 : 10_000,
  });
  const qrQuery = useQuery({
    enabled: Boolean(sessionId),
    queryFn: () =>
      getAiAgentZaloPersonalQrLoginStatus(agentId, channel.id, sessionId || ''),
    queryKey: [QR_QUERY_KEY, agentId, channel.id, sessionId],
    refetchInterval: (query) =>
      isActiveQrStatus(query.state.data?.session.status) ? 2000 : false,
    retry: false,
  });
  const session = qrQuery.data?.session ?? startedSession;
  const startMutation = useMutation({
    mutationFn: () => startAiAgentZaloPersonalQrLogin(agentId, channel.id),
    onError: (error) =>
      toast.error(error.message || t('agent_zalo_personal_qr_start_failed')),
    onSuccess: (result) => {
      handledTerminalRef.current = null;
      setStartedSession(result.session);
    },
  });
  const abortMutation = useMutation({
    mutationFn: (targetSessionId: string) =>
      abortAiAgentZaloPersonalQrLogin(agentId, channel.id, targetSessionId),
    onError: (error) =>
      toast.error(error.message || t('agent_zalo_personal_qr_abort_failed')),
    onSuccess: (result) => {
      setStartedSession(result.session);
      toast.success(t('agent_zalo_personal_qr_abort_success'));
    },
  });
  const actionMutation = useMutation({
    mutationFn: (action: AiAgentZaloPersonalAction) =>
      runAiAgentZaloPersonalAction(agentId, channel.id, action),
    onError: (error) =>
      toast.error(error.message || t('agent_zalo_personal_action_failed')),
    onSuccess: (result, action) => {
      queryClient.setQueryData([STATUS_QUERY_KEY, agentId, channel.id], {
        phoneSyncJob: result.phoneSyncJob ?? null,
        status: result.status,
      });

      if (action === 'sync-history') {
        const sync = (result.sync ?? {
          synced: 0,
          threads: 0,
          timedOut: false,
        }) as AiAgentZaloPersonalHistorySyncResult;

        toast.success(
          t('agent_zalo_personal_sync_history_success', {
            count: sync.synced,
            threads: sync.threads,
          })
        );

        if (sync.timedOut) {
          toast.warning(t('agent_zalo_personal_sync_history_timed_out'));
        }
      } else if (action === 'sync-phone') {
        const sync = (result.sync ?? {
          error: null,
          status: 'waiting_for_phone',
          synced: 0,
          threads: 0,
        }) as AiAgentZaloPersonalPhoneSyncResult;

        if (sync.status === 'failed') {
          toast.error(sync.error || t('agent_zalo_personal_sync_phone_failed'));
        } else if (sync.status === 'waiting_for_phone') {
          toast.warning(t('agent_zalo_personal_sync_phone_waiting'));
        } else if (sync.status === 'completed_no_payload') {
          toast.warning(t('agent_zalo_personal_sync_phone_no_payload'));
        } else {
          toast.success(
            t('agent_zalo_personal_sync_phone_success', {
              count: sync.synced,
              threads: sync.threads,
            })
          );

          if (sync.status === 'partial') {
            toast.warning(t('agent_zalo_personal_sync_phone_partial'));
          }
        }
      } else {
        toast.success(t(ACTION_SUCCESS_KEYS[action]));
      }

      void queryClient.invalidateQueries({
        queryKey: [STATUS_QUERY_KEY, agentId, channel.id],
      });
      onRefresh();
    },
  });

  useEffect(() => {
    if (!session || isActiveQrStatus(session.status)) return;
    const terminalKey = `${session.sessionId}:${session.status}`;
    if (handledTerminalRef.current === terminalKey) return;
    handledTerminalRef.current = terminalKey;

    if (session.status === 'persisted') {
      toast.success(t('agent_zalo_personal_qr_persisted_success'));
      onRefresh();
    } else if (session.status === 'failed') {
      toast.error(session.error || t('agent_zalo_personal_qr_failed'));
    }
  }, [onRefresh, session, t]);

  const listenerStatus = statusQuery.data?.status;
  const phoneSyncJob = statusQuery.data?.phoneSyncJob ?? null;
  const phoneSyncRunning = isActivePhoneSyncJob(phoneSyncJob);
  const qrBusy = startMutation.isPending || abortMutation.isPending;
  const actionBusy = isPending || actionMutation.isPending || phoneSyncRunning;
  const listenerError =
    listenerStatus?.lastError ===
      'zalo_personal_phone_sync_waiting_for_phone' && phoneSyncJob
      ? null
      : formatZaloPersonalError(listenerStatus?.lastError, t);
  const phoneSyncJobMessage = getPhoneSyncJobMessage(phoneSyncJob, t);

  return (
    <>
      <PanelSection
        icon={<QrCode className="size-4" />}
        title={t('agent_zalo_personal_qr_title')}
      >
        <div className="min-w-0 space-y-3 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant={
                session?.status === 'persisted' ? 'success' : 'secondary'
              }
            >
              {session
                ? t(QR_STATUS_KEYS[session.status])
                : t('agent_zalo_personal_qr_not_started')}
            </Badge>
            {session?.expiresAt ? (
              <span className="text-muted-foreground text-xs">
                {new Date(session.expiresAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
          <div className="grid min-w-0 place-items-center overflow-hidden rounded-md border bg-background p-3">
            {session?.qrImageDataUrl ? (
              <Image
                alt={t('agent_zalo_personal_qr_alt')}
                className="aspect-square w-full max-w-56 rounded-sm"
                height={224}
                src={session.qrImageDataUrl}
                unoptimized
                width={224}
              />
            ) : (
              <div className="grid aspect-square w-full max-w-56 place-items-center rounded-sm bg-muted/30 text-muted-foreground">
                {qrBusy || isActiveQrStatus(session?.status) ? (
                  <LoaderCircle className="size-8 animate-spin" />
                ) : (
                  <QrCode className="size-8" />
                )}
              </div>
            )}
          </div>
          {session?.scannedProfile ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-2 text-sm">
              <ScanLine className="size-4 text-dynamic-green" />
              <span className="min-w-0 truncate">
                {session.scannedProfile.displayName ??
                  t('agent_zalo_personal_qr_scanned')}
              </span>
            </div>
          ) : null}
          {getQrErrorMessage(session, t) ? (
            <p className="break-words rounded-md border border-dynamic-red/20 bg-dynamic-red/5 p-2 text-dynamic-red text-xs">
              {getQrErrorMessage(session, t)}
            </p>
          ) : null}
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <Button
              disabled={qrBusy}
              onClick={() => startMutation.mutate()}
              size="sm"
              type="button"
            >
              {startMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <QrCode className="size-4" />
              )}
              {t(
                session
                  ? 'agent_zalo_personal_qr_retry'
                  : 'agent_zalo_personal_qr_start'
              )}
            </Button>
            <Button
              disabled={
                !sessionId || qrBusy || !isActiveQrStatus(session?.status)
              }
              onClick={() => sessionId && abortMutation.mutate(sessionId)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <X className="size-4" />
              {t('agent_zalo_personal_qr_abort')}
            </Button>
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={<Play className="size-4" />}
        title={t('agent_zalo_personal_listener_title')}
      >
        <div className="min-w-0 space-y-3 overflow-hidden">
          <KeyValue
            label={t('agent_zalo_personal_feature')}
            value={
              listenerStatus
                ? listenerStatus.enabled
                  ? t('agent_zalo_personal_enabled')
                  : t('agent_zalo_personal_disabled')
                : t('agent_zalo_personal_not_available')
            }
          />
          <KeyValue
            label={t('agent_zalo_personal_running')}
            value={
              listenerStatus
                ? listenerStatus.running
                  ? t('agent_zalo_personal_running_value')
                  : t('agent_zalo_personal_stopped')
                : t('agent_zalo_personal_not_available')
            }
          />
          <KeyValue
            label={t('agent_zalo_personal_own_id')}
            value={
              listenerStatus?.ownId ??
              channel.zaloPersonalOwnId ??
              t('agent_zalo_personal_not_available')
            }
          />
          {listenerError ? (
            <p className="break-words rounded-md border border-dynamic-red/20 bg-dynamic-red/5 p-2 text-dynamic-red text-xs">
              {listenerError}
            </p>
          ) : null}
          {phoneSyncJobMessage ? (
            <p
              className={`break-words rounded-md border p-2 text-xs ${getPhoneSyncJobClassName(
                phoneSyncJob
              )}`}
            >
              {phoneSyncJobMessage}
            </p>
          ) : null}
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <ActionButton
              action="validate"
              busy={actionBusy}
              icon={<Check className="size-4" />}
              onRun={actionMutation.mutate}
            />
            <ActionButton
              action="start"
              busy={actionBusy}
              icon={<Play className="size-4" />}
              onRun={actionMutation.mutate}
            />
            <ActionButton
              action="sync-history"
              busy={actionBusy}
              icon={<RefreshCw className="size-4" />}
              onRun={actionMutation.mutate}
            />
            {phoneSyncRunning ? (
              <ActionButton
                action="cancel-sync-phone"
                busy={isPending || actionMutation.isPending}
                icon={<X className="size-4" />}
                onRun={actionMutation.mutate}
              />
            ) : (
              <ActionButton
                action="sync-phone"
                busy={actionBusy}
                icon={<RefreshCw className="size-4" />}
                onRun={actionMutation.mutate}
              />
            )}
            <ActionButton
              action="stop"
              busy={actionBusy}
              icon={<Square className="size-4" />}
              onRun={actionMutation.mutate}
            />
          </div>
        </div>
      </PanelSection>
    </>
  );
}

function getPhoneSyncJobMessage(
  job: AiAgentZaloPersonalPhoneSyncJobSnapshot | null,
  t: ReturnType<typeof useTranslations>
) {
  if (!job) return null;

  if (job.status === 'running') {
    return t('agent_zalo_personal_sync_phone_waiting');
  }

  if (job.status === 'failed') {
    return (
      formatZaloPersonalError(job.error, t) ||
      t('agent_zalo_personal_sync_phone_failed')
    );
  }

  const sync = job.sync;

  if (!sync) return null;

  if (sync.status === 'failed') {
    return (
      formatZaloPersonalError(sync.error, t) ||
      t('agent_zalo_personal_sync_phone_failed')
    );
  }

  if (sync.status === 'waiting_for_phone') {
    if (sync.pullAttempts > 0) {
      return sync.requestHttpError
        ? t('agent_zalo_personal_sync_phone_no_approval_http_unavailable')
        : t('agent_zalo_personal_sync_phone_no_approval');
    }

    return t('agent_zalo_personal_sync_phone_waiting');
  }

  if (sync.status === 'completed_no_payload') {
    return sync.requestHttpError
      ? t('agent_zalo_personal_sync_phone_no_payload_http_unavailable')
      : t('agent_zalo_personal_sync_phone_no_payload');
  }

  if (sync.status === 'partial') {
    return t('agent_zalo_personal_sync_phone_partial');
  }

  return t('agent_zalo_personal_sync_phone_success', {
    count: sync.synced,
    threads: sync.threads,
  });
}

function getPhoneSyncJobClassName(
  job: AiAgentZaloPersonalPhoneSyncJobSnapshot | null
) {
  if (job?.status === 'failed' || job?.sync?.status === 'failed') {
    return 'border-dynamic-red/20 bg-dynamic-red/5 text-dynamic-red';
  }

  if (job?.sync?.status === 'completed') {
    return 'border-dynamic-green/20 bg-dynamic-green/5 text-dynamic-green';
  }

  return 'border-dynamic-yellow/20 bg-dynamic-yellow/5 text-dynamic-yellow';
}

function getQrErrorMessage(
  session: AiAgentZaloPersonalQrLoginSession | null | undefined,
  t: ReturnType<typeof useTranslations>
) {
  if (!session?.error) return null;

  if (
    session.status === 'aborted' ||
    session.status === 'declined' ||
    session.status === 'expired'
  ) {
    return t(QR_STATUS_KEYS[session.status]);
  }

  return session.error;
}

function isActivePhoneSyncJob(
  job: AiAgentZaloPersonalPhoneSyncJobSnapshot | null | undefined
) {
  return job?.status === 'running';
}

function ActionButton({
  action,
  busy,
  icon,
  onRun,
}: {
  action: AiAgentZaloPersonalAction;
  busy: boolean;
  icon: ReactNode;
  onRun: (action: AiAgentZaloPersonalAction) => void;
}) {
  const t = useTranslations('chat');

  return (
    <Button
      disabled={busy}
      onClick={() => onRun(action)}
      size="sm"
      type="button"
      variant="outline"
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {t(ACTION_LABEL_KEYS[action])}
    </Button>
  );
}

function isActiveQrStatus(status?: AiAgentZaloPersonalQrLoginStatus) {
  return status ? ACTIVE_QR_STATUSES.has(status) : false;
}
