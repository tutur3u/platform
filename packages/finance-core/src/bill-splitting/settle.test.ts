import { describe, expect, it } from 'vitest';
import { planSettlement, type SettlementTransfer } from './settle';

const ids = ['a', 'b', 'c', 'd'];
const pairs = ids.flatMap((from, fromIndex) =>
  ids.flatMap((to, toIndex) =>
    from === to ? [] : [{ from, to, fromIndex, toIndex }]
  )
);

function recordPayment(
  balances: number[],
  { from, to, amountMinor }: SettlementTransfer
) {
  balances[ids.indexOf(from)]! += amountMinor;
  balances[ids.indexOf(to)]! -= amountMinor;
}

// Enumerate every integer amount on each residual edge independently.
function bruteForce(opening: number[], required: SettlementTransfer[]) {
  const residual = opening.slice();
  for (const transfer of required) recordPayment(residual, transfer);
  const candidatePairs = pairs.filter(
    ({ fromIndex, toIndex }) =>
      residual[fromIndex]! < 0 && residual[toIndex]! > 0
  );
  const reserved = new Set(required.map(({ from, to }) => from + to));

  function visit(index: number): number {
    if (index === candidatePairs.length) {
      return residual.every((balance) => balance === 0) ? 0 : Infinity;
    }

    const { from, to, fromIndex, toIndex } = candidatePairs[index]!;
    const limit = Math.min(-residual[fromIndex]!, residual[toIndex]!);
    let best = Infinity;
    for (let amountMinor = 0; amountMinor <= limit; amountMinor++) {
      recordPayment(residual, { from, to, amountMinor });
      const cost = amountMinor > 0 && !reserved.has(from + to) ? 1 : 0;
      best = Math.min(best, cost + visit(index + 1));
      recordPayment(residual, { from, to, amountMinor: -amountMinor });
    }
    return best;
  }

  return reserved.size + visit(0);
}

describe('settlement', () => {
  it('conserves money and minimizes pair count for exhaustive small ledgers with direct and partially confirmed amounts', () => {
    const cases: {
      direct: SettlementTransfer[];
      confirmed: SettlementTransfer[];
      required: SettlementTransfer[];
    }[] = [
      { direct: [], confirmed: [], required: [] },
      {
        direct: [{ from: 'a', to: 'c', amountMinor: 2 }],
        confirmed: [{ from: 'a', to: 'c', amountMinor: 1 }],
        required: [{ from: 'a', to: 'c', amountMinor: 1 }],
      },
      {
        direct: [
          { from: 'd', to: 'b', amountMinor: 1 },
          { from: 'a', to: 'c', amountMinor: 2 },
        ],
        confirmed: [
          { from: 'd', to: 'a', amountMinor: 1 },
          { from: 'a', to: 'c', amountMinor: 3 },
        ],
        required: [{ from: 'd', to: 'b', amountMinor: 1 }],
      },
    ];
    for (let a = -3; a <= 3; a++) {
      for (let b = -3; b <= 3; b++) {
        for (let c = -3; c <= 3; c++) {
          const opening = [a, b, c, -a - b - c];
          const balances = ids.map((participantId, index) => ({
            participantId,
            amountMinor: opening[index]!,
          }));

          for (const { direct, confirmed, required } of cases) {
            const plan = planSettlement({ balances, direct, confirmed });
            const unpaid = opening.slice();
            for (const payment of confirmed) recordPayment(unpaid, payment);
            const context = JSON.stringify({ balances, direct, confirmed });
            expect(plan.optimal, context).toBe(true);
            expect(plan.transfers.length, context).toBe(
              bruteForce(unpaid, required)
            );
            for (const requirement of required) {
              const transfer = plan.transfers.find(
                ({ from, to }) =>
                  from === requirement.from && to === requirement.to
              );
              expect(transfer?.amountMinor, context).toBeGreaterThanOrEqual(
                requirement.amountMinor
              );
            }
            const pairKeys = new Set<string>();
            for (const transfer of plan.transfers) {
              pairKeys.add(transfer.from + transfer.to);
              expect(transfer.amountMinor, context).toBeGreaterThan(0);
              recordPayment(unpaid, transfer);
            }
            expect(pairKeys.size, context).toBe(plan.transfers.length);
            expect(
              unpaid.every((balance) => balance === 0),
              context
            ).toBe(true);
          }
        }
      }
    }
  });

  it('avoids an extra transfer when input order would split a payment', () => {
    expect(
      planSettlement({
        balances: [
          { participantId: 'a', amountMinor: -1 },
          { participantId: 'b', amountMinor: -2 },
          { participantId: 'c', amountMinor: 2 },
          { participantId: 'd', amountMinor: 1 },
        ],
      })
    ).toEqual({
      optimal: true,
      transfers: [
        { from: 'a', to: 'd', amountMinor: 1 },
        { from: 'b', to: 'c', amountMinor: 2 },
      ],
    });
  });

  it('returns a balanced suggestion when too many endpoints need exact search', () => {
    const balances = Array.from({ length: 14 }, (_, index) => ({
      participantId: String(index),
      amountMinor: index < 7 ? -2 : 2,
    }));
    const plan = planSettlement({
      balances,
      direct: [{ from: '0', to: '13', amountMinor: 1 }],
    });
    expect(plan.optimal).toBe(false);
    expect(
      plan.transfers.find(({ from, to }) => from === '0' && to === '13')
        ?.amountMinor
    ).toBeGreaterThanOrEqual(1);
    for (const balance of balances) {
      const sent = plan.transfers.filter(
        ({ from }) => from === balance.participantId
      );
      const received = plan.transfers.filter(
        ({ to }) => to === balance.participantId
      );
      expect(
        balance.amountMinor +
          sent.reduce((sum, transfer) => sum + transfer.amountMinor, 0) -
          received.reduce((sum, transfer) => sum + transfer.amountMinor, 0)
      ).toBe(0);
    }
  });

  it('rejects unbalanced, fractional and unauthorized transfers', () => {
    expect(() =>
      planSettlement({ balances: [{ participantId: 'a', amountMinor: 1 }] })
    ).toThrow();
    expect(() =>
      planSettlement({ balances: [{ participantId: 'a', amountMinor: 0.1 }] })
    ).toThrow();
    expect(() =>
      planSettlement({
        balances: [{ participantId: 'a', amountMinor: 0 }],
        confirmed: [{ from: 'a', to: 'missing', amountMinor: 1 }],
      })
    ).toThrow();
  });
});
