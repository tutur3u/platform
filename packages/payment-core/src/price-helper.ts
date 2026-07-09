import { minorToMajor } from '@tuturuuu/utils/money';

/**
 * Format Polar/billing prices (stored as USD minor units / cents) as a
 * fixed two-decimal dollar string. Routes through the shared money module so
 * the cents→dollars conversion stays consistent across the platform.
 */
export function centToDollar(price: number) {
  return minorToMajor(price, 'USD').toFixed(2);
}
