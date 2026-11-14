'use client';

import { Plus, Settings } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Button } from '../../button';
import { Skeleton } from '../../skeleton';
import { deriveCalendarAccountSyncState } from './calendar-account-status';
import {
  type CalendarListAccount,
  CalendarListAccountRow,
} from './calendar-list-account-row';
import {
  type CalendarListAttentionAction,
  CalendarListFooter,
} from './calendar-list-footer';
import { reconnectCalendarProvider } from './calendar-reconnect-action';
import { openCalendarSettings } from './calendar-settings-intent';
import {
  type CalendarSyncStatus,
  calendarSyncReconnectProviders,
} from './calendar-sync-status';
import { CalendarToggleRow } from './calendar-toggle-row';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

/** The manager fields the list reads; one manager instance feeds every surface. */
export type CalendarListPanelState = Pick<
  CalendarConnectionsManagerState,
  | 'accounts'
  | 'calendarsByAccount'
  | 'disconnectMutation'
  | 'disconnectingId'
  | 'getCalendarColor'
  | 'googleAuthMutation'
  | 'handleToggle'
  | 'isLoadingCalendars'
  | 'manualSyncDisabled'
  | 'microsoftAuthMutation'
  | 'needsReconnectAccounts'
  | 'providerAccountStatuses'
  | 'retrySyncStatus'
  | 'syncMutation'
  | 'syncStatus'
  | 'togglingIds'
  | 'togglingTuturuuuIds'
  | 'toggleWorkspaceCalendarMutation'
  | 'workspaceCalendars'
>;

const SKELETON_ROWS = [0, 1, 2, 3, 4] as const;

function CalendarListSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" role="status">
      <span className="sr-only">{label}</span>
      {SKELETON_ROWS.map((row) => (
        <div
          aria-hidden="true"
          className="flex h-8 items-center gap-2 px-2"
          key={row}
        >
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}

function attentionActionFor(
  status: CalendarSyncStatus,
  accounts: readonly Pick<CalendarListAccount, 'provider'>[]
): CalendarListAttentionAction {
  const [provider] = calendarSyncReconnectProviders(status, accounts);
  return provider ? { kind: 'reconnect', provider } : { kind: 'retry' };
}

/**
 * The single home for which calendars are visible and whether they sync:
 * Tuturuuu calendars, one group per provider account, "Add account", and a
 * one-line sync footer. Settings live in the app settings dialog.
 */
export function CalendarListPanel({
  onOpenSettings = openCalendarSettings,
  state,
}: {
  /** Opens Settings at the calendar accounts tab. */
  onOpenSettings?: () => void;
  state: CalendarListPanelState;
}) {
  const t = useTranslations('calendar-list');
  const titleId = useId();
  const activeIds = new Set(state.accounts.map((account) => account.id));
  const quarantined = state.needsReconnectAccounts.filter(
    (account) => !activeIds.has(account.id)
  );
  const isEmpty =
    state.workspaceCalendars.length === 0 &&
    state.accounts.length === 0 &&
    quarantined.length === 0;
  const reconnect = (provider: string) =>
    reconnectCalendarProvider(state, provider);
  const sync = () => state.syncMutation.mutate();

  const accountRow = (account: CalendarListAccount, isQuarantined: boolean) => {
    const calendars = state.calendarsByAccount[account.id] ?? [];
    return (
      <CalendarListAccountRow
        account={account}
        canSync={!isQuarantined && !state.manualSyncDisabled}
        disconnecting={state.disconnectingId === account.id}
        onDisconnect={() => state.disconnectMutation.mutate(account.id)}
        onOpenSettings={onOpenSettings}
        onReconnect={() => reconnect(account.provider)}
        onSync={sync}
        state={deriveCalendarAccountSyncState({
          accountId: account.id,
          calendars,
          providerState: state.providerAccountStatuses[account.id]?.state,
          quarantined: isQuarantined,
          syncStatus: state.syncStatus,
        })}
      />
    );
  };

  return (
    <section aria-labelledby={titleId} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 px-2">
        <h2
          className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
          id={titleId}
        >
          {t('title')}
        </h2>
        <Button
          aria-label={t('open_settings')}
          className="size-8"
          onClick={onOpenSettings}
          size="icon"
          variant="ghost"
        >
          <Settings className="size-4" />
        </Button>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        {state.isLoadingCalendars ? (
          <CalendarListSkeleton label={t('loading')} />
        ) : (
          <>
            {state.workspaceCalendars.map((calendar) => (
              <CalendarToggleRow
                checked={calendar.is_enabled}
                color={state.getCalendarColor(calendar.color || 'BLUE')}
                disabled={state.togglingTuturuuuIds.has(calendar.id)}
                hint={calendar.is_system ? t('built_in') : undefined}
                key={calendar.id}
                label={calendar.name}
                onToggle={() =>
                  state.toggleWorkspaceCalendarMutation.mutate({
                    id: calendar.id,
                    is_enabled: !calendar.is_enabled,
                  })
                }
              />
            ))}

            {state.accounts.map((account) => (
              <div key={account.id}>
                {accountRow(account, false)}
                {(state.calendarsByAccount[account.id] ?? []).map(
                  (calendar) => (
                    <CalendarToggleRow
                      checked={calendar.is_enabled}
                      className="pl-6"
                      color={state.getCalendarColor(calendar.color || 'BLUE')}
                      disabled={state.togglingIds.has(calendar.id)}
                      hint={
                        calendar.accessRole === 'reader'
                          ? t('read_only')
                          : undefined
                      }
                      key={calendar.id}
                      label={calendar.calendar_name}
                      onToggle={() =>
                        void state.handleToggle(
                          calendar.id,
                          calendar.is_enabled,
                          {
                            accessRole: calendar.accessRole,
                            accountId: calendar.accountId,
                            calendar_id: calendar.calendar_id,
                            calendar_name: calendar.calendar_name,
                            color: calendar.color,
                            connectionExists: calendar.connectionExists,
                          }
                        )
                      }
                    />
                  )
                )}
              </div>
            ))}

            {quarantined.map((account) => (
              <div key={account.id}>{accountRow(account, true)}</div>
            ))}

            {isEmpty ? (
              <p className="flex h-8 items-center px-2 text-muted-foreground text-xs">
                {t('empty')}
              </p>
            ) : null}

            <button
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-muted-foreground text-sm transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onOpenSettings}
              type="button"
            >
              <Plus aria-hidden="true" className="size-4 shrink-0" />
              {t('add_account')}
            </button>
          </>
        )}
      </div>

      <CalendarListFooter
        attentionAction={attentionActionFor(state.syncStatus, state.accounts)}
        manualSyncDisabled={state.manualSyncDisabled}
        onAttentionAction={(action) =>
          action.kind === 'reconnect' ? reconnect(action.provider) : sync()
        }
        onRetryStatus={() => void state.retrySyncStatus()}
        onSync={sync}
        status={state.syncStatus}
      />
    </section>
  );
}
