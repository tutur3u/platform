import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarConnectionsCompact } from './calendar-connections-compact';
import {
  type CalendarSyncStatusInput,
  deriveCalendarSyncStatus,
} from './calendar-sync-status';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

vi.mock('./calendar-connections-settings-content', () => ({
  CalendarConnectionsSettingsContent: () => <div>Settings</div>,
}));

const mutation = () => ({ mutate: vi.fn(), isPending: false });

/** Builds manager state the way the manager does: status from plain inputs. */
function state(statusInput: Partial<CalendarSyncStatusInput>) {
  const syncStatus = deriveCalendarSyncStatus({
    queryErrored: false,
    accountsLoaded: true,
    accounts: [],
    providerAccountStatuses: {},
    syncMutation: { isPending: false, isError: false, submittedAt: 0 },
    ...statusInput,
  });
  return {
    accounts: [],
    calendarConnections: [],
    calendarsByAccount: {},
    enabledCount: 0,
    expandedPopoverAccounts: new Set<string>(),
    failedCalendars: [],
    getCalendarColor: () => 'blue',
    googleAuthMutation: mutation(),
    handleToggle: vi.fn(),
    hasConnectedAccounts: false,
    isLoadingCalendars: true,
    manualSyncDisabled: false,
    microsoftAuthMutation: mutation(),
    needsReconnectAccounts: [],
    pauseFailedCalendarMutation: mutation(),
    providerAccountStatuses: {},
    retrySyncStatus: vi.fn(),
    setExpandedPopoverAccounts: vi.fn(),
    syncHealth: statusInput.status?.health,
    syncMutation: mutation(),
    syncStatus,
    syncStatusError: statusInput.queryErrored ?? false,
    syncStatusStyles: '',
    t: (key: string) => key,
    togglingIds: new Set<string>(),
    togglingTuturuuuIds: new Set<string>(),
    toggleWorkspaceCalendarMutation: mutation(),
    userEmail: null,
    workspaceCalendars: [],
  } as unknown as CalendarConnectionsManagerState;
}

const disconnectedHealth = {
  state: 'disconnected' as const,
  reason: 'no_accounts',
  lastSuccessAt: null,
  lastFailureAt: null,
  currentlyRunning: false,
  retryAfterSeconds: null,
};

function openPopover(value: CalendarConnectionsManagerState) {
  render(<CalendarConnectionsCompact state={value} />);
  fireEvent.click(screen.getByRole('button', { name: 'calendars' }));
}

describe('CalendarConnectionsCompact connect card', () => {
  it('offers to connect only after an empty, successful accounts response', () => {
    openPopover(state({ status: { health: disconnectedHealth } }));
    expect(screen.getByText('connect_calendar_accounts')).toBeVisible();
    expect(screen.getByText('sync_recovery.not_connected')).toBeVisible();
    expect(screen.queryByText('connect_accounts')).toBeNull();
  });

  it('does not offer to connect when the accounts request failed', () => {
    const value = state({
      accountsLoaded: false,
      queryErrored: true,
      status: { health: disconnectedHealth },
    });
    expect(value.syncStatus.kind).toBe('status_error');
    openPopover(value);
    expect(screen.queryByText('connect_calendar_accounts')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain(
      'sync_recovery.status_failed'
    );
  });

  it('shows a neutral check, not an unavailable status, while loading', () => {
    openPopover(state({ accountsLoaded: false, status: undefined }));
    expect(screen.getByText('sync_recovery.checking')).toBeVisible();
    expect(screen.queryByText('sync_recovery.unavailable')).toBeNull();
    expect(screen.queryByText('connect_calendar_accounts')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
