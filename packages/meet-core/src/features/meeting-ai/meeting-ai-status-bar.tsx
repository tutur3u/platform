'use client';

import { Loader2, Play, RefreshCw, Square } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { MeetingAiStatus } from './meeting-ai-status';
import { MeetingAiUnavailable } from './meeting-ai-unavailable';

const dots: Record<MeetingAiStatus['kind'], string> = {
  loading: 'bg-muted-foreground',
  blocked: 'bg-muted-foreground',
  idle: 'bg-muted-foreground',
  starting: 'bg-dynamic-yellow motion-safe:animate-pulse',
  live: 'bg-dynamic-red motion-safe:animate-pulse',
  paused: 'bg-dynamic-yellow',
  detached: 'bg-dynamic-yellow',
  processing: 'bg-dynamic-blue motion-safe:animate-pulse',
  ready: 'bg-dynamic-green',
  failed: 'bg-dynamic-red',
};

/** One line of state, what it means, and the host's next action. */
export function MeetingAiStatusBar({
  status,
  canManage,
  inCall,
  busy,
  creditFailure,
  onStart,
  onFinish,
  onRetryNotes,
  onReload,
  reloading,
}: {
  status: MeetingAiStatus;
  canManage: boolean;
  inCall: boolean;
  busy: boolean;
  creditFailure: string | null;
  onStart: () => void;
  onFinish: (sessionId: string) => void;
  onRetryNotes: (sessionId: string) => void;
  onReload: () => void;
  reloading: boolean;
}) {
  const t = useTranslations('meet.ai');
  if (status.kind === 'loading')
    return (
      <div role="status" aria-label={t('loading')} className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  if (status.kind === 'blocked')
    return (
      <MeetingAiUnavailable
        block={status.block}
        onRetry={onReload}
        retrying={reloading}
      />
    );
  const copy = {
    idle: [
      t('status_idle_title'),
      t(canManage ? 'status_idle' : 'status_idle_reader'),
    ],
    starting: [t('status_starting_title'), t('status_starting')],
    live: [t('capturing'), t('status_live')],
    paused: [
      t('status_paused_title'),
      status.kind === 'paused'
        ? t('status_paused', { count: status.pending })
        : '',
    ],
    detached: [t('status_detached_title'), t('status_detached')],
    processing: [t('status_processing_title'), t('status_processing')],
    ready: [t('status_ready_title'), t('review_notice')],
    failed: [
      creditFailure ? t('credits_stopped') : t('status_failed_title'),
      creditFailure
        ? t(
            creditFailure as
              | 'credits_exhausted'
              | 'credits_daily_limit'
              | 'credits_model_not_on_plan'
              | 'credits_unavailable'
          )
        : t('failure_unavailable'),
    ],
  }[status.kind];
  const session = 'session' in status ? status.session : null;
  const running =
    status.kind === 'live' ||
    status.kind === 'paused' ||
    status.kind === 'detached' ||
    (status.kind === 'failed' && !!session && !session.ended_at);
  return (
    <div className="flex flex-wrap items-start gap-3">
      <span
        aria-hidden
        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dots[status.kind]}`}
      />
      <div className="min-w-0 flex-1 space-y-0.5" role="status">
        <p className="font-medium text-sm">{copy[0]}</p>
        <p className="text-muted-foreground text-xs">{copy[1]}</p>
        {status.kind === 'paused' && status.declined > 0 && (
          <p className="text-muted-foreground text-xs">
            {t('status_declined', { count: status.declined })}
          </p>
        )}
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {inCall &&
            (status.kind === 'idle' ||
              status.kind === 'ready' ||
              (status.kind === 'failed' && !running)) && (
              <Button type="button" size="sm" disabled={busy} onClick={onStart}>
                <Play aria-hidden className="size-4" />
                {status.kind === 'idle' ? t('start') : t('start_again')}
              </Button>
            )}
          {status.kind === 'starting' && (
            <Button type="button" size="sm" disabled>
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t('status_starting_title')}
            </Button>
          )}
          {running && session && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onFinish(session.id)}
            >
              <Square aria-hidden className="size-4" />
              {t('finish')}
            </Button>
          )}
          {status.kind === 'failed' && status.retryable && session && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onRetryNotes(session.id)}
            >
              <RefreshCw aria-hidden className="size-4" />
              {t('retry_notes')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
