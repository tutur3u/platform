import {
  type CalendarProviderAccountState,
  type CalendarSyncStatus,
  calendarSyncIsActive,
} from './calendar-sync-status';

/** The status dot of one account row, in the vocabulary of `CalendarSyncStatus`. */
export type CalendarAccountSyncState =
  | { kind: 'connected' }
  | { kind: 'syncing' }
  | {
      kind: 'attention';
      reason: 'reconnect_required' | 'provider_unavailable';
    }
  /** No calendar of this account is selected, or sync is paused overall. */
  | { kind: 'paused' };

export interface CalendarAccountSyncInput {
  accountId: string;
  /** The provider's state for this account, when the provider list loaded. */
  providerState?: CalendarProviderAccountState;
  /** Sync quarantined this account after the provider rejected its credential. */
  quarantined: boolean;
  syncStatus: CalendarSyncStatus;
  calendars: readonly { is_enabled: boolean }[];
}

/** Attention wins, then a running sync, then paused, then connected. */
export function deriveCalendarAccountSyncState(
  input: CalendarAccountSyncInput
): CalendarAccountSyncState {
  const { syncStatus } = input;
  const namedForReconnect =
    (syncStatus.kind === 'attention' || syncStatus.kind === 'status_error') &&
    syncStatus.accounts.some((account) => account.id === input.accountId);

  if (
    input.quarantined ||
    input.providerState === 'reconnect_required' ||
    namedForReconnect
  ) {
    return { kind: 'attention', reason: 'reconnect_required' };
  }
  if (input.providerState === 'temporarily_unavailable') {
    return { kind: 'attention', reason: 'provider_unavailable' };
  }
  if (calendarSyncIsActive(syncStatus)) return { kind: 'syncing' };
  if (
    syncStatus.kind === 'paused' ||
    (input.calendars.length > 0 &&
      !input.calendars.some((calendar) => calendar.is_enabled))
  ) {
    return { kind: 'paused' };
  }
  return { kind: 'connected' };
}

export type CalendarAccountStatusLabelKey =
  | 'account_status_connected'
  | 'account_status_syncing'
  | 'account_status_attention'
  | 'account_status_paused';

export function calendarAccountStatusLabelKey(
  state: CalendarAccountSyncState
): CalendarAccountStatusLabelKey {
  switch (state.kind) {
    case 'connected':
      return 'account_status_connected';
    case 'syncing':
      return 'account_status_syncing';
    case 'attention':
      return 'account_status_attention';
    case 'paused':
      return 'account_status_paused';
    default: {
      const unhandled: never = state;
      throw new Error(
        `Unhandled calendar account state: ${JSON.stringify(unhandled)}`
      );
    }
  }
}
