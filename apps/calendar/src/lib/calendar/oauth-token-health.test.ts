import { afterEach, expect, it, vi } from 'vitest';
import {
  recordCalendarTokenOutcome,
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
