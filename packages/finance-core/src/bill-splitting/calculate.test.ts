import { expect, it } from 'vitest';
import { calculateBillSplit } from './calculate';

it('combines non-attending payers and shares across expenses in one settlement currency', () => {
  const usd = { code: 'USD', minorDigits: 2 };
  const result = calculateBillSplit({
    participantIds: ['a', 'b', 'c'],
    currency: usd,
    expenses: [
      {
        currency: usd,
        attendeeIds: ['b', 'c'],
        lines: [
          {
            amountMinor: 400,
            allocation: { kind: 'equal', participantIds: ['b', 'c'] },
          },
        ],
        payments: [{ participantId: 'a', amountMinor: 400 }],
      },
      {
        currency: { code: 'VND', minorDigits: 0 },
        exchangeRate: { numerator: 1, denominator: 25000 },
        attendeeIds: ['a', 'c'],
        lines: [
          {
            amountMinor: 25000,
            allocation: { kind: 'equal', participantIds: ['a', 'c'] },
          },
        ],
        payments: [{ participantId: 'b', amountMinor: 25000 }],
      },
    ],
    direct: [{ from: 'c', to: 'a', amountMinor: 50 }],
    confirmed: [{ from: 'c', to: 'a', amountMinor: 25 }],
  });

  expect(result.totalMinor).toBe(500);
  expect(result.balances).toEqual([
    { participantId: 'a', amountMinor: 350 },
    { participantId: 'b', amountMinor: -100 },
    { participantId: 'c', amountMinor: -250 },
  ]);
  expect(result.settlement).toEqual({
    optimal: true,
    transfers: [
      { from: 'b', to: 'a', amountMinor: 100 },
      { from: 'c', to: 'a', amountMinor: 225 },
    ],
  });
});
