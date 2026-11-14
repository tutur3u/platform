import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  type CalendarListAttentionAction,
  CalendarListFooter,
} from './calendar-list-footer';
import type {
  CalendarSyncStatus,
  CalendarSyncStatusKind,
} from './calendar-sync-status';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
  useFormatter: () => ({ relativeTime: () => '2 minutes ago' }),
}));

const account = {
  id: 'account-1',
  provider: 'google',
  account_email: 'a@example.com',
  account_name: null,
};

/** A Record over every kind, so a new kind fails to compile until listed. */
const STATUSES: Record<CalendarSyncStatusKind, CalendarSyncStatus> = {
  loading: { kind: 'loading' },
  disconnected: { kind: 'disconnected' },
  syncing: { kind: 'syncing', failedCalendars: [], lastSuccessAt: null },
  healthy: { kind: 'healthy', lastSuccessAt: '2026-11-13T22:20:00Z' },
  paused: { kind: 'paused', lastSuccessAt: null },
  attention: {
    kind: 'attention',
    reason: 'reconnect_required',
    accounts: [account],
    failedCalendars: [],
    lastSuccessAt: null,
    syncing: false,
  },
  status_error: {
    kind: 'status_error',
    accounts: [],
    failedCalendars: [],
    lastSuccessAt: null,
    syncing: false,
  },
};

const EXPECTED_TEXT: Record<CalendarSyncStatusKind, string | null> = {
  loading: 'checking_sync',
  disconnected: null,
  syncing: 'syncing',
  healthy: 'synced_at:2 minutes ago',
  paused: 'sync_paused',
  attention: 'attention_reconnect_account:a@example.com',
  status_error: 'status_error',
};

function renderFooter(
  status: CalendarSyncStatus,
  attentionAction: CalendarListAttentionAction = { kind: 'retry' }
) {
  const props = {
    attentionAction,
    manualSyncDisabled: false,
    onAttentionAction: vi.fn(),
    onRetryStatus: vi.fn(),
    onSync: vi.fn(),
    status,
  };
  const view = render(<CalendarListFooter {...props} />);
  return { ...view, props };
}

describe('CalendarListFooter', () => {
  it.each(Object.keys(STATUSES) as CalendarSyncStatusKind[])(
    'renders one line for %s',
    (kind) => {
      const { container } = renderFooter(STATUSES[kind]);
      const expected = EXPECTED_TEXT[kind];
      if (expected === null) {
        expect(container).toBeEmptyDOMElement();
        return;
      }
      const line = screen.getByRole('status');
      expect(line.textContent).toContain(expected);
      expect(screen.getAllByRole('status')).toHaveLength(1);
    }
  );

  it('never shows status-error copy while loading', () => {
    renderFooter(STATUSES.loading);
    expect(screen.queryByText('status_error')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a sync button when healthy', () => {
    const { props } = renderFooter(STATUSES.healthy);
    fireEvent.click(screen.getByRole('button', { name: 'sync_now' }));
    expect(props.onSync).toHaveBeenCalledTimes(1);
  });

  it('says "Synced" without a time when no success is recorded', () => {
    renderFooter({ kind: 'healthy', lastSuccessAt: null });
    expect(screen.getByRole('status').textContent).toBe('synced');
  });

  it.each<CalendarListAttentionAction>([
    { kind: 'reconnect', provider: 'google' },
    { kind: 'retry' },
  ])('shows exactly one attention action ($kind)', (action) => {
    const { props } = renderFooter(STATUSES.attention, action);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe(
      action.kind === 'reconnect' ? 'reconnect' : 'retry'
    );
    fireEvent.click(buttons[0]!);
    expect(props.onAttentionAction).toHaveBeenCalledWith(action);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names a short reason when no account is named', () => {
    renderFooter({
      kind: 'attention',
      reason: 'sync_stalled',
      accounts: [],
      failedCalendars: [],
      lastSuccessAt: null,
      syncing: false,
    });
    expect(screen.getByRole('status').textContent).toContain(
      'attention_stalled'
    );
  });

  it('retries the status request after a failed check', () => {
    const { props } = renderFooter(STATUSES.status_error);
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(props.onRetryStatus).toHaveBeenCalledTimes(1);
    expect(props.onSync).not.toHaveBeenCalled();
  });
});
