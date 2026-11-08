/**
 * Portable fee-lock total calculator, used for the editor's live preview.
 * The saved totals always come from the `private.fee_lock_*` SQL functions;
 * this mirrors their maths so the preview matches what the server stores:
 * `line_amount = round(unit_price * quantity + adjustment_amount)` to the
 * currency's minor unit, half away from zero (Postgres `round(numeric)`).
 *
 * Arithmetic is exact: prices carry at most 6 decimals (`numeric(20,6)`) and
 * quantities at most 3 (`numeric(12,3)`), so both are scaled to integers and
 * multiplied as bigint.
 */

export const FEE_LOCK_PRICE_DECIMALS = 6;
export const FEE_LOCK_QUANTITY_DECIMALS = 3;

const PRODUCT_DECIMALS = FEE_LOCK_PRICE_DECIMALS + FEE_LOCK_QUANTITY_DECIMALS;

export type FeeLockLineKind = 'tuition' | 'extra';

export interface FeeLockCalcLineInput {
  kind: FeeLockLineKind;
  unit_price: number;
  quantity: number;
  adjustment_amount?: number | null;
  reason?: string | null;
  /** Tuition only: sessions the baseline expected, for the reason rule. */
  baseline_quantity?: number | null;
}

export type FeeLockCalcIssueCode =
  | 'invalid_price'
  | 'invalid_quantity'
  | 'invalid_adjustment'
  | 'negative_line'
  | 'reason_required';

export interface FeeLockCalcIssue {
  index: number;
  code: FeeLockCalcIssueCode;
}

export interface FeeLockCalcResult {
  currency: string;
  minor_units: number;
  line_amounts: number[];
  total_amount: number;
  issues: FeeLockCalcIssue[];
}

/** Decimal digits of the currency's minor unit (VND 0, USD 2). */
export function getCurrencyMinorUnits(currency: string): number {
  try {
    const digits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits;
    return typeof digits === 'number' ? digits : 2;
  } catch {
    return 2;
  }
}

/**
 * Converts a finite number to an integer scaled by 10^decimals, or null when
 * it carries more precision than allowed (or is not finite).
 */
export function toScaledInteger(
  value: number,
  decimals: number
): bigint | null {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e15) return null;
  const fixed = value.toFixed(decimals);
  if (Number(fixed) !== value) return null;
  const negative = fixed.startsWith('-');
  const [whole = '0', fraction = ''] = (
    negative ? fixed.slice(1) : fixed
  ).split('.');
  const scaled = BigInt(whole + fraction.padEnd(decimals, '0'));
  return negative ? -scaled : scaled;
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

/** Integer division rounding half away from zero. */
function divideRoundHalfAway(numerator: bigint, divisor: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (magnitude + divisor / 2n) / divisor;
  return negative ? -rounded : rounded;
}

function minorToNumber(minor: bigint, minorUnits: number): number {
  if (minorUnits === 0) return Number(minor);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor)
    .toString()
    .padStart(minorUnits + 1, '0');
  const whole = digits.slice(0, -minorUnits);
  const fraction = digits.slice(-minorUnits);
  return Number(`${negative ? '-' : ''}${whole}.${fraction}`);
}

function hasReason(reason: string | null | undefined) {
  return typeof reason === 'string' && reason.trim().length > 0;
}

export function calculateFeeLockTotals(
  lines: readonly FeeLockCalcLineInput[],
  { currency }: { currency: string }
): FeeLockCalcResult {
  const minorUnits = getCurrencyMinorUnits(currency);
  const divisor = pow10(PRODUCT_DECIMALS - minorUnits);
  const issues: FeeLockCalcIssue[] = [];
  const lineMinors: bigint[] = [];

  lines.forEach((line, index) => {
    const price = toScaledInteger(line.unit_price, FEE_LOCK_PRICE_DECIMALS);
    const quantity = toScaledInteger(line.quantity, FEE_LOCK_QUANTITY_DECIMALS);
    const adjustment = toScaledInteger(
      line.adjustment_amount ?? 0,
      FEE_LOCK_PRICE_DECIMALS
    );

    if (price === null || price < 0n)
      issues.push({ index, code: 'invalid_price' });
    if (quantity === null || quantity <= 0n)
      issues.push({ index, code: 'invalid_quantity' });
    if (adjustment === null) issues.push({ index, code: 'invalid_adjustment' });

    const differsFromBaseline =
      line.kind === 'tuition' &&
      line.baseline_quantity != null &&
      line.baseline_quantity !== line.quantity;
    if (
      ((adjustment !== null && adjustment !== 0n) || differsFromBaseline) &&
      !hasReason(line.reason)
    ) {
      issues.push({ index, code: 'reason_required' });
    }

    if (price === null || quantity === null || adjustment === null) {
      lineMinors.push(0n);
      return;
    }

    const exact =
      price * quantity + adjustment * pow10(FEE_LOCK_QUANTITY_DECIMALS);
    const minor = divideRoundHalfAway(exact, divisor);
    if (minor < 0n) issues.push({ index, code: 'negative_line' });
    lineMinors.push(minor);
  });

  const totalMinor = lineMinors.reduce((sum, minor) => sum + minor, 0n);

  return {
    currency,
    minor_units: minorUnits,
    line_amounts: lineMinors.map((minor) => minorToNumber(minor, minorUnits)),
    total_amount: minorToNumber(totalMinor, minorUnits),
    issues,
  };
}
