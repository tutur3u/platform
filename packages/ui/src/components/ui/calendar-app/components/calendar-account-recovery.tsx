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
  | 't'
>;

export function CalendarStatusRetry({
  state,
}: {
  state: Pick<RecoveryControls, 'retrySyncStatus' | 't'>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => void state.retrySyncStatus()}
      >
        {state.t('sync_recovery.check_again')}
      </Button>
      <Button asChild size="sm" variant="link">
        <a href="mailto:support@tuturuuu.com">
          {state.t('sync_recovery.contact_support')}
        </a>
      </Button>
    </div>
  );
}

export function CalendarAccountRecovery({
  account,
  status,
  state,
  showAccount = true,
}: {
  account: CalendarSyncAccountRef;
  status: CalendarProviderAccountState | undefined;
  state: RecoveryControls;
  showAccount?: boolean;
}) {
  if (!status || status === 'connected') return null;
  const { t } = state;
  const label =
    account.account_name || account.account_email || t('unknown_account');
  const isGoogle = account.provider === 'google';

  return (
    <div className="space-y-2 rounded-md border p-3">
      {showAccount && <p className="break-words font-medium">{label}</p>}
      <p className="text-muted-foreground text-xs">
        {t(
          status === 'scope_required'
            ? 'sync_recovery.scope_required'
            : status === 'removed'
              ? 'sync_recovery.account_removed'
              : status === 'reconnect_required'
                ? 'sync_recovery.reconnect_description'
                : 'sync_recovery.provider_unavailable'
        )}
      </p>
      {status === 'temporarily_unavailable' ? (
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
