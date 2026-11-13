'use client';

import { AlertTriangle, Loader2, RefreshCw } from '@tuturuuu/icons';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCalendarClock } from '../../../../hooks/use-calendar-clock';
import { Button } from '../../button';
import { Skeleton } from '../../skeleton';
import type {
  CalendarSyncStatus,
  SyncAttentionReason,
} from './calendar-sync-status';

/** The one action an attention row offers. */
export type CalendarListAttentionAction =
  | { kind: 'reconnect'; provider: string }
  | { kind: 'retry' };

type AttentionStatus = Extract<CalendarSyncStatus, { kind: 'attention' }>;

function assertNever(value: never): never {
  throw new Error(`Unhandled calendar list value: ${JSON.stringify(value)}`);
}

function FooterLine({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-8 shrink-0 items-center gap-1.5 px-2 text-muted-foreground text-xs"
      role="status"
    >
      {children}
    </div>
  );
}

function useAttentionLabel() {
  const t = useTranslations('calendar-list');
  return (status: AttentionStatus) => {
    const account = status.accounts[0];
    const name = account?.account_email || account?.account_name;
    const reason: SyncAttentionReason = status.reason;
    switch (reason) {
      case 'reconnect_required':
      case 'auth':
        return name
          ? t('attention_reconnect_account', { account: name })
          : t('attention_reconnect');
      case 'provider_unavailable':
        return t('attention_provider_unavailable');
      case 'configuration':
        return t('attention_configuration');
      case 'api_limit':
        return t('attention_api_limit');
      case 'sync_stalled':
        return t('attention_stalled');
      case 'sync_stale':
        return t('attention_stale');
      case 'not_synced':
        return t('attention_not_synced');
      case 'last_run_failed':
      case 'unknown':
        return t('attention_failed');
      default:
        return assertNever(reason);
    }
  };
}

/**
 * One quiet line that describes sync. Attention collapses to a single row with
 * a single action; `disconnected` renders nothing because the list already
 * offers "Add account".
 */
export function CalendarListFooter({
  attentionAction,
  manualSyncDisabled,
  onAttentionAction,
  onRetryStatus,
  onSync,
  status,
}: {
  attentionAction: CalendarListAttentionAction;
  manualSyncDisabled: boolean;
  onAttentionAction: (action: CalendarListAttentionAction) => void;
  onRetryStatus: () => void;
  onSync: () => void;
  status: CalendarSyncStatus;
}) {
  const t = useTranslations('calendar-list');
  const format = useFormatter();
  const now = useCalendarClock();
  const attentionLabel = useAttentionLabel();

  switch (status.kind) {
    case 'loading':
      return (
        <FooterLine>
          <Skeleton aria-hidden="true" className="h-3 w-24" />
          <span className="sr-only">{t('checking_sync')}</span>
        </FooterLine>
      );
    case 'disconnected':
      return null;
    case 'healthy': {
      const lastSuccess = status.lastSuccessAt
        ? Date.parse(status.lastSuccessAt)
        : Number.NaN;
      return (
        <FooterLine>
          <span className="min-w-0 flex-1 truncate">
            {Number.isFinite(lastSuccess)
              ? t('synced_at', {
                  // The minute clock floors; never describe a sync as future.
                  time: format.relativeTime(
                    Math.min(lastSuccess, now.getTime()),
                    now
                  ),
                })
              : t('synced')}
          </span>
          <Button
            aria-label={t('sync_now')}
            className="size-7 shrink-0"
            disabled={manualSyncDisabled}
            onClick={onSync}
            size="icon"
            variant="ghost"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </FooterLine>
      );
    }
    case 'syncing':
      return (
        <FooterLine>
          <Loader2
            aria-hidden="true"
            className="size-3.5 shrink-0 motion-safe:animate-spin"
          />
          <span className="min-w-0 flex-1 truncate">{t('syncing')}</span>
        </FooterLine>
      );
    case 'paused':
      return (
        <FooterLine>
          <span className="min-w-0 flex-1 truncate">{t('sync_paused')}</span>
        </FooterLine>
      );
    case 'attention':
      return (
        <FooterLine>
          <AlertTriangle
            aria-hidden="true"
            className="size-3.5 shrink-0 text-dynamic-orange"
          />
          <span className="min-w-0 flex-1 truncate text-foreground">
            {attentionLabel(status)}
          </span>
          <Button
            className="h-6 shrink-0 px-2 text-xs"
            disabled={attentionAction.kind === 'retry' && manualSyncDisabled}
            onClick={() => onAttentionAction(attentionAction)}
            size="xs"
            variant="ghost"
          >
            {attentionAction.kind === 'reconnect' ? t('reconnect') : t('retry')}
          </Button>
        </FooterLine>
      );
    case 'status_error':
      return (
        <FooterLine>
          <span className="min-w-0 truncate">{t('status_error')}</span>
          <span aria-hidden="true">·</span>
          <Button
            className="h-6 shrink-0 px-1 text-xs"
            onClick={onRetryStatus}
            size="xs"
            variant="link"
          >
            {t('retry')}
          </Button>
        </FooterLine>
      );
    default:
      return assertNever(status);
  }
}
