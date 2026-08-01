export interface RevenueAllocationInput {
  catalogUnitPriceMinor: number;
  quantity: number;
}

function assertMinorInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

/**
 * Allocates a realized total with largest-remainder rounding. Input order is
 * the stable tie-breaker, matching the database line-id ordering contract.
 */
export function allocateRecognizedRevenue(
  soldTotalMinor: number,
  lines: RevenueAllocationInput[]
) {
  assertMinorInteger(soldTotalMinor, 'soldTotalMinor');
  if (lines.length === 0) {
    if (soldTotalMinor === 0) return [];
    throw new Error('At least one allocation line is required');
  }

  const catalogWeights = lines.map((line) => {
    assertMinorInteger(line.catalogUnitPriceMinor, 'catalogUnitPriceMinor');
    assertMinorInteger(line.quantity, 'quantity');
    return BigInt(line.catalogUnitPriceMinor) * BigInt(line.quantity);
  });
  const catalogWeightTotal = catalogWeights.reduce(
    (total, weight) => total + weight,
    0n
  );
  const weights =
    catalogWeightTotal > 0n
      ? catalogWeights
      : lines.map((line) => BigInt(line.quantity));
  const weightTotal = weights.reduce((total, weight) => total + weight, 0n);
  if (weightTotal === 0n) {
    if (soldTotalMinor === 0) return lines.map(() => 0);
    throw new Error('Allocation lines must consume at least one unit');
  }

  const soldTotal = BigInt(soldTotalMinor);
  const allocations = weights.map((weight, index) => {
    const numerator = soldTotal * weight;
    return {
      floor: numerator / weightTotal,
      index,
      remainder: numerator % weightTotal,
    };
  });
  let leftover =
    soldTotal -
    allocations.reduce((total, allocation) => total + allocation.floor, 0n);
  const ranked = [...allocations].sort(
    (left, right) =>
      Number(right.remainder - left.remainder) || left.index - right.index
  );
  for (const allocation of ranked) {
    if (leftover === 0n) break;
    allocation.floor += 1n;
    leftover -= 1n;
  }

  return allocations
    .sort((left, right) => left.index - right.index)
    .map((allocation) => Number(allocation.floor));
}
