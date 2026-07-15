// Shared estimation mapping utility to keep display logic DRY.
// Underlying stored value is always an index (0..7). This helper
// returns a human-readable representation based on estimation type.
// Supported types: 't-shirt', 'fibonacci', 'exponential', default numeric.

export type EstimationType =
  | 't-shirt'
  | 'fibonacci'
  | 'exponential'
  | string
  | null
  | undefined;

const TSHIRT_MAP: Record<number, string> = {
  0: '-',
  1: 'XS',
  2: 'S',
  3: 'M',
  4: 'L',
  5: 'XL',
  6: 'XXL',
  7: 'XXXL',
};

const FIB_MAP: Record<number, string> = {
  0: '0',
  1: '1',
  2: '2',
  3: '3',
  4: '5',
  5: '8',
  6: '13',
  7: '21',
};

const EXP_MAP: Record<number, string> = {
  0: '0',
  1: '1',
  2: '2',
  3: '4',
  4: '8',
  5: '16',
  6: '32',
  7: '64',
};

export function mapEstimationPoints(
  points: number,
  estimationType: EstimationType
): string {
  if (points == null) return '';
  switch (estimationType) {
    case 't-shirt':
      return TSHIRT_MAP[points] ?? String(points);
    case 'fibonacci':
      return FIB_MAP[points] ?? String(points);
    case 'exponential':
      return EXP_MAP[points] ?? String(points);
    default:
      return String(points);
  }
}

// Build list of point indices respecting allowZero/extended flags.
// We always return indices (0..maxIndex) so callers can decide about UI disabling.
export function buildEstimationIndices(params: {
  extended: boolean | null | undefined;
  allowZero: boolean | null | undefined;
}): number[] {
  const max = params.extended ? 7 : 5;
  let indices = Array.from({ length: max + 1 }, (_, i) => i);
  if (!params.allowZero) indices = indices.filter((i) => i !== 0);
  return indices;
}
