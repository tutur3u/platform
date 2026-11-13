import { describe, expect, it } from 'vitest';
import {
  type CalendarAccountSyncInput,
  calendarAccountStatusLabelKey,
  deriveCalendarAccountSyncState,
} from './calendar-account-status';
import type { CalendarSyncStatus } from './calendar-sync-status';

const healthy: CalendarSyncStatus = {
  kind: 'healthy',
  lastSuccessAt: '2026-11-13T22:20:00Z',
};

function input(
  overrides: Partial<CalendarAccountSyncInput> = {}
): CalendarAccountSyncInput {
  return {
    accountId: 'account-1',
    calendars: [{ is_enabled: true }],
    quarantined: false,
    syncStatus: healthy,
    ...overrides,
  };
}

describe('deriveCalendarAccountSyncState', () => {
  it.each<[string, Partial<CalendarAccountSyncInput>, string]>([
    ['a healthy account', {}, 'connected'],
    [
      'a running sync',
      {
        syncStatus: {
          kind: 'syncing',
          failedCalendars: [],
          lastSuccessAt: null,
        },
      },
      'syncing',
    ],
    [
      'a provider credential rejection',
      { providerState: 'reconnect_required' },
      'attention',
    ],
    ['a quarantined account', { quarantined: true }, 'attention'],
    [
      'a temporarily unavailable provider',
      { providerState: 'temporarily_unavailable' },
      'attention',
    ],
    [
      'an account with every calendar hidden',
      { calendars: [{ is_enabled: false }] },
      'paused',
    ],
    [
      'paused sync overall',
      { syncStatus: { kind: 'paused', lastSuccessAt: null } },
      'paused',
    ],
    ['an account with no calendars yet', { calendars: [] }, 'connected'],
  ])('maps %s', (_, overrides, kind) => {
    expect(deriveCalendarAccountSyncState(input(overrides)).kind).toBe(kind);
  });

  it('marks the account named by an attention status', () => {
    const state = deriveCalendarAccountSyncState(
      input({
        syncStatus: {
          kind: 'attention',
          reason: 'auth',
          accounts: [
            {
              id: 'account-1',
              provider: 'google',
              account_email: 'a@example.com',
              account_name: null,
            },
          ],
          failedCalendars: [],
          lastSuccessAt: null,
          syncing: true,
        },
      })
    );
    expect(state).toEqual({ kind: 'attention', reason: 'reconnect_required' });
  });

  it('keeps needing action visible while a sync runs', () => {
    const state = deriveCalendarAccountSyncState(
      input({
        providerState: 'reconnect_required',
        syncStatus: {
          kind: 'syncing',
          failedCalendars: [],
          lastSuccessAt: null,
        },
      })
    );
    expect(state.kind).toBe('attention');
  });

  it('has a label for every state', () => {
    expect(calendarAccountStatusLabelKey({ kind: 'connected' })).toBe(
      'account_status_connected'
    );
    expect(calendarAccountStatusLabelKey({ kind: 'syncing' })).toBe(
      'account_status_syncing'
    );
    expect(
      calendarAccountStatusLabelKey({
        kind: 'attention',
        reason: 'provider_unavailable',
      })
    ).toBe('account_status_attention');
    expect(calendarAccountStatusLabelKey({ kind: 'paused' })).toBe(
      'account_status_paused'
    );
  });
});
