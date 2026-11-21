import type { CostAssignment, CostTarget, ReportingWindow } from './contracts';

export type CostAllocation =
  | {
      readonly kind: 'direct';
      readonly target: CostTarget;
      readonly amountMinor: bigint;
    }
  | {
      readonly kind: 'weighted';
      readonly target: CostTarget;
      readonly amountMinor: bigint;
      readonly weight: bigint;
      readonly totalWeight: bigint;
    }
  | {
      readonly kind: 'shared' | 'unallocated';
      readonly reason: string;
      readonly amountMinor: bigint;
    };

export function targetKey(target: CostTarget): string {
  if (!target.id.trim()) throw new Error('Cost target requires an ID');
  return JSON.stringify([target.kind, target.id]);
}

export function compareKeys(left: string, right: string): number {
  if (left < right) return -1;
  return left === right ? 0 : 1;
}

export function sameWindow(
  left: ReportingWindow,
  right: ReportingWindow
): boolean {
  return left.start === right.start && left.endExclusive === right.endExclusive;
}

export function allocateCost(
  amountMinor: bigint,
  assignment: CostAssignment,
  window: ReportingWindow
): readonly CostAllocation[] {
  if (assignment.kind !== 'weighted') return [{ ...assignment, amountMinor }];

  const { basis } = assignment;
  if (!sameWindow(basis.window, window) || !basis.sourceRef || !basis.unit) {
    throw new Error(
      'Allocation requires sourced weights for the report window'
    );
  }

  const keys = new Set<string>();
  let totalWeight = 0n;
  for (const { target, quantity } of basis.weights) {
    const key = targetKey(target);
    if (keys.has(key) || quantity <= 0n) {
      throw new Error(
        'Allocation requires unique targets and positive weights'
      );
    }
    keys.add(key);
    totalWeight += quantity;
  }
  if (totalWeight === 0n)
    throw new Error('Allocation requires positive weights');

  const magnitude = amountMinor < 0n ? -amountMinor : amountMinor;
  const shares = basis.weights.map(({ target, quantity }) => {
    const product = magnitude * quantity;
    return {
      target,
      key: targetKey(target),
      weight: quantity,
      whole: product / totalWeight,
      remainder: product % totalWeight,
    };
  });
  let remaining =
    magnitude - shares.reduce((sum, share) => sum + share.whole, 0n);
  shares.sort((left, right) => {
    if (left.remainder === right.remainder)
      return compareKeys(left.key, right.key);
    return left.remainder > right.remainder ? -1 : 1;
  });

  // Allocate remaining minor units by largest remainder, with a stable tie break.
  for (const share of shares) {
    if (remaining === 0n) break;
    share.whole += 1n;
    remaining -= 1n;
  }

  return shares
    .sort((left, right) => compareKeys(left.key, right.key))
    .map(({ target, weight, whole }) => ({
      kind: 'weighted',
      target,
      weight,
      totalWeight,
      amountMinor: amountMinor < 0n ? -whole : whole,
    }));
}
