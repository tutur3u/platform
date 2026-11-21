import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarSyncAttentionButton } from './calendar-sync-attention-button';
import {
  CalendarSyncRecovery,
  needsCalendarSyncAttention,
} from './calendar-sync-recovery';
import { deriveCalendarSyncStatus } from './calendar-sync-status';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

vi.mock('./calendar-connections-settings-content', () => ({
  CalendarConnectionsSettingsContent: () => <div>Settings</div>,
}));

/**
 * Mirrors the manager: `syncStatus` is derived from the fixture's current
 * fields, so tests that change `syncHealth` in place see the new state.
 */
function state(overrides: Partial<CalendarConnectionsManagerState> = {}) {
  const value = {
    accounts: [],
    disconnectMutation: { mutate: vi.fn() },
    disconnectingId: null,
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
  return Object.defineProperty(value, 'syncStatus', {
    get: () =>
      deriveCalendarSyncStatus({
        status: value.syncHealth && {
          health: value.syncHealth,
          failedCalendars: value.failedCalendars,
        },
        queryErrored: value.syncStatusError,
        accountsLoaded: !value.syncStatusError,
        accounts: value.accounts,
        needsReconnectAccounts: value.needsReconnectAccounts,
        providerAccountStatuses: value.providerAccountStatuses,
        syncMutation: value.syncMutation,
      }),
  });
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
  it('offers support only after an explicit status retry fails', () => {
    const value = state({ syncStatusError: true });
    const view = render(<CalendarSyncRecovery state={value} />);
    expect(
      screen.queryByRole('link', { name: 'sync_recovery.contact_support' })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'sync_recovery.check_again' })
    );
    expect(value.retrySyncStatus).toHaveBeenCalledOnce();
    value.isRetryingSyncStatus = true;
    view.rerender(<CalendarSyncRecovery state={value} />);
    expect(
      screen.getByRole('button', { name: 'sync_recovery.checking' })
    ).toBeDisabled();
    expect(
      screen.queryByRole('link', { name: 'sync_recovery.contact_support' })
    ).toBeNull();
    value.isRetryingSyncStatus = false;
    value.showSyncStatusSupport = true;
    view.rerender(<CalendarSyncRecovery state={value} />);
    expect(
      screen.getByRole('link', { name: 'sync_recovery.contact_support' })
    ).toHaveAttribute('href', 'mailto:support@tuturuuu.com');
    expect(value.syncMutation.mutate).not.toHaveBeenCalled();
  });
  it('lists quarantined accounts with a reconnect action even when sync is healthy', () => {
    const value = state({
      syncHealth: {
        state: 'healthy',
        reason: null,
        currentlyRunning: false,
        lastSuccessAt: null,
        lastFailureAt: null,
        retryAfterSeconds: null,
      },
      needsReconnectAccounts: [
        {
          id: 'quarantined',
          provider: 'microsoft',
          account_email: null,
          account_name: 'Owner Outlook',
          deactivated_reason: 'microsoft_consent_revoked',
          deactivated_at: '2026-10-26T03:00:00Z',
        },
      ],
    } as unknown as Partial<CalendarConnectionsManagerState>);
    expect(needsCalendarSyncAttention(value)).toBeTruthy();
    render(<CalendarSyncRecovery state={value} />);
    expect(screen.getByRole('alert').textContent).toContain(
      'sync_recovery.account_status_expired'
    );
    expect(screen.getByText('Owner Outlook')).toBeTruthy();
    expect(screen.queryByText('sync_recovery.reconnect_google')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'sync_recovery.reconnect_microsoft' })
    );
    expect(value.microsoftAuthMutation.mutate).toHaveBeenCalledOnce();
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
    const view = render(<CalendarSyncRecovery state={value} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'sync_recovery.reconnect_google' })
    );
    expect(value.googleAuthMutation.mutate).toHaveBeenCalledOnce();
    expect(value.googleAuthMutation.mutate).toHaveBeenCalledWith({
      reconnect: true,
      accountId: 'google-account',
    });
    view.rerender(
      <CalendarSyncRecovery state={value} showAccountRows={false} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'sync_recovery.attention'
    );
    expect(
      screen.queryByRole('button', { name: 'sync_recovery.reconnect_google' })
    ).toBeNull();
  });
  it('asks for permissions on the selected account and confirms removal of the retired account', () => {
    const makeAccount = (id: string, name: string) => ({
      id,
      provider: 'google' as const,
      account_name: name,
      account_email: null,
      is_active: true,
      created_at: '',
      expires_at: null,
    });
    const value = state({
      accounts: [
        makeAccount('scope', 'Education'),
        makeAccount('removed', 'Old work'),
      ],
      providerAccountStatuses: {
        scope: { state: 'scope_required' },
        removed: { state: 'removed' },
      },
    });
    render(<CalendarSyncRecovery state={value} />);
    expect(screen.getByText('Education')).toBeVisible();
    expect(screen.getByText('Old work')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'sync_recovery.grant_access' })
    );
    expect(value.googleAuthMutation.mutate).toHaveBeenCalledWith({
      reconnect: true,
      accountId: 'scope',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'sync_recovery.remove_account' })
    );
    const confirmation = screen.getByRole('alertdialog');
    expect(value.disconnectMutation.mutate).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole('button', {
        name: 'sync_recovery.remove_account',
      })
    );
    expect(value.disconnectMutation.mutate).toHaveBeenCalledWith('removed');
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

it('keeps account management neutral and focus on the chip when syncing finishes', async () => {
  const value = state();
  value.syncHealth!.currentlyRunning = true;
  value.syncHealth!.state = 'syncing';
  const view = render(<CalendarSyncAttentionButton state={value} />);
  fireEvent.click(screen.getByRole('button', { name: 'syncing_calendars' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'manage_calendar_accounts' })
  );
  const settings = await screen.findByRole('dialog', {
    name: 'manage_calendar_accounts',
  });
  value.syncHealth!.currentlyRunning = false;
  value.syncHealth!.state = 'healthy';
  view.rerender(<CalendarSyncAttentionButton state={value} />);
  expect(screen.getByText('manage_calendar_accounts_desc')).toBeVisible();
  expect(screen.queryByText('sync_recovery.attention')).toBeNull();
  expect(screen.queryByText('syncing_calendars')).toBeNull();

  fireEvent.keyDown(settings, { key: 'Escape' });
  const chip = await screen.findByRole('button', {
    name: 'manage_calendar_accounts',
  });
  await waitFor(() => expect(chip).toHaveFocus());
  fireEvent.blur(chip);
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'manage_calendar_accounts' })
    ).toBeNull()
  );
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

it('shows nothing while the first status response is loading', () => {
  const value = state({
    syncHealth: undefined,
    needsReconnectAccounts: [
      {
        id: 'quarantined',
        provider: 'microsoft',
        account_email: null,
        account_name: 'Owner Outlook',
        deactivated_reason: 'microsoft_consent_revoked',
        deactivated_at: '2026-10-26T03:00:00Z',
      },
    ],
  });
  expect(value.syncStatus.kind).toBe('loading');
  expect(needsCalendarSyncAttention(value)).toBe(false);
  render(<CalendarSyncRecovery state={value} />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText('sync_recovery.status_failed')).toBeNull();
});

it('explains a failed status request instead of a sync failure', () => {
  render(<CalendarSyncRecovery state={state({ syncStatusError: true })} />);
  expect(screen.getByRole('alert').textContent).toContain(
    'sync_recovery.status_detail_network'
  );
  expect(screen.queryByText('sync_recovery.stalled')).toBeNull();
});

it('opens attention actions inline and account management from there', async () => {
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
  render(<CalendarSyncAttentionButton state={value} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'sync_recovery.attention' })
  );
  expect(
    screen.getByRole('button', { name: 'sync_recovery.reconnect_google' })
  ).toBeVisible();
  expect(
    screen.getByRole('dialog', { name: 'sync_recovery.attention' })
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'manage_calendar_accounts' })
  );
  const settings = await screen.findByRole('dialog', {
    name: 'manage_calendar_accounts',
  });
  expect(screen.getByText('manage_calendar_accounts_desc')).toBeVisible();
  await waitFor(() =>
    expect(settings).toContainElement(document.activeElement as HTMLElement)
  );
  fireEvent.keyDown(settings, { key: 'Escape' });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'sync_recovery.attention' })
    ).toHaveFocus()
  );
});

it('returns focus to the chip when the popover closes with Escape', async () => {
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
  render(<CalendarSyncAttentionButton state={value} />);
  const chip = screen.getByRole('button', { name: 'sync_recovery.attention' });
  fireEvent.click(chip);
  fireEvent.keyDown(
    screen.getByRole('dialog', { name: 'sync_recovery.attention' }),
    { key: 'Escape' }
  );
  await waitFor(() => expect(chip).toHaveFocus());
});

it('returns focus to the chip when sync recovers while its popover is open', async () => {
  const value = state();
  value.syncHealth!.currentlyRunning = true;
  value.syncHealth!.state = 'syncing';
  const view = render(<CalendarSyncAttentionButton state={value} />);
  fireEvent.click(screen.getByRole('button', { name: 'syncing_calendars' }));
  const popover = screen.getByRole('dialog', { name: 'syncing_calendars' });
  value.syncHealth!.currentlyRunning = false;
  value.syncHealth!.state = 'healthy';
  view.rerender(<CalendarSyncAttentionButton state={value} />);
  fireEvent.keyDown(popover, { key: 'Escape' });
  const chip = await screen.findByRole('button', {
    name: 'manage_calendar_accounts',
  });
  await waitFor(() => expect(chip).toHaveFocus());
  fireEvent.blur(chip);
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'manage_calendar_accounts' })
    ).toBeNull()
  );
});

it('keeps the healthy chip while its reopened popover is open', async () => {
  const value = state();
  value.syncHealth!.currentlyRunning = true;
  value.syncHealth!.state = 'syncing';
  const view = render(<CalendarSyncAttentionButton state={value} />);
  fireEvent.click(screen.getByRole('button', { name: 'syncing_calendars' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'manage_calendar_accounts' })
  );
  const settings = await screen.findByRole('dialog', {
    name: 'manage_calendar_accounts',
  });
  value.syncHealth!.currentlyRunning = false;
  value.syncHealth!.state = 'healthy';
  view.rerender(<CalendarSyncAttentionButton state={value} />);
  fireEvent.keyDown(settings, { key: 'Escape' });
  const chip = await screen.findByRole('button', {
    name: 'manage_calendar_accounts',
  });
  await waitFor(() => expect(chip).toHaveFocus());
  fireEvent.click(chip);
  fireEvent.blur(chip);
  const popover = await screen.findByRole('dialog', {
    name: 'manage_calendar_accounts',
  });
  fireEvent.keyDown(popover, { key: 'Escape' });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'manage_calendar_accounts' })
    ).toHaveFocus()
  );
});
