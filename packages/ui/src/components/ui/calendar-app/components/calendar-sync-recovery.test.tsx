import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarSyncAttentionButton } from './calendar-sync-attention-button';
import {
  CalendarSyncRecovery,
  needsCalendarSyncAttention,
} from './calendar-sync-recovery';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

vi.mock('./calendar-connections-settings-content', () => ({
  CalendarConnectionsSettingsContent: () => <div>Settings</div>,
}));

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

it('shows neutral progress for an automatic sync instead of an attention warning', () => {
  const value = state();
  value.syncHealth!.state = 'syncing';
  value.syncHealth!.currentlyRunning = true;
  value.manualSyncDisabled = true;
  render(<CalendarSyncRecovery state={value} />);
  expect(screen.queryByText('sync_recovery.attention')).toBeNull();
  expect(screen.getByRole('status')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('sync_recovery.syncing_description')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'syncing_calendars' })
  ).toBeDisabled();
});

it('keeps an open settings dialog neutral when automatic syncing finishes', () => {
  const value = state();
  value.syncHealth!.currentlyRunning = true;
  value.syncHealth!.state = 'syncing';
  const view = render(<CalendarSyncAttentionButton state={value} />);
  fireEvent.click(screen.getByRole('button', { name: 'syncing_calendars' }));
  value.syncHealth!.currentlyRunning = false;
  value.syncHealth!.state = 'healthy';
  view.rerender(<CalendarSyncAttentionButton state={value} />);
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.queryByText('sync_recovery.attention')).toBeNull();
  expect(screen.queryByText('syncing_calendars')).toBeNull();
});

it('keeps reconnection warnings prominent while another calendar syncs', () => {
  const value = state({
    providerAccountStatuses: { google: { state: 'reconnect_required' } },
  });
  value.syncHealth!.state = 'syncing';
  value.syncHealth!.currentlyRunning = true;
  render(<CalendarSyncRecovery state={value} />);
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByText('sync_recovery.attention')).toBeVisible();
});

it('keeps the status live region mounted before syncing starts', () => {
  const value = state();
  value.syncHealth!.state = 'healthy';
  const view = render(<CalendarSyncAttentionButton state={value} />);
  const liveRegion = screen.getByRole('status');
  expect(liveRegion).toHaveTextContent('');
  value.syncHealth!.currentlyRunning = true;
  view.rerender(<CalendarSyncAttentionButton state={value} />);
  expect(screen.getByRole('status')).toBe(liveRegion);
  expect(liveRegion).toHaveTextContent('syncing_calendars');
});
