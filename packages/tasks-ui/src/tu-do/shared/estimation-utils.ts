import {
  buildEstimationIndices,
  mapEstimationPoints,
} from './estimation-mapping';

// Wrapper to preserve legacy API while delegating to shared mapping util
export function getEstimationDisplayLabel(
  points: number,
  estimationType?: string | null
): string {
  return mapEstimationPoints(points, estimationType || undefined);
}

export function getEstimationOptions(boardConfig: {
  estimation_type?: string | null;
  extended_estimation?: boolean;
  allow_zero_estimates?: boolean;
}): number[] {
  if (!boardConfig?.estimation_type) return [];
  return buildEstimationIndices({
    extended: boardConfig.extended_estimation,
    allowZero: boardConfig.allow_zero_estimates,
  });
}

export function getEstimationRangeDescription(
  estimationType: string | null,
  isExtended?: boolean,
  allowZero?: boolean
): string {
  if (!estimationType || estimationType === 'none')
    return 'No estimation configured';
  const prefix = allowZero ? '' : '(no zero) ';
  switch (estimationType) {
    case 'fibonacci':
      return isExtended
        ? `${prefix}Fibonacci: 0, 1, 2, 3, 5, 8, 13, 21`
        : `${prefix}Fibonacci: 0, 1, 2, 3, 5, 8`;
    case 't-shirt':
      return isExtended
        ? `${prefix}T-shirt: -, XS, S, M, L, XL, XXL, XXXL`
        : `${prefix}T-shirt: -, XS, S, M, L, XL`;
    case 'exponential':
      return isExtended
        ? `${prefix}Exponential: 0, 1, 2, 4, 8, 16, 32, 64`
        : `${prefix}Exponential: 0, 1, 2, 4, 8, 16`;
    case 'linear':
      return isExtended
        ? `${prefix}Linear: 0, 1, 2, 3, 4, 5, 6, 7`
        : `${prefix}Linear: 0, 1, 2, 3, 4, 5`;
    default:
      return 'No estimation configured';
  }
}
