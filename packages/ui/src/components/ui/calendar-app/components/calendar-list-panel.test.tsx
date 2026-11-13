import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_DIALOG_OPEN_INTENT_EVENT } from '../../../../hooks/settings-dialog-url';
import {
  CalendarListPanel,
  type CalendarListPanelState,
} from './calendar-list-panel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
  useFormatter: () => ({ relativeTime: () => '2 minutes ago' }),
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

// Radix popper content measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const mutation = () => ({ mutate: vi.fn(), isPending: false });

const account = {
  id: 'account-1',
  provider: 'google' as const,
  account_email: 'a@example.com',
  account_name: null,
  is_active: true,
  created_at: '2026-11-01T00:00:00Z',
  expires_at: null,
};

const holidays = {
  id: 'connection-holidays',
  accessRole: 'reader',
  accountId: 'account-1',
  calendar_id: 'holidays@example.com',
  calendar_name: 'Holidays',
  color: 'GREEN',
  connectionExists: true,
  is_enabled: false,
};

function panelState(
  overrides: Partial<Record<keyof CalendarListPanelState, unknown>> = {}
) {
  return {
    accounts: [account],
    calendarsByAccount: { [account.id]: [holidays] },
    disconnectMutation: mutation(),
    disconnectingId: null,
    getCalendarColor: () => 'currentColor',
    googleAuthMutation: mutation(),
    handleToggle: vi.fn(),
    isLoadingCalendars: false,
    manualSyncDisabled: false,
    microsoftAuthMutation: mutation(),
    needsReconnectAccounts: [],
    providerAccountStatuses: {},
    retrySyncStatus: vi.fn(),
    syncMutation: mutation(),
    syncStatus: { kind: 'healthy', lastSuccessAt: '2026-11-13T22:20:00Z' },
    togglingIds: new Set<string>(),
    togglingTuturuuuIds: new Set<string>(),
    toggleWorkspaceCalendarMutation: mutation(),
    workspaceCalendars: [
      {
        id: 'primary',
        name: 'Personal',
        color: 'BLUE',
        is_enabled: true,
        is_system: true,
      },
    ],
    ...overrides,
  } as unknown as CalendarListPanelState;
}

function captureSettingsIntents() {
  const intents: CustomEvent[] = [];
  const listener = (event: Event) => intents.push(event as CustomEvent);
  window.addEventListener(SETTINGS_DIALOG_OPEN_INTENT_EVENT, listener);
  return {
    intents,
    stop: () =>
      window.removeEventListener(SETTINGS_DIALOG_OPEN_INTENT_EVENT, listener),
  };
}

function openAccountMenu() {
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'account_actions:a@example.com' }),
    { key: 'Enter' }
  );
}

afterEach(() => cleanup());

describe('CalendarListPanel', () => {
  it('opens Settings at the calendar accounts tab from the gear', () => {
    const capture = captureSettingsIntents();
    render(<CalendarListPanel state={panelState()} />);
    fireEvent.click(screen.getByRole('button', { name: 'open_settings' }));
    capture.stop();
    expect(capture.intents).toHaveLength(1);
    expect(capture.intents[0]?.cancelable).toBe(true);
    expect(capture.intents[0]?.detail).toEqual({
      settingsTab: 'calendar_integrations',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the same settings tab from "Add account"', () => {
    const capture = captureSettingsIntents();
    render(<CalendarListPanel state={panelState()} />);
    fireEvent.click(screen.getByRole('button', { name: 'add_account' }));
    capture.stop();
    expect(capture.intents[0]?.detail).toEqual({
      settingsTab: 'calendar_integrations',
    });
  });

  it('keeps read-only calendars toggleable and explains them in a tooltip', () => {
    const state = panelState();
    render(<CalendarListPanel state={state} />);
    const row = screen.getByRole('button', { name: 'Holidays' });
    expect(row).toHaveAccessibleDescription('read_only');
    expect(row).toHaveAttribute('data-slot', 'tooltip-trigger');
    expect(row).not.toBeDisabled();
    fireEvent.click(row);
    expect(state.handleToggle).toHaveBeenCalledWith(
      'connection-holidays',
      false,
      expect.objectContaining({ calendar_id: 'holidays@example.com' })
    );
  });

  it('renders Tuturuuu and provider calendars with one toggle style', () => {
    const state = panelState();
    render(<CalendarListPanel state={state} />);
    const personal = screen.getByRole('button', { name: 'Personal' });
    const holidaysRow = screen.getByRole('button', { name: 'Holidays' });
    expect(personal).toHaveAttribute('aria-pressed', 'true');
    expect(holidaysRow).toHaveAttribute('aria-pressed', 'false');
    expect(personal.className).toContain('h-8');
    expect(holidaysRow.className).toContain('h-8');
    fireEvent.click(personal);
    expect(state.toggleWorkspaceCalendarMutation.mutate).toHaveBeenCalledWith({
      id: 'primary',
      is_enabled: false,
    });
  });

  it('labels the account status dot', () => {
    render(
      <CalendarListPanel
        state={panelState({
          providerAccountStatuses: {
            [account.id]: { state: 'reconnect_required' },
          },
        })}
      />
    );
    expect(
      screen.getByRole('img', { name: 'account_status_attention' })
    ).toBeInTheDocument();
  });

  it('asks for confirmation before disconnecting an account', () => {
    const state = panelState();
    render(<CalendarListPanel state={state} />);
    openAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'disconnect' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('disconnect_title:a@example.com');
    expect(state.disconnectMutation.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'disconnect' }));
    expect(state.disconnectMutation.mutate).toHaveBeenCalledWith(account.id);
  });

  it('does not disconnect when the confirmation is cancelled', () => {
    const state = panelState();
    render(<CalendarListPanel state={state} />);
    openAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'disconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(state.disconnectMutation.mutate).not.toHaveBeenCalled();
  });

  it('reconnects through the existing provider auth mutation', () => {
    const state = panelState();
    render(<CalendarListPanel state={state} />);
    openAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'reconnect' }));
    expect(state.googleAuthMutation.mutate).toHaveBeenCalledWith({
      reconnect: true,
    });
  });

  it('shows a fixed-geometry skeleton while calendars load', () => {
    render(
      <CalendarListPanel
        state={panelState({
          isLoadingCalendars: true,
          syncStatus: { kind: 'loading' },
        })}
      />
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Holidays' })).toBeNull();
    expect(screen.queryByText('status_error')).toBeNull();
  });

  it('shows one quiet empty line and "Add account" with no calendars', () => {
    render(
      <CalendarListPanel
        state={panelState({
          accounts: [],
          calendarsByAccount: {},
          syncStatus: { kind: 'disconnected' },
          workspaceCalendars: [],
        })}
      />
    );
    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'add_account' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lists a quarantined account so it can be reconnected', () => {
    const state = panelState({
      accounts: [],
      calendarsByAccount: {},
      needsReconnectAccounts: [
        {
          id: 'held',
          provider: 'microsoft',
          account_email: 'held@example.com',
          account_name: null,
          deactivated_reason: 'invalid_grant',
          deactivated_at: '2026-11-13T00:00:00Z',
        },
      ],
    });
    render(<CalendarListPanel state={state} />);
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'account_actions:held@example.com' }),
      { key: 'Enter' }
    );
    expect(screen.getByRole('menuitem', { name: 'sync_now' })).toHaveAttribute(
      'data-disabled'
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'reconnect' }));
    expect(state.microsoftAuthMutation.mutate).toHaveBeenCalledTimes(1);
  });
});
