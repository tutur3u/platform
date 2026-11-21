/**
 * Spend accounting in integer micro-USD (1e-6 USD) so arithmetic is exact.
 * A turn reserves its worst case before the model call and settles to actual
 * usage after; unknown prices fail closed.
 */

export interface ModelPrice {
  /** micro-USD per million tokens */
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  /** Cache write multiplier relative to input, e.g. 1.25. */
  cacheWriteMultiplier: number;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface BudgetCaps {
  dailyMicroUsd: number;
  monthlyMicroUsd: number;
}

export interface BudgetLedger {
  dayKey: string;
  monthKey: string;
  daySpentMicroUsd: number;
  monthSpentMicroUsd: number;
  dayReservedMicroUsd: number;
  monthReservedMicroUsd: number;
}

export class MissingPriceError extends Error {
  constructor() {
    super('Model price is missing or invalid');
  }
}

function assertCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Token counts must be non-negative safe integers');
  }
}

function validPrice(price: ModelPrice | null | undefined): ModelPrice {
  if (!price) throw new MissingPriceError();
  const fields = [
    price.inputPerMillion,
    price.cachedInputPerMillion,
    price.outputPerMillion,
    price.cacheWriteMultiplier,
  ];
  if (fields.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new MissingPriceError();
  }
  return price;
}

export function usageCostMicroUsd(
  priceInput: ModelPrice | null | undefined,
  usage: TokenUsage
): number {
  const price = validPrice(priceInput);
  for (const count of Object.values(usage)) assertCount(count);
  const total =
    usage.inputTokens * price.inputPerMillion +
    usage.cachedInputTokens * price.cachedInputPerMillion +
    usage.cacheWriteTokens *
      price.inputPerMillion *
      price.cacheWriteMultiplier +
    usage.outputTokens * price.outputPerMillion;
  return Math.ceil(total / 1_000_000);
}

/**
 * Worst case: every input token is billed at the higher of the uncached,
 * cached and cache-write rates, and output hits its cap.
 */
export function worstCaseMicroUsd(
  price: ModelPrice | null | undefined,
  estimatedInputTokens: number,
  outputCapTokens: number
): number {
  const p = validPrice(price);
  assertCount(estimatedInputTokens);
  assertCount(outputCapTokens);
  const inputRate = Math.max(
    p.inputPerMillion,
    p.cachedInputPerMillion,
    p.inputPerMillion * p.cacheWriteMultiplier
  );
  return Math.ceil(
    (estimatedInputTokens * inputRate + outputCapTokens * p.outputPerMillion) /
      1_000_000
  );
}

export interface Reservation {
  amountMicroUsd: number;
  dayKey: string;
  monthKey: string;
}

export type ReserveResult =
  | { ok: true; ledger: BudgetLedger; reservation: Reservation }
  | { ok: false; reason: 'daily_cap' | 'monthly_cap' | 'invalid_state' };

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validLedger(ledger: BudgetLedger): boolean {
  return (
    isAmount(ledger.daySpentMicroUsd) &&
    isAmount(ledger.dayReservedMicroUsd) &&
    isAmount(ledger.monthSpentMicroUsd) &&
    isAmount(ledger.monthReservedMicroUsd)
  );
}

export function rollLedger(
  ledger: BudgetLedger,
  dayKey: string,
  monthKey: string
): BudgetLedger {
  const monthChanged = ledger.monthKey !== monthKey;
  const dayChanged = monthChanged || ledger.dayKey !== dayKey;
  return {
    dayKey,
    monthKey,
    daySpentMicroUsd: dayChanged ? 0 : ledger.daySpentMicroUsd,
    dayReservedMicroUsd: dayChanged ? 0 : ledger.dayReservedMicroUsd,
    monthSpentMicroUsd: monthChanged ? 0 : ledger.monthSpentMicroUsd,
    monthReservedMicroUsd: monthChanged ? 0 : ledger.monthReservedMicroUsd,
  };
}

/** Invalid caps or ledger values fail closed instead of admitting spend. */
export function reserve(
  ledger: BudgetLedger,
  caps: BudgetCaps,
  amountMicroUsd: number
): ReserveResult {
  if (
    !isAmount(amountMicroUsd) ||
    !isAmount(caps.dailyMicroUsd) ||
    !isAmount(caps.monthlyMicroUsd) ||
    !validLedger(ledger)
  ) {
    return { ok: false, reason: 'invalid_state' };
  }
  const day =
    ledger.daySpentMicroUsd + ledger.dayReservedMicroUsd + amountMicroUsd;
  if (day > caps.dailyMicroUsd) return { ok: false, reason: 'daily_cap' };
  const month =
    ledger.monthSpentMicroUsd + ledger.monthReservedMicroUsd + amountMicroUsd;
  if (month > caps.monthlyMicroUsd) return { ok: false, reason: 'monthly_cap' };
  return {
    ok: true,
    reservation: {
      amountMicroUsd,
      dayKey: ledger.dayKey,
      monthKey: ledger.monthKey,
    },
    ledger: {
      ...ledger,
      dayReservedMicroUsd: ledger.dayReservedMicroUsd + amountMicroUsd,
      monthReservedMicroUsd: ledger.monthReservedMicroUsd + amountMicroUsd,
    },
  };
}

/**
 * Releases the reservation from the period it was taken in (a rollover has
 * already cleared older periods) and records actual spend in the current
 * period. Actual spend above the reservation is recorded in full: unknown
 * usage is never zero.
 */
export function settle(
  ledger: BudgetLedger,
  reservation: Reservation,
  actualMicroUsd: number
): BudgetLedger {
  assertCount(reservation.amountMicroUsd);
  assertCount(actualMicroUsd);
  const sameDay =
    reservation.dayKey === ledger.dayKey &&
    reservation.monthKey === ledger.monthKey;
  const sameMonth = reservation.monthKey === ledger.monthKey;
  return {
    ...ledger,
    dayReservedMicroUsd: sameDay
      ? Math.max(0, ledger.dayReservedMicroUsd - reservation.amountMicroUsd)
      : ledger.dayReservedMicroUsd,
    monthReservedMicroUsd: sameMonth
      ? Math.max(0, ledger.monthReservedMicroUsd - reservation.amountMicroUsd)
      : ledger.monthReservedMicroUsd,
    daySpentMicroUsd: ledger.daySpentMicroUsd + actualMicroUsd,
    monthSpentMicroUsd: ledger.monthSpentMicroUsd + actualMicroUsd,
  };
}
