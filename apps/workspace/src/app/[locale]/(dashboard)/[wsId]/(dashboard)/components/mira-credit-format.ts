import { formatCompactNumber } from '@tuturuuu/utils/format';

export function formatRoundedCompactCredits(value: number) {
  return formatCompactNumber(Math.round(value));
}
