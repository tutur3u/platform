import { sameWindow, targetKey } from './attribution';
import type { CostScope, CostTarget } from './contracts';
import type { CostReport } from './reconciliation';

export interface CostDenominator {
  readonly scope: Omit<CostScope, 'currency'>;
  readonly target: CostTarget;
  readonly sourceRef: string;
  readonly unit: string;
  readonly quantity: bigint;
  readonly coverage: 'complete' | 'partial';
}

export type AttributedUnitCost =
  | {
      readonly kind: 'unavailable';
      readonly reason:
        | 'incomplete-cost'
        | 'unbalanced-statements'
        | 'mismatched-denominator'
        | 'incomplete-denominator'
        | 'no-attributed-cost';
    }
  | {
      readonly kind: 'available';
      readonly currency: string;
      readonly numeratorMinor: bigint;
      readonly numeratorSourceRef: string;
      readonly numeratorLines: readonly {
        readonly statementId: string;
        readonly lineId: string;
        readonly amountMinor: bigint;
      }[];
      readonly denominator: CostDenominator;
    };

export function attributedUnitCost(
  report: CostReport,
  denominator: CostDenominator
): AttributedUnitCost {
  const { posted, scope } = report;
  if (posted.kind !== 'complete') {
    return { kind: 'unavailable', reason: 'incomplete-cost' };
  }
  if (!posted.data.balanced) {
    return { kind: 'unavailable', reason: 'unbalanced-statements' };
  }
  if (
    scope.provider !== denominator.scope.provider ||
    scope.accountId !== denominator.scope.accountId ||
    !sameWindow(scope.window, denominator.scope.window)
  ) {
    return { kind: 'unavailable', reason: 'mismatched-denominator' };
  }
  if (
    denominator.coverage !== 'complete' ||
    denominator.quantity <= 0n ||
    !denominator.unit ||
    !denominator.sourceRef
  ) {
    return { kind: 'unavailable', reason: 'incomplete-denominator' };
  }

  const key = targetKey(denominator.target);
  const numeratorLines = posted.data.statements.flatMap(({ lines }) =>
    lines.flatMap(({ line, allocations }) =>
      allocations
        .filter(
          (allocation) =>
            'target' in allocation && targetKey(allocation.target) === key
        )
        .map(({ amountMinor }) => ({
          statementId: line.statementId,
          lineId: line.id,
          amountMinor,
        }))
    )
  );
  if (numeratorLines.length === 0) {
    return { kind: 'unavailable', reason: 'no-attributed-cost' };
  }

  return {
    kind: 'available',
    currency: scope.currency,
    numeratorMinor: numeratorLines.reduce(
      (sum, line) => sum + line.amountMinor,
      0n
    ),
    numeratorSourceRef: posted.sourceRef,
    numeratorLines,
    denominator,
  };
}
