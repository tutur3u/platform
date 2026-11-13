/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { createContext, type ReactNode, useContext } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PeriodicReportsScopeHeader } from './periodic-reports-scope-header';
import {
  ReportTitleMonthSelect,
  reportTitleMonthLabel,
} from './report-title-month-select';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join('|')}` : key,
}));
const SelectContext = createContext<(value: string) => void>(() => {});
vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <SelectContext.Provider value={onValueChange}>
      <div data-testid="select" data-value={value}>
        {children}
      </div>
    </SelectContext.Provider>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
    const onValueChange = useContext(SelectContext);
    return (
      <button type="button" role="option" onClick={() => onValueChange(value)}>
        {children}
      </button>
    );
  },
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

// Synthetic months only.
const options = [
  { key: '2026-10', count: 1 },
  { key: '10', count: 2 },
  { key: '09', count: 3 },
  { key: 'none', count: 2 },
];

describe('ReportTitleMonthSelect', () => {
  it('lists every month found in the titles with its count, plus All months', () => {
    render(
      <ReportTitleMonthSelect
        ariaLabel="Month"
        options={options}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(
      screen.getAllByRole('option').map((node) => node.textContent)
    ).toEqual([
      'all_months (8)',
      'month_option:10/2026 (1)',
      'month_option:10 (2)',
      'month_option:9 (3)',
      'no_title_month (2)',
    ]);
  });

  it('selects a month by its key and clears with All months', () => {
    const onChange = vi.fn();
    render(
      <ReportTitleMonthSelect
        ariaLabel="Month"
        options={options}
        value=""
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('option', { name: 'month_option:9 (3)' }));
    expect(onChange).toHaveBeenLastCalledWith('09');
    fireEvent.click(screen.getByRole('option', { name: 'no_title_month (2)' }));
    expect(onChange).toHaveBeenLastCalledWith('none');
    fireEvent.click(screen.getByRole('option', { name: 'all_months (8)' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('shows no numbers while the counts are unknown or not exact', () => {
    const { rerender } = render(
      <ReportTitleMonthSelect ariaLabel="Month" value="09" onChange={vi.fn()} />
    );
    expect(
      screen.getAllByRole('option').map((node) => node.textContent)
    ).toEqual(['all_months', 'month_option:9']);
    rerender(
      <ReportTitleMonthSelect
        ariaLabel="Month"
        options={options}
        partial
        value="09"
        onChange={vi.fn()}
      />
    );
    for (const node of screen.getAllByRole('option'))
      expect(node.textContent).not.toMatch(/\(\d+\)/);
  });

  it('keeps a month chosen from the URL even when no report carries it', () => {
    render(
      <ReportTitleMonthSelect
        ariaLabel="Month"
        options={options}
        value="2025-09"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-value',
      '2025-09'
    );
    expect(
      screen.getByRole('option', { name: 'month_option:09/2025 (0)' })
    ).toBeInTheDocument();
  });
});

describe('reportTitleMonthLabel', () => {
  const labels = {
    month: (value: string) => `Tháng ${value}`,
    none: 'Không có tháng',
  };
  it.each([
    ['09', 'Tháng 9'],
    ['10', 'Tháng 10'],
    ['2026-09', 'Tháng 09/2026'],
    ['none', 'Không có tháng'],
  ])('labels %s as %s', (key, label) => {
    expect(reportTitleMonthLabel(key, labels)).toBe(label);
  });
});

describe('PeriodicReportsScopeHeader', () => {
  const header = (titleMonth: string, range = ['', '']) => (
    <PeriodicReportsScopeHeader
      titleMonth={titleMonth}
      periodStart={range[0] ?? ''}
      periodEnd={range[1] ?? ''}
      onRefresh={async () => {}}
    />
  );
  it('says what the worklist shows', () => {
    const { rerender } = render(header(''));
    expect(screen.getByText('all_periods')).toBeInTheDocument();
    rerender(header('09'));
    expect(
      screen.getByText('title_month_scope:month_option:9')
    ).toBeInTheDocument();
    rerender(header('none'));
    expect(screen.getByText('title_month_scope_none')).toBeInTheDocument();
    rerender(header('', ['2026-09-01', '2026-09-30']));
    expect(
      screen.getByText('period_scope:2026-09-01|2026-09-30')
    ).toBeInTheDocument();
  });
});
