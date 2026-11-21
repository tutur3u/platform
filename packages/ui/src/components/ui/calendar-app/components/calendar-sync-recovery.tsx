import { AlertTriangle, RefreshCw } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '../../alert';
import { Button } from '../../button';
import {
  CalendarAccountRecovery,
  CalendarStatusRetry,
} from './calendar-account-recovery';
import { isCalendarAccountStatusRetryable } from './calendar-account-status';
import { reconnectCalendarProvider } from './calendar-reconnect-action';
import {
  type CalendarSyncStatus,
  calendarSyncIsActive,
  calendarSyncNeedsAttention,
  calendarSyncReconnectProviders,
  syncAttentionDescriptionKey,
} from './calendar-sync-status';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

type RecoveryState = Pick<
  CalendarConnectionsManagerState,
  | 'pauseFailedCalendarMutation'
  | 'accounts'
  | 'providerAccountStatuses'
  | 'statusCheckFailure'
  | 'disconnectingId'
  | 'disconnectMutation'
  | 'syncHealth'
  | 'syncStatus'
  | 'retrySyncStatus'
  | 'isRetryingSyncStatus'
  | 'showSyncStatusSupport'
  | 'syncMutation'
  | 'manualSyncDisabled'
  | 'googleAuthMutation'
  | 'microsoftAuthMutation'
  | 't'
>;

export function needsCalendarSyncAttention(
  state: Pick<RecoveryState, 'syncStatus'>
) {
  return calendarSyncNeedsAttention(state.syncStatus);
}

export function isCalendarSyncActive(state: Pick<RecoveryState, 'syncStatus'>) {
  return calendarSyncIsActive(state.syncStatus);
}

type VisibleRecoveryStatus = Extract<
  CalendarSyncStatus,
  { kind: 'syncing' | 'attention' | 'status_error' }
>;

function recoveryDescriptionKey(
  status: VisibleRecoveryStatus,
  failure: RecoveryState['statusCheckFailure']
) {
  switch (status.kind) {
    case 'syncing':
      return 'sync_recovery.syncing_description';
    case 'status_error':
      return `sync_recovery.status_detail_${failure ?? 'network'}` as const;
    case 'attention':
      return syncAttentionDescriptionKey(status.reason);
  }
}

export function CalendarSyncRecovery({
  state,
  showAccountRows = true,
}: {
  state: RecoveryState;
  showAccountRows?: boolean;
}) {
  const { t, syncHealth, syncStatus: status } = state;
  if (
    status.kind !== 'syncing' &&
    status.kind !== 'attention' &&
    status.kind !== 'status_error'
  )
    return null;
  const syncing = calendarSyncIsActive(status);
  const needsAttention = status.kind !== 'syncing';
  const reconnectAccounts = status.kind === 'syncing' ? [] : status.accounts;
  const reconnectAccountIds = new Set(reconnectAccounts.map(({ id }) => id));
  const accountsWithIssues = new Map(
    reconnectAccounts.map((account) => [account.id, account])
  );
  for (const account of state.accounts) {
    const accountStatus = state.providerAccountStatuses?.[account.id]?.state;
    if (accountStatus && accountStatus !== 'connected')
      accountsWithIssues.set(account.id, account);
  }
  const reconnectProviders = accountsWithIssues.size
    ? new Set<string>()
    : calendarSyncReconnectProviders(status, state.accounts);
  const retryStatus =
    status.kind === 'status_error' ||
    (status.kind === 'attention' &&
      ['configuration', 'provider_unavailable'].includes(status.reason));
  const hasAccountRetry = [...accountsWithIssues.keys()].some(
    (id) =>
      !reconnectAccountIds.has(id) &&
      isCalendarAccountStatusRetryable(
        state.providerAccountStatuses?.[id]?.state
      )
  );
  const showSupport =
    (retryStatus || hasAccountRetry) && state.showSyncStatusSupport;
  const showRetry = retryStatus && !hasAccountRetry;
  const summary =
    status.kind === 'attention' && (accountsWithIssues.size || syncing)
      ? 'sync_recovery.attention'
      : recoveryDescriptionKey(status, state.statusCheckFailure);
  return (
    <Alert
      role={needsAttention ? 'alert' : 'status'}
      className={
        needsAttention
          ? 'border-dynamic-orange/30 bg-dynamic-orange/5 text-foreground'
          : 'border-border bg-muted/30 text-foreground'
      }
    >
      {!needsAttention ? (
        <RefreshCw className="size-4 animate-spin" />
      ) : (
        <AlertTriangle className="size-4 text-dynamic-orange" />
      )}
      <AlertTitle>{t(summary)}</AlertTitle>
      <AlertDescription className="space-y-2">
        {!!status.failedCalendars.length && (
          <ul className="space-y-2">
            {status.failedCalendars.map((failure) => (
              <li
                key={failure.connectionId}
                className="space-y-2 rounded-md border p-3"
              >
                <p className="break-words font-medium">
                  {failure.calendarName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t(
                    failure.code === 'not_found' ||
                      failure.code === 'access_denied'
                      ? 'sync_recovery.calendar_unavailable'
                      : 'sync_recovery.calendar_failed'
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={state.pauseFailedCalendarMutation.isPending}
                  onClick={() =>
                    state.pauseFailedCalendarMutation.mutate(
                      failure.connectionId
                    )
                  }
                >
                  {t('sync_recovery.pause_calendar')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {status.lastSuccessAt && (
          <p className="text-xs">
            {t('last_synced_at', {
              time: new Date(status.lastSuccessAt).toLocaleString(),
            })}
          </p>
        )}
        {showAccountRows && accountsWithIssues.size > 0 && (
          <div className="divide-y">
            {[...accountsWithIssues.values()].map((account) => (
              <CalendarAccountRecovery
                key={account.id}
                account={account}
                status={
                  reconnectAccountIds.has(account.id)
                    ? 'reconnect_required'
                    : state.providerAccountStatuses?.[account.id]?.state
                }
                state={state}
              />
            ))}
          </div>
        )}
        {(showRetry || showSupport) && (
          <div className="flex flex-wrap items-center gap-2">
            {showRetry && <CalendarStatusRetry state={state} />}
            {showSupport && (
              <Button asChild size="sm" variant="link">
                <a href="mailto:support@tuturuuu.com">
                  {t('sync_recovery.contact_support')}
                </a>
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!retryStatus && (
            <Button
              size="sm"
              variant="outline"
              disabled={state.manualSyncDisabled}
              onClick={() => state.syncMutation.mutate()}
            >
              <RefreshCw
                className={syncing ? 'size-4 animate-spin' : 'size-4'}
              />
              {t(syncing ? 'syncing_calendars' : 'sync_now')}
            </Button>
          )}
          {reconnectProviders.has('google') && (
            <Button
              size="sm"
              disabled={state.googleAuthMutation.isPending}
              onClick={() => reconnectCalendarProvider(state, 'google')}
            >
              {t('sync_recovery.reconnect_google')}
            </Button>
          )}
          {reconnectProviders.has('microsoft') && (
            <Button
              size="sm"
              disabled={state.microsoftAuthMutation.isPending}
              onClick={() => reconnectCalendarProvider(state, 'microsoft')}
            >
              {t('sync_recovery.reconnect_microsoft')}
            </Button>
          )}
        </div>
        {(syncHealth?.retryAfterSeconds ?? 0) > 0 && (
          <p className="text-xs">
            {t('sync_recovery.retry_after', {
              seconds: syncHealth!.retryAfterSeconds!,
            })}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
