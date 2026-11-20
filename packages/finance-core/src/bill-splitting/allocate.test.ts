import { describe, expect, it } from 'vitest';
import { allocateExpense, type Expense } from './allocate';

const usd = { code: 'USD', minorDigits: 2 };
const vnd = { code: 'VND', minorDigits: 0 };

function expense(amountMinor: number): Expense {
  return {
    currency: usd,
    settlementCurrency: usd,
    participantIds: ['a', 'b', 'c', 'd'],
    attendeeIds: ['a', 'b', 'c'],
    lines: [
      {
        amountMinor,
        allocation: { kind: 'equal', participantIds: ['b', 'a'] },
      },
    ],
    payments: [{ participantId: 'a', amountMinor }],
  };
}

describe('expense allocation', () => {
  it('applies attendance, item rules, adjustments and partial then full sponsorship', () => {
    const input: Expense = {
      ...expense(0),
      lines: [
        {
          amountMinor: 101,
          allocation: { kind: 'equal', participantIds: ['b', 'a'] },
        },
        {
          amountMinor: 100,
          allocation: {
            kind: 'percentage',
            shares: [
              { participantId: 'c', basisPoints: 7500 },
              { participantId: 'a', basisPoints: 2500 },
            ],
          },
        },
        {
          amountMinor: 40,
          allocation: {
            kind: 'exact',
            shares: [{ participantId: 'b', amountMinor: 40 }],
          },
        },
      ],
      adjustments: [
        { kind: 'tax', amountMinor: 24 },
        {
          kind: 'tip',
          amountMinor: 20,
          allocation: { kind: 'equal', participantIds: ['a', 'c'] },
        },
        {
          kind: 'discount',
          amountMinor: 10,
          allocation: { kind: 'equal', participantIds: ['b'] },
        },
      ],
      sponsorships: [
        {
          kind: 'partial',
          sponsorId: 'a',
          beneficiaryId: 'c',
          amountMinor: 20,
        },
        { kind: 'full', sponsorId: 'd', beneficiaryId: 'c' },
      ],
      payments: [
        { participantId: 'a', amountMinor: 175 },
        { participantId: 'd', amountMinor: 100 },
      ],
    };
    expect(allocateExpense(input)).toEqual({
      originalTotalMinor: 275,
      settlementTotalMinor: 275,
      originalShares: [
        { participantId: 'a', amountMinor: 114 },
        { participantId: 'b', amountMinor: 89 },
        { participantId: 'c', amountMinor: 0 },
        { participantId: 'd', amountMinor: 72 },
      ],
      shares: [
        { participantId: 'a', amountMinor: 114 },
        { participantId: 'b', amountMinor: 89 },
        { participantId: 'c', amountMinor: 0 },
        { participantId: 'd', amountMinor: 72 },
      ],
      credits: [
        { participantId: 'a', amountMinor: 175 },
        { participantId: 'd', amountMinor: 100 },
      ],
    });
  });

  it('independently reconciles payers and shares across amounts and rational rates', () => {
    for (let amountMinor = 1; amountMinor <= 30; amountMinor++) {
      for (let numerator = 1; numerator <= 9; numerator++) {
        const input: Expense = {
          ...expense(amountMinor),
          settlementCurrency: vnd,
          exchangeRate: { numerator: 2500 * numerator, denominator: 7 },
          payments: [
            { participantId: 'a', amountMinor: 1 },
            { participantId: 'd', amountMinor: amountMinor - 1 },
          ],
        };
        const result = allocateExpense(input);
        expect(result.settlementTotalMinor).toBe(
          Math.round((amountMinor * 25 * numerator) / 7)
        );
        expect(
          result.originalShares.reduce(
            (sum, share) => sum + share.amountMinor,
            0
          )
        ).toBe(amountMinor);
        for (const amounts of [result.shares, result.credits]) {
          expect(
            amounts.reduce((sum, share) => sum + share.amountMinor, 0)
          ).toBe(result.settlementTotalMinor);
        }
      }
    }
  });

  it('uses a stable ID order to allocate indivisible amounts', () => {
    expect(allocateExpense(expense(3)).shares).toEqual([
      { participantId: 'a', amountMinor: 2 },
      { participantId: 'b', amountMinor: 1 },
    ]);
  });

  it('rejects absent attendees, short exact totals, and invalid percentage totals', () => {
    for (const allocation of [
      { kind: 'equal', participantIds: ['d'] },
      { kind: 'exact', shares: [{ participantId: 'a', amountMinor: 1 }] },
      {
        kind: 'percentage',
        shares: [{ participantId: 'a', basisPoints: 9999 }],
      },
    ] as const) {
      expect(() =>
        allocateExpense({
          ...expense(3),
          lines: [{ amountMinor: 3, allocation }],
        })
      ).toThrow();
    }
  });

  it('rejects unfunded expenses, excessive discounts or sponsorship, and unpinned currencies', () => {
    const input = expense(3);
    expect(() => allocateExpense({ ...input, payments: [] })).toThrow();
    expect(() =>
      allocateExpense({
        ...input,
        adjustments: [{ kind: 'discount', amountMinor: 4 }],
      })
    ).toThrow();
    expect(() =>
      allocateExpense({
        ...input,
        sponsorships: [
          {
            kind: 'partial',
            sponsorId: 'b',
            beneficiaryId: 'a',
            amountMinor: 3,
          },
        ],
      })
    ).toThrow();
    expect(() =>
      allocateExpense({ ...input, settlementCurrency: vnd })
    ).toThrow();
  });
});
