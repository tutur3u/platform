import { AlertTriangle, RefreshCw } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '../../alert';
import { Button } from '../../button';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

type RecoveryState = Pick<
  CalendarConnectionsManagerState,
  | 'failedCalendars'
  | 'pauseFailedCalendarMutation'
  | 'accounts'
  | 'providerAccountStatuses'
  | 'syncHealth'
  | 'syncStatusError'
  | 'retrySyncStatus'
  | 'syncMutation'
  | 'manualSyncDisabled'
  | 'googleAuthMutation'
  | 'microsoftAuthMutation'
  | 't'
>;

export function needsCalendarSyncAttention(
  state: Pick<
    RecoveryState,
    | 'syncHealth'
    | 'syncStatusError'
    | 'providerAccountStatuses'
    | 'syncMutation'
  >
) {
  const lastSuccess = state.syncHealth?.lastSuccessAt;
  const failedAttemptIsNewer =
    !lastSuccess || Date.parse(lastSuccess) < state.syncMutation.submittedAt;
  return (
    state.syncStatusError ||
    (failedAttemptIsNewer &&
      (state.syncMutation.isError || state.syncMutation.data?.ok === false)) ||
    state.syncHealth?.state === 'degraded' ||
    Object.values(state.providerAccountStatuses).some(
      (status) => status.state !== 'connected'
    )
  );
}

export function CalendarSyncRecovery({ state }: { state: RecoveryState }) {
  const { t, syncHealth, syncStatusError, providerAccountStatuses } = state;
  if (!needsCalendarSyncAttention(state) && !state.syncMutation.isPending)
    return null;
  const reconnectAccounts = state.accounts.filter(
    (account) =>
      providerAccountStatuses[account.id]?.state === 'reconnect_required'
  );
  const reason = syncStatusError
    ? 'unavailable'
    : reconnectAccounts.length
      ? 'reconnect_required'
      : Object.values(providerAccountStatuses).some(
            (status) => status.state === 'temporarily_unavailable'
          )
        ? 'provider_unavailable'
        : syncHealth?.state === 'degraded'
          ? syncHealth.reason
          : 'last_run_failed';
  const description =
    reason === 'sync_stalled'
      ? 'sync_recovery.stalled'
      : reason === 'sync_stale'
        ? 'sync_recovery.stale'
        : reason === 'not_synced'
          ? 'sync_recovery.not_synced'
          : reason === 'unavailable'
            ? 'sync_recovery.status_failed'
            : reason === 'reconnect_required' || reason === 'auth'
              ? 'sync_recovery.reconnect_description'
              : reason === 'configuration'
                ? 'sync_recovery.configuration'
                : reason === 'api_limit'
                  ? 'sync_recovery.rate_limited'
                  : reason === 'provider_unavailable'
                    ? 'sync_recovery.provider_unavailable'
                    : 'sync_recovery.failed';
  const reconnectProviders = new Set(
    reconnectAccounts.map((account) => account.provider)
  );
  if (
    !reconnectProviders.size &&
    (reason === 'auth' || reason === 'reconnect_required')
  ) {
    for (const provider of state.accounts.length
      ? state.accounts.map((account) => account.provider)
      : (['google', 'microsoft'] as const))
      reconnectProviders.add(provider);
  }
  return (
    <Alert className="border-dynamic-orange/30 bg-dynamic-orange/5 text-foreground">
      <AlertTriangle className="size-4 text-dynamic-orange" />
      <AlertTitle>{t('sync_recovery.attention')}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {t(
            state.syncMutation.isPending
              ? 'sync_recovery.syncing_description'
              : description
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          {t('sync_recovery.saved_events')}
        </p>
        {!!state.failedCalendars?.length && (
          <ul className="space-y-2">
            {state.failedCalendars.map((failure) => (
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
        {syncHealth?.lastSuccessAt && (
          <p className="text-xs">
            {t('last_synced_at')}:{' '}
            {new Date(syncHealth.lastSuccessAt).toLocaleString()}
          </p>
        )}
        {reconnectAccounts.map((account) => (
          <p key={account.id} className="break-all text-xs">
            {account.account_email}
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
            <RefreshCw
              className={
                state.syncMutation.isPending ? 'size-4 animate-spin' : 'size-4'
              }
            />
            {syncStatusError
              ? t('sync_recovery.check_again')
              : state.syncMutation.isPending
                ? t('syncing_calendars')
                : t('sync_now')}
          </Button>
          {reconnectProviders.has('google') && (
            <Button
              size="sm"
              disabled={state.googleAuthMutation.isPending}
              onClick={() => state.googleAuthMutation.mutate()}
            >
              {t('sync_recovery.reconnect_google')}
            </Button>
          )}
          {reconnectProviders.has('microsoft') && (
            <Button
              size="sm"
              disabled={state.microsoftAuthMutation.isPending}
              onClick={() => state.microsoftAuthMutation.mutate()}
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
