/**
 * Interest Calculator for Momo/ZaloPay high-interest savings programs.
 *
 * Formula (from Momo documentation):
 * Daily Interest = floor(Balance × (Annual Rate / 365))
 *
 * Key rules:
 * - Interest is calculated daily, rounded DOWN (floor)
 * - Interest compounds (added to balance for next day)
 * - Interest only accrues on business days
 * - New deposits have delayed interest start based on deposit day
 */

import type {
  DailyInterestResult,
  InterestCalculationParams,
  InterestCalculationResult,
  InterestProjection,
  InterestProjectionParams,
  PendingDepositInfo,
  WalletInterestRate,
} from '@tuturuuu/types';

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if a date is a Vietnamese holiday
 */
export function isHoliday(date: Date, holidays: Set<string>): boolean {
  const dateStr = formatDateString(date);
  return holidays.has(dateStr);
}

/**
 * Check if a date is a business day (not weekend, not holiday)
 */
export function isBusinessDay(date: Date, holidays: Set<string>): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

/**
 * Get the next business day from a given date
 */
export function getNextBusinessDay(date: Date, holidays: Set<string>): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);

  while (!isBusinessDay(next, holidays)) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Format a Date to YYYY-MM-DD string
 */
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to Date (in local timezone)
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year!, month! - 1, day);
}

/**
 * Get the interest start date for a deposit based on Momo/ZaloPay rules.
 *
 * Rules:
 * - Monday-Thursday deposit: Interest starts next business day
 * - Friday deposit: Interest starts Monday (or next business day if Monday is holiday)
 * - Saturday/Sunday deposit: Interest starts Tuesday (or next business day)
 * - Deposit before holiday: Interest starts first business day after holiday
 */
export function getInterestStartDate(
  depositDate: Date,
  holidays: Set<string>
): Date {
  // Interest always starts on the next business day after deposit
  return getNextBusinessDay(depositDate, holidays);
}

/**
 * Calculate the number of days until interest starts for a deposit
 */
export function getDaysUntilInterestStarts(
  depositDate: Date,
  holidays: Set<string>,
  today: Date = new Date()
): number {
  const startDate = getInterestStartDate(depositDate, holidays);
  const diffTime = startDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Get the applicable rate for a given date from rate history
 */
export function getRateForDate(
  date: Date,
  rates: WalletInterestRate[]
): number | null {
  // Sort rates by effective_from descending
  const sortedRates = [...rates].sort(
    (a, b) =>
      parseDateString(b.effective_from).getTime() -
      parseDateString(a.effective_from).getTime()
  );

  for (const rate of sortedRates) {
    const fromDate = parseDateString(rate.effective_from);
    const toDate = rate.effective_to
      ? parseDateString(rate.effective_to)
      : null;

    // Check if date is within range
    if (date >= fromDate && (!toDate || date <= toDate)) {
      return rate.annual_rate;
    }
  }

  return null;
}

/**
 * Calculate daily interest using Momo/ZaloPay formula.
 * Daily Interest = floor(Balance × (Annual Rate / 365))
 */
export function calculateDailyInterest(
  balance: number,
  annualRate: number
): number {
  if (balance <= 0 || annualRate <= 0) return 0;

  // Convert rate from percentage to decimal
  const rateDecimal = annualRate / 100;

  // Calculate and floor
  return Math.floor(balance * (rateDecimal / 365));
}

/**
 * Calculate interest over a date range from transaction history.
 *
 * This handles:
 * - Transaction-based balance changes
 * - Interest start delay rules
 * - Rate history changes
 * - Business day calculations
 * - Compounding (interest adds to balance)
 */
export function calculateInterest(
  params: InterestCalculationParams
): InterestCalculationResult {
  const {
    transactions,
    rates,
    holidays: holidayArray,
    fromDate,
    toDate,
    initialBalance = 0,
  } = params;

  const holidays = new Set<string>(holidayArray);
  const dailyResults: DailyInterestResult[] = [];

  // Sort transactions by date
  const sortedTransactions = [...transactions].sort(
    (a, b) =>
      parseDateString(a.date).getTime() - parseDateString(b.date).getTime()
  );

  // Build a map of transaction effects by date
  // Key: date string, Value: array of { amount, interestStartDate }
  const transactionEffects = new Map<
    string,
    Array<{ amount: number; interestStartDate: Date }>
  >();

  for (const tx of sortedTransactions) {
    const txDate = parseDateString(tx.date);
    const interestStartDate =
      tx.amount > 0 ? getInterestStartDate(txDate, holidays) : txDate;

    const dateStr = tx.date;
    if (!transactionEffects.has(dateStr)) {
      transactionEffects.set(dateStr, []);
    }
    transactionEffects.get(dateStr)!.push({
      amount: tx.amount,
      interestStartDate,
    });
  }

  const currentDate = parseDateString(fromDate);
  const endDate = parseDateString(toDate);
  let balance = initialBalance;
  let cumulativeInterest = 0;
  let businessDaysCount = 0;
  let nonBusinessDaysCount = 0;

  // Track deposits and their interest eligibility
  // Each deposit has: { amount, interestStartDate }
  const depositTracker: Array<{ amount: number; interestStartDate: Date }> = [];

  // Add initial balance as if deposited long ago (already earning)
  if (initialBalance > 0) {
    depositTracker.push({
      amount: initialBalance,
      interestStartDate: new Date(0), // Epoch - always eligible
    });
  }

  while (currentDate <= endDate) {
    const dateStr = formatDateString(currentDate);
    const isBizDay = isBusinessDay(currentDate, holidays);

    // Apply transactions for this date
    const dayTransactions = transactionEffects.get(dateStr) || [];
    for (const tx of dayTransactions) {
      if (tx.amount > 0) {
        // Deposit - track for delayed interest
        depositTracker.push({
          amount: tx.amount,
          interestStartDate: tx.interestStartDate,
        });
        balance += tx.amount;
      } else {
        // Withdrawal - reduce from oldest deposits first (FIFO)
        let remaining = Math.abs(tx.amount);
        balance += tx.amount; // This subtracts since amount is negative

        // Remove from deposit tracker (FIFO)
        while (remaining > 0 && depositTracker.length > 0) {
          const oldest = depositTracker[0]!;
          if (oldest.amount <= remaining) {
            remaining -= oldest.amount;
            depositTracker.shift();
          } else {
            oldest.amount -= remaining;
            remaining = 0;
          }
        }
      }
    }

    // Calculate interest-earning balance (only deposits past their start date)
    let interestEarningBalance = 0;
    for (const deposit of depositTracker) {
      if (currentDate >= deposit.interestStartDate) {
        interestEarningBalance += deposit.amount;
      }
    }

    // Get rate for this date
    const rate = getRateForDate(currentDate, rates);
    let dailyInterest = 0;

    if (isBizDay && rate !== null && interestEarningBalance > 0) {
      dailyInterest = calculateDailyInterest(interestEarningBalance, rate);
      businessDaysCount++;

      // Add interest to balance (compounding)
      if (dailyInterest > 0) {
        balance += dailyInterest;
        // Add interest as immediately-earning deposit
        depositTracker.push({
          amount: dailyInterest,
          interestStartDate: currentDate,
        });
      }
    } else {
      nonBusinessDaysCount++;
    }

    cumulativeInterest += dailyInterest;

    dailyResults.push({
      date: dateStr,
      balance: interestEarningBalance,
      rate: rate ?? 0,
      dailyInterest,
      isBusinessDay: isBizDay,
      cumulativeInterest,
    });

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    dailyResults,
    totalInterest: cumulativeInterest,
    finalBalance: balance,
    businessDaysCount,
    nonBusinessDaysCount,
  };
}

/**
 * Project future interest earnings.
 * Assumes current balance remains constant (no new transactions).
 */
export function projectInterest(
  params: InterestProjectionParams
): InterestProjection[] {
  const {
    currentBalance,
    currentRate,
    holidays: holidayArray,
    days,
    startDate,
  } = params;

  const holidays = new Set<string>(holidayArray);
  const projections: InterestProjection[] = [];

  const currentDate = startDate ? parseDateString(startDate) : new Date();
  let projectedBalance = currentBalance;
  let cumulativeInterest = 0;

  for (let i = 0; i < days; i++) {
    const dateStr = formatDateString(currentDate);
    const isBizDay = isBusinessDay(currentDate, holidays);
    let dailyInterest = 0;

    if (isBizDay && projectedBalance > 0 && currentRate > 0) {
      dailyInterest = calculateDailyInterest(projectedBalance, currentRate);
      projectedBalance += dailyInterest;
    }

    cumulativeInterest += dailyInterest;

    projections.push({
      date: dateStr,
      projectedBalance,
      projectedDailyInterest: dailyInterest,
      projectedCumulativeInterest: cumulativeInterest,
      isBusinessDay: isBizDay,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return projections;
}

/**
 * Find pending deposits that haven't started earning interest yet.
 */
export function findPendingDeposits(
  transactions: Array<{ date: string; amount: number }>,
  holidays: Set<string>,
  today: Date = new Date()
): PendingDepositInfo[] {
  const pending: PendingDepositInfo[] = [];

  for (const tx of transactions) {
    if (tx.amount <= 0) continue;

    const depositDate = parseDateString(tx.date);
    const interestStartDate = getInterestStartDate(depositDate, holidays);
    const daysUntil = getDaysUntilInterestStarts(depositDate, holidays, today);

    if (daysUntil > 0) {
      pending.push({
        depositDate: tx.date,
        amount: tx.amount,
        interestStartDate: formatDateString(interestStartDate),
        daysUntilInterest: daysUntil,
      });
    }
  }

  return pending;
}

/**
 * Calculate estimated monthly interest based on current balance and rate.
 * Uses average business days per month (approximately 22).
 */
export function estimateMonthlyInterest(
  balance: number,
  annualRate: number
): number {
  const dailyInterest = calculateDailyInterest(balance, annualRate);
  const avgBusinessDaysPerMonth = 22;
  return dailyInterest * avgBusinessDaysPerMonth;
}

/**
 * Calculate estimated yearly interest based on current balance and rate.
 * Uses average business days per year (approximately 260).
 */
export function estimateYearlyInterest(
  balance: number,
  annualRate: number
): number {
  const dailyInterest = calculateDailyInterest(balance, annualRate);
  const avgBusinessDaysPerYear = 260;
  return dailyInterest * avgBusinessDaysPerYear;
}

/**
 * Get the date range for month-to-date calculations.
 */
export function getMonthToDateRange(today: Date = new Date()): {
  fromDate: string;
  toDate: string;
} {
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstOfMonth = new Date(year, month, 1);

  return {
    fromDate: formatDateString(firstOfMonth),
    toDate: formatDateString(today),
  };
}

/**
 * Get the date range for year-to-date calculations.
 */
export function getYearToDateRange(today: Date = new Date()): {
  fromDate: string;
  toDate: string;
} {
  const year = today.getFullYear();
  const firstOfYear = new Date(year, 0, 1);

  return {
    fromDate: formatDateString(firstOfYear),
    toDate: formatDateString(today),
  };
}

/**
 * Convert holidays array to Set for efficient lookup.
 */
export function holidaysToSet(holidays: string[]): Set<string> {
  return new Set(holidays);
}
