import { describe, expect, it } from 'vitest';
import { classifyCalendarSyncHealth } from '../sync-health';

describe('classifyCalendarSyncHealth', () => {
  it('returns disconnected when there are no accounts', () => {
    const result = classifyCalendarSyncHealth({
      accounts: [],
      recentRuns: [],
      now: new Date('2026-03-19T10:00:00.000Z'),
    });

    expect(result.state).toBe('disconnected');
    expect(result.reason).toBe('no_accounts');
  });

  it('returns syncing when a recent run is still running', () => {
    const result = classifyCalendarSyncHealth({
      accounts: [{ provider: 'google', expires_at: null }],
      recentRuns: [
        {
          status: 'running',
          start_time: '2026-03-19T09:58:00.000Z',
          end_time: null,
        },
      ],
      now: new Date('2026-03-19T10:00:00.000Z'),
    });

    expect(result.state).toBe('syncing');
    expect(result.currentlyRunning).toBe(true);
  });

  it('returns degraded when the latest run failed after the last success', () => {
    const result = classifyCalendarSyncHealth({
      accounts: [{ provider: 'google', expires_at: null }],
      recentRuns: [
        {
          status: 'failed',
          start_time: '2026-03-19T09:55:00.000Z',
          end_time: '2026-03-19T09:56:00.000Z',
          error_type: 'api_limit',
        },
        {
          status: 'success',
          start_time: '2026-03-19T09:40:00.000Z',
          end_time: '2026-03-19T09:41:00.000Z',
        },
      ],
      now: new Date('2026-03-19T10:00:00.000Z'),
    });

    expect(result.state).toBe('degraded');
    expect(result.reason).toBe('api_limit');
  });

  it('returns healthy when the latest success is newer than the last failure', () => {
    const result = classifyCalendarSyncHealth({
      accounts: [{ provider: 'google', expires_at: null }],
      recentRuns: [
        {
          status: 'success',
          start_time: '2026-03-19T09:55:00.000Z',
          end_time: '2026-03-19T09:56:00.000Z',
        },
        {
          status: 'failed',
          start_time: '2026-03-19T09:40:00.000Z',
          end_time: '2026-03-19T09:41:00.000Z',
          error_type: 'api_limit',
        },
      ],
      now: new Date('2026-03-19T10:00:00.000Z'),
    });

    expect(result.state).toBe('healthy');
    expect(result.reason).toBe('ok');
  });
});
