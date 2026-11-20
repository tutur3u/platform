import { describe, expect, it } from 'vitest';
import type {
  CostAssignment,
  CostEvidence,
  CostScope,
  CostStatement,
  PostedCostLine,
} from './contracts';
import { parseMinorUnits, reconcileCosts } from './reconciliation';
import { attributedUnitCost, type CostDenominator } from './unit-cost';

const scope: CostScope = {
  provider: 'vercel',
  accountId: 'team-example',
  currency: 'USD',
  window: { start: '2026-10-01', endExclusive: '2026-11-01' },
};
const app = { kind: 'app', id: 'calendar' } satisfies CostDenominator['target'];
const workspace = {
  kind: 'workspace',
  id: 'calendar',
} satisfies CostDenominator['target'];
const invoice: CostStatement = {
  id: 'invoice-1',
  kind: 'invoice',
  postedOn: '2026-10-31',
  totalMinor: 100n,
};
const direct = { kind: 'direct', target: app } satisfies CostAssignment;
const weighted: CostAssignment = {
  kind: 'weighted',
  basis: {
    sourceRef: 'usage:cpu:oct',
    unit: 'cpu-ms',
    window: scope.window,
    weights: [
      { target: workspace, quantity: 1n },
      { target: app, quantity: 1n },
    ],
  },
};
const denominator: CostDenominator = {
  scope,
  target: app,
  sourceRef: 'usage:jobs:oct',
  unit: 'completed jobs',
  quantity: 3n,
  coverage: 'complete',
};

function line(
  id: string,
  amountMinor: bigint,
  assignment: CostAssignment = direct,
  statementId = invoice.id
): PostedCostLine {
  return {
    statementId,
    id,
    amountMinor,
    assignment,
    category: amountMinor < 0n ? 'credit' : 'charge',
  };
}

function evidence(
  lines: readonly PostedCostLine[],
  statements: readonly CostStatement[] = [invoice]
) {
  return {
    posted: {
      kind: 'complete',
      scope,
      sourceRef: 'invoices:oct',
      asOf: '2026-11-03T00:00:00Z',
      data: { statements, lines },
    },
    estimated: { kind: 'unavailable', reason: 'No estimate imported' },
  } satisfies CostEvidence;
}

describe('exact minor units', () => {
  it('preserves large amounts, credits and different currency scales', () => {
    expect(parseMinorUnits('9007199254740993.01', 2)).toBe(900719925474099301n);
    expect(parseMinorUnits('-12.3', 2)).toBe(-1230n);
    expect(parseMinorUnits('100.00', 0)).toBe(100n);
    expect(parseMinorUnits('1.001', 3)).toBe(1001n);
  });

  it('rejects lossy conversion and exponent notation', () => {
    expect(() => parseMinorUnits('0.001', 2)).toThrow('fractional minor units');
    expect(() => parseMinorUnits('1e2', 2)).toThrow('decimal string');
    expect(() => parseMinorUnits('1\n', 2)).toThrow('decimal string');
  });
});

describe('reconcileCosts', () => {
  it('keeps actuals, overlapping estimates, and unknown coverage distinct', () => {
    const duplicate = line('runtime', 100n);
    const estimate = {
      id: 'runtime',
      amountMinor: 105n,
      evidenceRef: 'focus:day',
    };
    const report = reconcileCosts(scope, {
      ...evidence([duplicate, { ...duplicate }], [invoice, { ...invoice }]),
      estimated: {
        kind: 'partial',
        scope,
        sourceRef: 'focus:oct',
        asOf: '2026-11-01T00:00:00Z',
        reason: 'One day of usage still pending',
        data: {
          basis: { kind: 'provider-rated' },
          lines: [estimate, estimate],
        },
      },
    });

    expect(report.posted).toMatchObject({
      kind: 'complete',
      data: {
        balanced: true,
        statementTotalMinor: 100n,
        attributedMinor: 100n,
      },
    });
    if (report.posted.kind === 'complete') {
      expect(report.posted.data.statements).toHaveLength(1);
      expect(report.posted.data.statements[0]?.lines).toHaveLength(1);
    }
    expect(report.estimated).toMatchObject({
      kind: 'partial',
      data: { observedTotalMinor: 105n, lines: [estimate] },
    });
  });

  it('traces direct, shared, unmapped, and signed weighted costs', () => {
    const report = reconcileCosts(
      scope,
      evidence([
        line('compute', 98n),
        line('credit', -3n, weighted),
        line('plan', 3n, { kind: 'shared', reason: 'Organization plan' }),
        line('tax', 2n, { kind: 'unallocated', reason: 'Unmapped tax' }),
      ])
    );
    expect(report.posted).toMatchObject({
      data: {
        balanced: true,
        statementTotalMinor: 100n,
        attributedMinor: 95n,
        sharedMinor: 3n,
        unallocatedMinor: 2n,
      },
    });
    expect(attributedUnitCost(report, denominator)).toMatchObject({
      kind: 'available',
      currency: 'USD',
      numeratorMinor: 96n,
      numeratorSourceRef: 'invoices:oct',
      numeratorLines: [
        { statementId: invoice.id, lineId: 'compute', amountMinor: 98n },
        { statementId: invoice.id, lineId: 'credit', amountMinor: -2n },
      ],
      denominator,
    });
    expect(
      attributedUnitCost(report, { ...denominator, target: workspace })
    ).toMatchObject({
      kind: 'available',
      numeratorMinor: -1n,
    });
  });

  it('retains both invoice discrepancies when they cancel in aggregate', () => {
    const other = { ...invoice, id: 'invoice-2' };
    const report = reconcileCosts(
      scope,
      evidence(
        [line('runtime', 90n), line('runtime', 110n, direct, other.id)],
        [invoice, other]
      )
    );
    expect(report.posted).toMatchObject({
      data: {
        balanced: false,
        statementTotalMinor: 200n,
        unallocatedMinor: 0n,
        statements: [
          { unmatchedMinor: 10n, lineTotalMinor: 90n },
          { unmatchedMinor: -10n, lineTotalMinor: 110n },
        ],
      },
    });
    expect(attributedUnitCost(report, denominator)).toEqual({
      kind: 'unavailable',
      reason: 'unbalanced-statements',
    });
  });

  it('keeps an estimate available when no posted evidence exists', () => {
    const report = reconcileCosts(scope, {
      posted: { kind: 'unavailable', reason: 'Invoice has not been issued' },
      estimated: {
        kind: 'complete',
        scope,
        sourceRef: 'model:oct',
        asOf: '2026-10-31T00:00:00Z',
        data: {
          basis: { kind: 'rate-model', rateSnapshotRef: 'rates:v1' },
          lines: [
            { id: 'runtime', amountMinor: 100n, evidenceRef: 'usage:oct' },
          ],
        },
      },
    });
    expect(report.estimated).toMatchObject({
      data: { observedTotalMinor: 100n },
    });
    expect(report.posted).toEqual({
      kind: 'unavailable',
      reason: 'Invoice has not been issued',
    });
    expect(attributedUnitCost(report, denominator)).toMatchObject({
      reason: 'incomplete-cost',
    });
  });

  it('allocates uneven weights exactly and deduplicates reordered weights', () => {
    const basis = {
      sourceRef: 'usage:requests:oct',
      unit: 'requests',
      window: scope.window,
    };
    const report = reconcileCosts(
      scope,
      evidence(
        [
          line('requests', 7n, {
            kind: 'weighted',
            basis: {
              ...basis,
              weights: [
                { target: app, quantity: 1n },
                { target: workspace, quantity: 2n },
              ],
            },
          }),
          line('requests', 7n, {
            kind: 'weighted',
            basis: {
              ...basis,
              weights: [
                { target: workspace, quantity: 2n },
                { target: app, quantity: 1n },
              ],
            },
          }),
        ],
        [{ ...invoice, totalMinor: 7n }]
      )
    );
    expect(report.posted).toMatchObject({
      data: {
        balanced: true,
        attributedMinor: 7n,
        statements: [
          {
            lines: [
              {
                allocations: [
                  { target: app, amountMinor: 2n, weight: 1n, totalWeight: 3n },
                  {
                    target: workspace,
                    amountMinor: 5n,
                    weight: 2n,
                    totalWeight: 3n,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it('preserves the stated total and reports a missing detail as unallocated', () => {
    const input = evidence([]);
    const report = reconcileCosts(scope, {
      ...input,
      posted: { ...input.posted, kind: 'partial', reason: 'Missing detail' },
    });
    expect(report.posted).toMatchObject({
      kind: 'partial',
      data: {
        statementTotalMinor: 100n,
        unallocatedMinor: 100n,
        balanced: false,
      },
    });
    expect(attributedUnitCost(report, denominator)).toMatchObject({
      reason: 'incomplete-cost',
    });
  });

  it('rejects conflicting duplicates and cross-scope evidence', () => {
    expect(() =>
      reconcileCosts(
        scope,
        evidence([line('runtime', 100n), line('runtime', 90n)])
      )
    ).toThrow('Conflicting cost evidence');
    const input = evidence([]);
    expect(() =>
      reconcileCosts(scope, {
        ...input,
        posted: { ...input.posted, scope: { ...scope, currency: 'EUR' } },
      })
    ).toThrow('does not match');
    expect(() =>
      reconcileCosts(scope, evidence([line('runtime', 100n)], []))
    ).toThrow('eligible statement');
  });

  it('accepts only fee movements and fee statements for Polar', () => {
    const polarScope = { ...scope, provider: 'polar' } satisfies CostScope;
    const feeStatement = {
      ...invoice,
      kind: 'fee-statement',
    } satisfies CostStatement;
    const input = evidence([line('fee', 100n)], [feeStatement]);
    const posted = { ...input.posted, scope: polarScope };
    expect(() => reconcileCosts(polarScope, { ...input, posted })).toThrow(
      'eligible statement'
    );
    expect(
      reconcileCosts(polarScope, {
        ...input,
        posted: {
          ...posted,
          data: {
            statements: [feeStatement],
            lines: [{ ...line('fee', 100n), category: 'fee' }],
          },
        },
      }).posted
    ).toMatchObject({ data: { statementTotalMinor: 100n, balanced: true } });
  });

  it('rejects duplicate targets and allocation weights from another window', () => {
    if (weighted.kind !== 'weighted')
      throw new Error('Expected weighted fixture');
    const { basis } = weighted;
    expect(() =>
      reconcileCosts(
        scope,
        evidence([
          line('runtime', 100n, {
            kind: 'weighted',
            basis: { ...basis, weights: [basis.weights[0], basis.weights[0]] },
          }),
        ])
      )
    ).toThrow('unique targets');
    expect(() =>
      reconcileCosts(
        scope,
        evidence([
          line('runtime', 100n, {
            kind: 'weighted',
            basis: {
              ...basis,
              window: { ...scope.window, start: '2026-10-02' },
            },
          }),
        ])
      )
    ).toThrow('report window');
  });
});

describe('attributedUnitCost', () => {
  it('requires positive, complete and period-matched denominators', () => {
    const report = reconcileCosts(scope, evidence([line('runtime', 100n)]));
    for (const invalid of [
      { ...denominator, quantity: 0n },
      { ...denominator, coverage: 'partial' } satisfies CostDenominator,
      { ...denominator, sourceRef: '' },
    ]) {
      expect(attributedUnitCost(report, invalid)).toMatchObject({
        reason: 'incomplete-denominator',
      });
    }
    expect(
      attributedUnitCost(report, {
        ...denominator,
        scope: {
          ...scope,
          window: { ...scope.window, endExclusive: '2026-11-02' },
        },
      })
    ).toMatchObject({ reason: 'mismatched-denominator' });
  });

  it('distinguishes a recorded zero from a target without cost evidence', () => {
    const report = reconcileCosts(
      scope,
      evidence([line('covered', 0n)], [{ ...invoice, totalMinor: 0n }])
    );
    expect(attributedUnitCost(report, denominator)).toMatchObject({
      kind: 'available',
      numeratorMinor: 0n,
    });
    expect(
      attributedUnitCost(report, { ...denominator, target: workspace })
    ).toMatchObject({
      reason: 'no-attributed-cost',
    });
  });
});
