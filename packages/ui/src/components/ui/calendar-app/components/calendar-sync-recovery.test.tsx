import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CalendarSyncRecovery,
  needsCalendarSyncAttention,
} from './calendar-sync-recovery';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

function state(overrides: Partial<CalendarConnectionsManagerState> = {}) {
  return {
    accounts: [],
    failedCalendars: [],
    pauseFailedCalendarMutation: { mutate: vi.fn(), isPending: false },
    providerAccountStatuses: {},
    syncStatusError: false,
    syncHealth: {
      state: 'degraded',
      reason: 'sync_stalled',
      currentlyRunning: false,
      lastSuccessAt: null,
      lastFailureAt: null,
      retryAfterSeconds: null,
    },
    retrySyncStatus: vi.fn(),
    syncMutation: { mutate: vi.fn(), isPending: false },
    manualSyncDisabled: false,
    googleAuthMutation: { mutate: vi.fn(), isPending: false },
    microsoftAuthMutation: { mutate: vi.fn(), isPending: false },
    t: (key: string) => key,
    ...overrides,
  } as unknown as CalendarConnectionsManagerState;
}
describe('calendar sync recovery actions', () => {
  it('shows a persistent warning with a working retry for the stalled-run case', () => {
    const value = state();
    render(<CalendarSyncRecovery state={value} />);
    expect(screen.getByRole('alert').textContent).toContain(
      'sync_recovery.stalled'
    );
    fireEvent.click(screen.getByRole('button', { name: 'sync_now' }));
    expect(value.syncMutation.mutate).toHaveBeenCalledOnce();
    expect(screen.queryByText('sync_recovery.reconnect_google')).toBeNull();
  });
  it('rechecks failed status requests instead of starting an unobserved sync', () => {
    const value = state({ syncStatusError: true });
    render(<CalendarSyncRecovery state={value} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'sync_recovery.check_again' })
    );
    expect(value.retrySyncStatus).toHaveBeenCalledOnce();
    expect(value.syncMutation.mutate).not.toHaveBeenCalled();
  });
  it('offers Google reconnection for the affected account', () => {
    const value = state({
      accounts: [
        {
          id: 'google-account',
          provider: 'google',
          account_email: 'test@example.com',
        } as never,
      ],
      providerAccountStatuses: {
        'google-account': { state: 'reconnect_required' },
      },
    });
    render(<CalendarSyncRecovery state={value} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'sync_recovery.reconnect_google' })
    );
    expect(value.googleAuthMutation.mutate).toHaveBeenCalledOnce();
  });
  it('does not send users through OAuth for a temporary provider outage', () => {
    const value = state({
      providerAccountStatuses: { google: { state: 'temporarily_unavailable' } },
    });
    render(<CalendarSyncRecovery state={value} />);
    expect(screen.getByRole('alert').textContent).toContain(
      'sync_recovery.provider_unavailable'
    );
    expect(screen.queryByText('sync_recovery.reconnect_google')).toBeNull();
  });
  it('hides the warning after a healthy sync', () => {
    const value = state();
    value.syncHealth!.state = 'healthy';
    expect(needsCalendarSyncAttention(value)).toBe(false);
    render(<CalendarSyncRecovery state={value} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

it('can pause an identified calendar during the retry cooldown without deleting saved events', () => {
  const value = state({
    manualSyncDisabled: true,
    failedCalendars: [
      {
        connectionId: 'broken',
        calendarName: 'Unavailable calendar',
        code: 'not_found',
      },
    ],
  });
  render(<CalendarSyncRecovery state={value} />);
  expect(screen.getByRole('button', { name: 'sync_now' })).toBeDisabled();
  expect(screen.getByText('Unavailable calendar')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'sync_recovery.pause_calendar' })
  );
  expect(value.pauseFailedCalendarMutation.mutate).toHaveBeenCalledWith(
    'broken'
  );
  expect(value.syncMutation.mutate).not.toHaveBeenCalled();
});
