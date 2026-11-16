import { cleanText, hasRoom, SHOWCASE_LIMITS } from './limits';

export type TransactionKind = 'income' | 'expense';

export type DemoTransaction = {
  id: number;
  label: string;
  kind: TransactionKind;
  /** Positive integer cents; the kind carries the sign. */
  amountCents: number;
};

export type FinanceState = {
  transactions: DemoTransaction[];
  nextId: number;
};

export type FinanceAction =
  | { type: 'add'; label: string; kind: TransactionKind; amountCents: number }
  | { type: 'remove'; id: number }
  | { type: 'reset' };

export const initialFinanceState: FinanceState = {
  transactions: [
    { id: 1, label: 'Client retainer', kind: 'income', amountCents: 320_000 },
    { id: 2, label: 'Office rent', kind: 'expense', amountCents: 120_000 },
    { id: 3, label: 'Software seats', kind: 'expense', amountCents: 18_900 },
  ],
  nextId: 4,
};

export type FinanceTotals = {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
};

export function summarizeTransactions(
  transactions: readonly DemoTransaction[]
): FinanceTotals {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const transaction of transactions) {
    if (transaction.kind === 'income') incomeCents += transaction.amountCents;
    else expenseCents += transaction.amountCents;
  }
  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
  };
}

/**
 * Parses a typed amount such as "12", "12.5" or "1,250.00" into cents.
 * Returns null for anything else, zero, or amounts above the demo cap.
 */
export function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replaceAll(',', '');
  if (!/^\d{1,9}(?:\.\d{1,2})?$/u.test(normalized)) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents <= 0 || cents > SHOWCASE_LIMITS.amountMaxCents) return null;
  return cents;
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

export function financeReducer(
  state: FinanceState,
  action: FinanceAction
): FinanceState {
  switch (action.type) {
    case 'add': {
      const label = cleanText(action.label, SHOWCASE_LIMITS.titleLength);
      if (
        !label ||
        !Number.isInteger(action.amountCents) ||
        action.amountCents <= 0 ||
        action.amountCents > SHOWCASE_LIMITS.amountMaxCents ||
        !hasRoom(state.transactions, SHOWCASE_LIMITS.listItems)
      )
        return state;
      return {
        transactions: [
          {
            id: state.nextId,
            label,
            kind: action.kind,
            amountCents: action.amountCents,
          },
          ...state.transactions,
        ],
        nextId: state.nextId + 1,
      };
    }
    case 'remove':
      return {
        ...state,
        transactions: state.transactions.filter(
          (item) => item.id !== action.id
        ),
      };
    case 'reset':
      return initialFinanceState;
  }
}
