import { expect, it } from 'vitest';
import { solveGuestWork } from '../lib/guest-event-work';
import {
  issueMeetGuestWork,
  redeemMeetGuestWork,
} from './guest-event-challenge';

const secret = 'test-event-signing-secret';
const now = 1_800_000_000_000;
const context = {
  meetingId: '7f2a528e-3bff-40ee-bfda-5b944ad03ed8',
  eventExpiresAt: now + 360_000,
  network: '203.0.113.4',
  displayName: 'An',
};

// The signed ticket is random, so the real nonce search varies in cost and
// has taken 16 seconds on a busy hosted CI shard.
it(
  'verifies real work and consumes the same signed ticket at most once',
  { timeout: 60_000 },
  async () => {
    const { ticket, difficulty, expiresAt } = issueMeetGuestWork(
      context,
      19,
      secret,
      now
    );
    expect(expiresAt).toBe(now + 120_000);
    const nonce = await solveGuestWork(ticket, difficulty);
    if (nonce === null) throw new Error('No work solution');
    const consumed = new Set<string>();
    const consume = async (id: string, ttlMs: number) => {
      expect(ttlMs).toBe(180_000);
      if (consumed.has(id)) return false;
      consumed.add(id);
      return true;
    };
    const results = await Promise.all(
      [1, 2].map(() =>
        redeemMeetGuestWork(
          context,
          { ticket, nonce },
          secret,
          consume,
          () => now
        )
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(consumed.size).toBe(1);
  }
);

it('rejects wrong settings, scope, expiry and signature before consuming', async () => {
  const { ticket, expiresAt } = issueMeetGuestWork(context, 22, secret, now);
  expect(expiresAt).toBe(now + 300_000);
  const consume = async () => {
    throw new Error('Invalid ticket was consumed');
  };
  for (const candidate of [
    { ...context, network: '203.0.113.5' },
    { ...context, displayName: 'Bình' },
    { ...context, eventExpiresAt: context.eventExpiresAt + 1 },
    { ...context, meetingId: '9f2a528e-3bff-40ee-bfda-5b944ad03ed8' },
  ]) {
    expect(
      await redeemMeetGuestWork(
        candidate,
        { ticket, nonce: 0 },
        secret,
        consume,
        () => now
      )
    ).toBeNull();
  }
  expect(
    await redeemMeetGuestWork(
      context,
      { ticket, nonce: 0 },
      secret,
      consume,
      () => expiresAt
    )
  ).toBeNull();
  expect(
    await redeemMeetGuestWork(
      context,
      { ticket: ticket + '.', nonce: 0 },
      secret,
      consume,
      () => now
    )
  ).toBeNull();
});
