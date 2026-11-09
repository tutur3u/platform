/**
 * Illustrative figures for the finance room.
 *
 * Numbers, dates, currency amounts and axis ticks are deliberately literals:
 * they are sample data, not copy, so they stay out of the message bundles.
 */

export interface CashflowMonth {
  id: string;
  /** Axis tick. */
  tick: string;
  income: number;
  expense: number;
}

export const cashflowMonths: CashflowMonth[] = [
  { id: 'feb', tick: 'Feb', income: 5.8, expense: 4.4 },
  { id: 'mar', tick: 'Mar', income: 6.4, expense: 4.1 },
  { id: 'apr', tick: 'Apr', income: 7.1, expense: 5.2 },
  { id: 'may', tick: 'May', income: 6.9, expense: 4.6 },
  { id: 'jun', tick: 'Jun', income: 8.3, expense: 5.4 },
  { id: 'jul', tick: 'Jul', income: 9.1, expense: 5.0 },
];

export const cashflowPeak = Math.max(
  ...cashflowMonths.flatMap((month) => [month.income, month.expense])
);

export type TransactionKind = 'income' | 'expense';

export interface TransactionRow {
  id: string;
  date: string;
  amount: string;
  kind: TransactionKind;
}

export const transactionRows: TransactionRow[] = [
  { id: 't1', date: '07.18', amount: '+$12,400', kind: 'income' },
  { id: 't2', date: '07.16', amount: '-$2,180', kind: 'expense' },
  { id: 't3', date: '07.14', amount: '-$860', kind: 'expense' },
  { id: 't4', date: '07.11', amount: '+$4,950', kind: 'income' },
];

export const financeFigures = {
  income: '$48,250',
  expense: '$31,480',
  net: '+$16,770',
  budgetSpent: '$31,480',
  budgetRemaining: '$8,520',
  budgetUsed: '78%',
  budgetUsedRatio: 0.78,
} as const;
