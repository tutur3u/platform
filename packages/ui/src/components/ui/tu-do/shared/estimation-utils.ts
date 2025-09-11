/**
 * Utility functions for task estimation display and conversion
 */

/**
 * Maps numeric estimation points to display labels based on estimation type
 */
export function getEstimationDisplayLabel(
  points: number,
  estimationType?: string | null
): string {
  if (estimationType === 't-shirt') {
    const tshirtMap: Record<number, string> = {
      0: '-',
      1: 'XS',
      2: 'S',
      3: 'M',
      4: 'L',
      5: 'XL',
      6: 'XXL',
      7: 'XXXL',
    };
    return tshirtMap[points] || String(points);
  }

  return String(points);
}

/**
 * Generates estimation options based on board configuration
 */
export function getEstimationOptions(boardConfig: {
  estimation_type?: string | null;
  extended_estimation?: boolean;
  allow_zero_estimates?: boolean;
}): number[] {
  if (!boardConfig?.estimation_type) return [];

  const max = boardConfig.extended_estimation ? 7 : 5; // Database stores 0-7
  const allowZero = boardConfig.allow_zero_estimates;
  let options: number[] = [];

  switch (boardConfig.estimation_type) {
    case 'fibonacci': {
      const fib = [1, 2, 3, 5]; // Standard fibonacci up to 5
      if (boardConfig.extended_estimation) {
        // Extended: add 6, 7 as approximate fibonacci continuation
        fib.push(6, 7);
      }
      options = fib.filter((n) => n <= max);
      break;
    }
    case 't-shirt': {
      // T-shirt uses sequential 0-7 mapping
      options = Array.from({ length: max + 1 }, (_, i) => i);
      break;
    }
    case 'exponential': {
      const exp = [1, 2, 4]; // Standard exponential
      if (boardConfig.extended_estimation) {
        // Extended: add 5, 6, 7 as continuation
        exp.push(5, 6, 7);
      }
      options = exp.filter((n) => n <= max);
      break;
    }
    case 'linear':
    default: {
      // Linear: just sequential numbers
      options = Array.from({ length: max + 1 }, (_, i) => i);
      break;
    }
  }

  if (!allowZero) {
    options = options.filter((n) => n !== 0);
  } else if (allowZero && !options.includes(0)) {
    options = [0, ...options];
  }

  return options;
}

/**
 * Gets a human-readable description of the estimation range
 */
export function getEstimationRangeDescription(
  estimationType: string | null,
  isExtended?: boolean,
  allowZero?: boolean
): string {
  if (!estimationType || estimationType === 'none') {
    return 'No estimation configured';
  }

  const prefix = allowZero ? '' : '(no zero) ';

  switch (estimationType) {
    case 'fibonacci':
      return isExtended
        ? `${prefix}Fibonacci: 0, 1, 2, 3, 5, 6, 7`
        : `${prefix}Fibonacci: 0, 1, 2, 3, 5`;
    case 't-shirt':
      return isExtended
        ? `${prefix}T-shirt: -, XS, S, M, L, XL, XXL, XXXL`
        : `${prefix}T-shirt: -, XS, S, M, L, XL`;
    case 'exponential':
      return isExtended
        ? `${prefix}Exponential: 0, 1, 2, 4, 5, 6, 7`
        : `${prefix}Exponential: 0, 1, 2, 4`;
    case 'linear':
      return isExtended
        ? `${prefix}Linear: 0, 1, 2, 3, 4, 5, 6, 7`
        : `${prefix}Linear: 0, 1, 2, 3, 4, 5`;
    default:
      return 'No estimation configured';
  }
}
