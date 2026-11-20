export function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function minorUnits(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Amounts must be safe integer minor units');
  }
  return BigInt(value);
}

export function unsigned(value: number): bigint {
  const amount = minorUnits(value);
  if (amount < 0n) throw new RangeError('Amount must be nonnegative');
  return amount;
}

export function checkedNumber(value: bigint): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError('Amount exceeds the safe integer range');
  }
  return amount;
}

export function sum(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

export function addAmount(
  values: Map<string, bigint>,
  participantId: string,
  amount: bigint
) {
  values.set(participantId, (values.get(participantId) ?? 0n) + amount);
}

export function distribute(
  amount: bigint,
  weights: ReadonlyMap<string, bigint>
): Map<string, bigint> {
  const totalWeight = sum(weights.values());
  if (totalWeight === 0n) {
    if (amount !== 0n)
      throw new RangeError('Allocation needs a positive weight');
    return new Map();
  }

  const shares = Array.from(weights, ([id, weight]) => ({
    id,
    whole: (amount * weight) / totalWeight,
    remainder: (amount * weight) % totalWeight,
  })).sort((left, right) =>
    left.remainder === right.remainder
      ? compareId(left.id, right.id)
      : left.remainder > right.remainder
        ? -1
        : 1
  );

  let unassigned = amount - sum(shares.map((share) => share.whole));
  const result = new Map<string, bigint>();
  for (const share of shares) {
    result.set(share.id, share.whole + (unassigned > 0n ? 1n : 0n));
    unassigned -= unassigned > 0n ? 1n : 0n;
  }
  return result;
}
