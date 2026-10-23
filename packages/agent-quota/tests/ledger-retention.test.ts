import { expect, it } from 'vitest';
import { emptyLedger } from '../src/hook-ledger';
import {
  isReservationActive,
  pruneLedger,
  RESERVATION_TTL,
} from '../src/ledger-retention';
import { validLedger } from '../src/ledger-validation';

const now = new Date('2026-10-23T08:00:00.000Z');

it('rejects far-future observations and reservation expiries beyond their TTL', () => {
  const ledger = emptyLedger();
  ledger.observations.push({
    eventId: 'future',
    instanceId: 'claude_hehe',
    accountKey: 'claude:hehe',
    outcome: 'usage-limit',
    observedAt: new Date(now.getTime() + 30 * 86400_000).toISOString(),
  });
  expect(validLedger(ledger, now)).toBe(false);

  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL + 60_000);
  const reservationLedger = emptyLedger();
  reservationLedger.reservations.push({
    requestId: 'reservation',
    threadId: 'owner',
    instanceId: 'claude_hehe',
    accountKey: 'claude:hehe',
    model: 'claude-opus-4-6',
    createdAt,
    expiresAt: expiresAt.toISOString(),
  });
  expect(validLedger(reservationLedger, now)).toBe(false);

  pruneLedger(reservationLedger, now);
  expect(reservationLedger.reservations[0]?.expiresAt).toBe(
    new Date(now.getTime() + RESERVATION_TTL).toISOString()
  );
  expect(
    isReservationActive(
      reservationLedger.reservations[0]!,
      new Date(now.getTime() + RESERVATION_TTL + 1)
    )
  ).toBe(false);
});

it('honors a provisional reservation expiry sooner than the default TTL', () => {
  const reservation = {
    requestId: 'provisional',
    threadId: 'owner',
    instanceId: 'codex',
    accountKey: 'codex:codex',
    model: 'gpt-6.1-sol',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
  };
  expect(
    isReservationActive(reservation, new Date(now.getTime() + 4 * 60_000))
  ).toBe(true);
  expect(
    isReservationActive(reservation, new Date(now.getTime() + 5 * 60_000))
  ).toBe(false);
});
