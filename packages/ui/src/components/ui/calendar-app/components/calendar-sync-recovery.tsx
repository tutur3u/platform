import { AlertTriangle, RefreshCw } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '../../alert';
import { Button } from '../../button';
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
  | 'syncHealth'
  | 'syncStatus'
  | 'retrySyncStatus'
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

function recoveryDescriptionKey(status: VisibleRecoveryStatus) {
  switch (status.kind) {
    case 'syncing':
      return 'sync_recovery.syncing_description';
    case 'status_error':
      return 'sync_recovery.status_failed';
    case 'attention':
      return syncAttentionDescriptionKey(status.reason);
  }
}

export function CalendarSyncRecovery({ state }: { state: RecoveryState }) {
  const { t, syncHealth, syncStatus: status } = state;
  if (
    status.kind !== 'syncing' &&
    status.kind !== 'attention' &&
    status.kind !== 'status_error'
  )
    return null;
  const syncing = calendarSyncIsActive(status);
  const needsAttention = status.kind !== 'syncing';
  const syncStatusError = status.kind === 'status_error';
  const reconnectAccounts = status.kind === 'syncing' ? [] : status.accounts;
  const reconnectProviders = calendarSyncReconnectProviders(
    status,
    state.accounts
  );
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
      <AlertTitle>
        {t(needsAttention ? 'sync_recovery.attention' : 'syncing_calendars')}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{t(recoveryDescriptionKey(status))}</p>
        <p className="text-muted-foreground text-xs">
          {t('sync_recovery.saved_events')}
        </p>
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
        {reconnectAccounts.map((account) => (
          <p key={account.id} className="break-all text-xs">
            {account.account_email ?? account.account_name}
          </p>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={syncStatusError ? false : state.manualSyncDisabled}
            onClick={() =>
              syncStatusError
                ? void state.retrySyncStatus()
                : state.syncMutation.mutate()
            }
          >
            <RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />
            {syncStatusError
              ? t('sync_recovery.check_again')
              : syncing
                ? t('syncing_calendars')
                : t('sync_now')}
          </Button>
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
