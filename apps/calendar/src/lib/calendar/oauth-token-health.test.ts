import { afterEach, expect, it, vi } from 'vitest';
import {
  type CalendarTokenOutcomeEntry,
  recordCalendarTokenOutcome,
  reportCalendarDeactivationSpike,
  withCalendarTokenHealthRun,
} from './oauth-token-health';

afterEach(() => {
  vi.restoreAllMocks();
});

it('keeps one outcome per account: a later failure replaces an earlier ok', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { outcomes } = await withCalendarTokenHealthRun('/test', async () => {
    recordCalendarTokenOutcome({
      tokenId: 'token-a',
      provider: 'google',
      outcome: 'ok',
      attempts: 1,
      refreshed: true,
    });
    recordCalendarTokenOutcome({
      tokenId: 'token-b',
      provider: 'google',
      outcome: 'ok',
      attempts: 1,
    });
    recordCalendarTokenOutcome({
      tokenId: 'token-a',
      provider: 'google',
      outcome: 'deactivated',
      reason: 'google_invalid_grant',
      attempts: 1,
    });
  });
  expect(outcomes).toHaveLength(2);
  expect(outcomes[0]).toMatchObject({
    outcome: 'deactivated',
    reason: 'google_invalid_grant',
  });
  expect(outcomes[0]).not.toHaveProperty('refreshed');
  expect(outcomes[1]).toMatchObject({ outcome: 'ok' });
});

it('keeps single-account provider outages visible on the hourly due run without alerting every tick', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const one: CalendarTokenOutcomeEntry[] = [
    {
      account: '0000000000000001',
      provider: 'google',
      outcome: 'transient',
      attempts: 1,
    },
  ];
  const hour = Date.UTC(2026, 9, 26, 8);
  expect(reportCalendarDeactivationSpike('/cron', one, hour)).toBe(true);
  expect(
    reportCalendarDeactivationSpike('/cron', one, hour + 15 * 60_000)
  ).toBe(false);
  expect(
    reportCalendarDeactivationSpike('/cron', one, hour + 60 * 60_000)
  ).toBe(true);
  expect(
    reportCalendarDeactivationSpike(
      '/cron',
      [
        ...one,
        {
          account: '0000000000000002',
          provider: 'google',
          outcome: 'ok',
          attempts: 1,
        },
      ],
      hour
    )
  ).toBe(false);
  expect(error).toHaveBeenCalledTimes(2);
});
