// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const visibility = vi.hoisted(() => ({ isConfidential: false }));
vi.mock('next-intl', () => ({
  useLocale: () => 'vi',
  useTranslations: () => (key: string, values?: { revision?: number }) =>
    values ? `${key}:${values.revision}` : key,
}));
vi.mock(
  '@tuturuuu/ui/finance/shared/charts/use-finance-confidential-visibility',
  () => ({
    FINANCE_HIDDEN_AMOUNT: '••••',
    useFinanceConfidentialVisibility: () => visibility,
  })
);

import { createFeeLockMoneyFormatter, FeeLockTable } from './fee-lock-table';

const lock = (status: 'draft' | 'locked') => ({
  id: `lock-${status}`,
  revision: status === 'locked' ? 2 : 0,
  status,
  total_amount: 1_100_000,
  updated_at: '2026-11-04T05:00:00Z',
  updated_by_name: 'Nhân viên',
  version: 3,
});
const rows = [null, lock('draft'), lock('locked')].map((value, index) => ({
  baseline_total: 1_200_000,
  classes: [
    { group_id: 'g-1', group_name: 'Lớp A1' },
    { group_id: 'g-2', group_name: 'Lớp B2' },
  ],
  lock: value,
  student_id: `student-${index}`,
  student_name: `Học viên ${index}`,
})) as never;

describe('FeeLockTable', () => {
  afterEach(() => {
    cleanup();
    visibility.isConfidential = false;
  });

  it('shows baseline, locked total and status per student', () => {
    render(<FeeLockTable rows={rows} currency="VND" />);
    expect(screen.getByText('status_none')).toBeTruthy();
    expect(screen.getByText('status_draft')).toBeTruthy();
    expect(screen.getByText('status_locked:2')).toBeTruthy();
    expect(screen.getAllByText('Lớp A1, Lớp B2')).toHaveLength(3);
    expect(screen.getAllByText(/1\.200\.000/)).toHaveLength(3);
    expect(screen.getAllByText(/1\.100\.000/)).toHaveLength(2);
  });

  it('hides amounts in confidential mode', () => {
    visibility.isConfidential = true;
    render(<FeeLockTable rows={rows} currency="VND" />);
    expect(screen.getAllByText('••••')).toHaveLength(5);
  });

  it('falls back to plain numbers for an invalid currency code', () => {
    render(<FeeLockTable rows={rows} currency="not-a-code" />);
    expect(screen.getAllByText('1.200.000')).toHaveLength(3);
    expect(screen.getAllByText('1.100.000')).toHaveLength(2);
  });
});

describe('createFeeLockMoneyFormatter', () => {
  it('formats with the currency when the code is valid', () => {
    expect(createFeeLockMoneyFormatter('en-US', 'USD').format(12.5)).toBe(
      '$12.50'
    );
  });

  it('does not throw on an invalid currency code', () => {
    expect(createFeeLockMoneyFormatter('en-US', 'US').format(1234.5)).toBe(
      '1,234.5'
    );
  });
});
