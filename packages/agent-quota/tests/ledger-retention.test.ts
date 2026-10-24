import { expect, it } from 'vitest';
import { usageLimitReceiptActive } from '../src/failure-receipt';
import { emptyLedger } from '../src/hook-ledger';
import {
  isReservationActive,
  pruneLedger,
  RESERVATION_TTL,
} from '../src/ledger-retention';
import { validLedger } from '../src/ledger-validation';

const now = new Date('2026-10-23T08:00:00.000Z');

it('quarantines future observations individually and rejects reservation expiries beyond their TTL', () => {
  const ledger = emptyLedger();
  const futureAt = new Date(now.getTime() + 30 * 86400_000).toISOString();
  ledger.observations.push({
    eventId: 'future',
    instanceId: 'claude_hehe',
    accountKey: 'claude:hehe',
    outcome: 'usage-limit',
    observedAt: futureAt,
  });
  expect(validLedger(ledger)).toBe(true);
  expect(
    usageLimitReceiptActive(
      {
        observedAt: ledger.observations[0]!.observedAt,
        resetsAt: new Date(now.getTime() + 86400_000).toISOString(),
      },
      now
    )
  ).toBe(false);
  pruneLedger(ledger, now);
  expect(ledger.observations).toEqual([]);
  expect(ledger.futureQuarantines).toMatchObject({
    'claude:hehe': {
      quarantinedAt: now.toISOString(),
      latestReceiptAt: futureAt,
      models: [],
      accountWide: true,
    },
  });

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
  expect(validLedger(reservationLedger)).toBe(false);

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

it('expires a reservation created more than five minutes in the future and drops future pacing marks', () => {
  const future = new Date(now.getTime() + 86400_000).toISOString();
  const ledger = emptyLedger();
  ledger.reservations.push({
    requestId: 'future-reservation',
    threadId: 'owner',
    instanceId: 'codex',
    accountKey: 'codex:codex',
    model: 'gpt-6.1-sol',
    createdAt: future,
  });
  ledger.lastAdmissions = { codex: Date.parse(future) };
  expect(validLedger(ledger)).toBe(true);
  expect(isReservationActive(ledger.reservations[0]!, now)).toBe(false);
  pruneLedger(ledger, now);
  expect(ledger.reservations).toEqual([]);
  expect(ledger.lastAdmissions).toEqual({});
});

it('expires a quarantine after 30 days even when its receipt timestamp remains far ahead', () => {
  const ledger = emptyLedger();
  ledger.futureQuarantines = {
    'claude:hehe': {
      quarantinedAt: now.toISOString(),
      latestReceiptAt: new Date(now.getTime() + 31 * 86400_000).toISOString(),
      models: ['claude-opus-4-6'],
      accountWide: false,
    },
  };

  pruneLedger(ledger, new Date(now.getTime() + 30 * 86400_000 + 1));

  expect(ledger.futureQuarantines?.['claude:hehe']).toBeUndefined();
});
