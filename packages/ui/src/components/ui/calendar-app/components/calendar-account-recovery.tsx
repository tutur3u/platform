import type { CalendarProviderAccountState } from '@tuturuuu/internal-api/calendar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../alert-dialog';
import { Button } from '../../button';
import { isCalendarAccountStatusRetryable } from './calendar-account-status';
import { reconnectCalendarProvider } from './calendar-reconnect-action';
import type { CalendarSyncAccountRef } from './calendar-sync-status';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

type RecoveryControls = Pick<
  CalendarConnectionsManagerState,
  | 'disconnectMutation'
  | 'disconnectingId'
  | 'googleAuthMutation'
  | 'microsoftAuthMutation'
  | 'retrySyncStatus'
  | 'isRetryingSyncStatus'
  | 't'
>;

export function CalendarStatusRetry({
  state,
}: {
  state: Pick<
    RecoveryControls,
    'isRetryingSyncStatus' | 'retrySyncStatus' | 't'
  >;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={state.isRetryingSyncStatus}
      onClick={() => state.retrySyncStatus()}
    >
      {state.t(
        state.isRetryingSyncStatus
          ? 'sync_recovery.checking'
          : 'sync_recovery.check_again'
      )}
    </Button>
  );
}

const ACCOUNT_STATUS_LABELS = {
  reconnect_required: 'sync_recovery.account_status_expired',
  temporarily_unavailable: 'sync_recovery.account_status_retry',
  status_unknown: 'sync_recovery.account_status_unknown',
  configuration: 'sync_recovery.account_status_configuration',
  scope_required: 'sync_recovery.account_status_scope',
  removed: 'sync_recovery.account_status_removed',
} as const satisfies Record<
  Exclude<CalendarProviderAccountState, 'connected'>,
  string
>;

export function CalendarAccountRecovery({
  account,
  status,
  state,
  showAccount = true,
}: {
  account: CalendarSyncAccountRef;
  status: keyof typeof ACCOUNT_STATUS_LABELS | 'connected' | undefined;
  state: RecoveryControls;
  showAccount?: boolean;
}) {
  if (!status || status === 'connected') return null;
  const { t } = state;
  const label =
    account.account_name || account.account_email || t('unknown_account');
  const isGoogle = account.provider === 'google';

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <div className="min-w-0 flex-1">
        {showAccount && (
          <p className="break-words font-medium text-sm">{label}</p>
        )}
        <p className="text-muted-foreground text-xs">
          {t(ACCOUNT_STATUS_LABELS[status])}
        </p>
      </div>
      {isCalendarAccountStatusRetryable(status) ? (
        <CalendarStatusRetry state={state} />
      ) : status === 'removed' ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={state.disconnectingId === account.id}
            >
              {t('sync_recovery.remove_account')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('sync_recovery.remove_account')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('sync_recovery.confirm_remove_account', { account: label })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => state.disconnectMutation.mutate(account.id)}
              >
                {t('sync_recovery.remove_account')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={
            isGoogle
              ? state.googleAuthMutation.isPending
              : state.microsoftAuthMutation.isPending
          }
          onClick={() =>
            reconnectCalendarProvider(state, account.provider, account.id)
          }
        >
          {t(
            status === 'scope_required'
              ? 'sync_recovery.grant_access'
              : isGoogle
                ? 'sync_recovery.reconnect_google'
                : 'sync_recovery.reconnect_microsoft'
          )}
        </Button>
      )}
    </div>
  );
}
