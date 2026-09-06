import { describe, expect, it } from 'vitest';
import { classifyCalendarSyncError } from '../sync-errors';
import { classifyCalendarSyncHealth } from '../sync-health';

const now = new Date('2026-09-06T12:00:00Z');
const accounts = [
  { provider: 'google' as const, expires_at: '2026-07-01T00:00:00Z' },
];
const success = {
  status: 'completed',
  start_time: '2026-09-06T11:50:00Z',
  end_time: '2026-09-06T11:51:00Z',
};
describe('calendar sync recovery', () => {
  it('does not blame automatically refreshed access-token expiry', () => {
    expect(
      classifyCalendarSyncHealth({ accounts, recentRuns: [success], now }).state
    ).toBe('healthy');
  });
  it('detects the live stuck-run case', () => {
    expect(
      classifyCalendarSyncHealth({
        accounts,
        recentRuns: [
          {
            status: 'running',
            start_time: '2026-07-20T07:09:42Z',
            end_time: null,
          },
        ],
        now,
      })
    ).toMatchObject({
      state: 'degraded',
      reason: 'sync_stalled',
      currentlyRunning: false,
      retryAfterSeconds: null,
    });
  });
  it('does not warn when the user has not enabled any calendars', () => {
    expect(
      classifyCalendarSyncHealth({
        accounts,
        recentRuns: [],
        hasEnabledConnections: false,
        now,
      }).state
    ).toBe('paused');
  });
  it('does not call an account with no successful sync healthy', () => {
    expect(
      classifyCalendarSyncHealth({ accounts, recentRuns: [], now }).reason
    ).toBe('not_synced');
  });
  it('detects stale data after missed scheduled runs', () => {
    expect(
      classifyCalendarSyncHealth({
        accounts,
        recentRuns: [{ ...success, end_time: '2026-09-06T10:00:00Z' }],
        now,
      }).reason
    ).toBe('sync_stale');
  });
  it('retains a reconnect warning for enabled calendars with an inactive account', () => {
    expect(
      classifyCalendarSyncHealth({
        accounts: [],
        recentRuns: [],
        hasOrphanedConnections: true,
        now,
      }).reason
    ).toBe('reconnect_required');
  });
  it('expires stored cooldown snapshots and sorts runs', () => {
    expect(
      classifyCalendarSyncHealth({
        accounts,
        recentRuns: [
          {
            status: 'failed',
            start_time: '2026-09-06T10:00:00Z',
            end_time: null,
            cooldown_remaining_seconds: 30,
          },
          success,
        ],
        now,
      })
    ).toMatchObject({ state: 'healthy', retryAfterSeconds: null });
  });
  it('bounds cooldown to the current attempt', () => {
    expect(
      classifyCalendarSyncHealth({
        accounts,
        recentRuns: [
          {
            status: 'failed',
            start_time: '2026-09-06T11:59:50Z',
            end_time: null,
          },
        ],
        now,
      }).retryAfterSeconds
    ).toBe(20);
  });
});
describe('provider error recovery', () => {
  it.each([
    [{ response: { status: 401 } }, 'auth'],
    [new Error('invalid_grant'), 'auth'],
    [new Error('invalid_request'), 'configuration'],
    [
      {
        response: {
          status: 403,
          data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
        },
      },
      'api_limit',
    ],
    [{ response: { status: 429 } }, 'api_limit'],
    [{ response: { status: 503 } }, 'network'],
    [new Error('ETIMEDOUT'), 'network'],
    [new Error('insufficient authentication scopes'), 'auth'],
    [new Error('unrecognized provider failure'), 'unknown'],
  ])('classifies %j as %s', (error, expected) =>
    expect(classifyCalendarSyncError(error)).toBe(expected)
  );
});
