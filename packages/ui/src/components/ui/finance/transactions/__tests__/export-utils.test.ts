import { describe, expect, it } from 'vitest';
import {
  calculateExportSummary,
  type TransactionExportRow,
} from '../export-utils';

describe('calculateExportSummary', () => {
  const createRow = (
    overrides: Partial<TransactionExportRow> = {}
  ): TransactionExportRow => ({
    amount: 100,
    description: 'Test transaction',
    category: 'Test Category',
    transaction_type: 'expense',
    wallet: 'Test Wallet',
    tags: null,
    taken_at: '2024-01-15',
    created_at: '2024-01-15',
    report_opt_in: true,
    creator_name: 'John Doe',
    creator_email: 'john@example.com',
    invoice_for_name: null,
    invoice_for_email: null,
    ...overrides,
  });

  it('should calculate totals for expenses only', () => {
    const data: TransactionExportRow[] = [
      createRow({ amount: 100, transaction_type: 'expense' }),
      createRow({ amount: 200, transaction_type: 'expense' }),
      createRow({ amount: 50, transaction_type: 'expense' }),
    ];

    const summary = calculateExportSummary(data);

    expect(summary.totalTransactions).toBe(3);
    expect(summary.totalExpense).toBe(350);
    expect(summary.totalIncome).toBe(0);
    expect(summary.netTotal).toBe(-350);
    expect(summary.hasRedactedAmounts).toBe(false);
  });

  it('should calculate totals for income only', () => {
    const data: TransactionExportRow[] = [
      createRow({ amount: 500, transaction_type: 'income' }),
      createRow({ amount: 300, transaction_type: 'income' }),
    ];

    const summary = calculateExportSummary(data);

    expect(summary.totalTransactions).toBe(2);
    expect(summary.totalExpense).toBe(0);
    expect(summary.totalIncome).toBe(800);
    expect(summary.netTotal).toBe(800);
    expect(summary.hasRedactedAmounts).toBe(false);
  });

  it('should calculate totals for mixed transactions', () => {
    const data: TransactionExportRow[] = [
      createRow({ amount: 1000, transaction_type: 'income' }),
      createRow({ amount: 200, transaction_type: 'expense' }),
      createRow({ amount: 500, transaction_type: 'income' }),
      createRow({ amount: 300, transaction_type: 'expense' }),
    ];

    const summary = calculateExportSummary(data);

    expect(summary.totalTransactions).toBe(4);
    expect(summary.totalIncome).toBe(1500);
    expect(summary.totalExpense).toBe(500);
    expect(summary.netTotal).toBe(1000);
    expect(summary.hasRedactedAmounts).toBe(false);
  });

  it('should handle negative expense amounts (database format)', () => {
    // Database stores expenses as negative values
    const data: TransactionExportRow[] = [
      createRow({ amount: 1000, transaction_type: 'income' }),
      createRow({ amount: -200, transaction_type: 'expense' }),
      createRow({ amount: -300, transaction_type: 'expense' }),
    ];

    const summary = calculateExportSummary(data);

    expect(summary.totalTransactions).toBe(3);
    expect(summary.totalIncome).toBe(1000);
    // Math.abs is used for expenses, so -200 and -300 become 200 and 300
    expect(summary.totalExpense).toBe(500);
    expect(summary.netTotal).toBe(500);
    expect(summary.hasRedactedAmounts).toBe(false);
  });

  it('should detect redacted amounts (null amounts)', () => {
    const data: TransactionExportRow[] = [
      createRow({ amount: 100, transaction_type: 'income' }),
      createRow({ amount: null, transaction_type: 'expense' }),
      createRow({ amount: 50, transaction_type: 'expense' }),
    ];

    const summary = calculateExportSummary(data);

    expect(summary.totalTransactions).toBe(3);
    expect(summary.totalIncome).toBe(100);
    expect(summary.totalExpense).toBe(50);
    expect(summary.netTotal).toBe(50);
    expect(summary.hasRedactedAmounts).toBe(true);
  });

  it('should handle empty data', () => {
    const data: TransactionExportRow[] = [];

    const summary = calculateExportSummary(data);

    expect(summary.totalTransactions).toBe(0);
    expect(summary.totalIncome).toBe(0);
    expect(summary.totalExpense).toBe(0);
    expect(summary.netTotal).toBe(0);
    expect(summary.hasRedactedAmounts).toBe(false);
  });

  it('should skip transactions with null transaction_type', () => {
    const data: TransactionExportRow[] = [
      createRow({ amount: 100, transaction_type: 'income' }),
      createRow({ amount: 50, transaction_type: null }),
      createRow({ amount: 30, transaction_type: 'expense' }),
    ];

    const summary = calculateExportSummary(data);

    expect(summary.totalTransactions).toBe(3);
    expect(summary.totalIncome).toBe(100);
    expect(summary.totalExpense).toBe(30);
    expect(summary.netTotal).toBe(70);
    expect(summary.hasRedactedAmounts).toBe(false);
  });

  it('should handle all redacted amounts', () => {
    const data: TransactionExportRow[] = [
      createRow({ amount: null, transaction_type: 'income' }),
      createRow({ amount: null, transaction_type: 'expense' }),
      createRow({ amount: null, transaction_type: 'expense' }),
    ];

    const summary = calculateExportSummary(data);

    expect(summary.totalTransactions).toBe(3);
    expect(summary.totalIncome).toBe(0);
    expect(summary.totalExpense).toBe(0);
    expect(summary.netTotal).toBe(0);
    expect(summary.hasRedactedAmounts).toBe(true);
  });

  it('should handle zero amounts correctly', () => {
    const data: TransactionExportRow[] = [
      createRow({ amount: 0, transaction_type: 'income' }),
      createRow({ amount: 0, transaction_type: 'expense' }),
    ];

    const summary = calculateExportSummary(data);

    expect(summary.totalTransactions).toBe(2);
    expect(summary.totalIncome).toBe(0);
    expect(summary.totalExpense).toBe(0);
    expect(summary.netTotal).toBe(0);
    expect(summary.hasRedactedAmounts).toBe(false);
  });
});
