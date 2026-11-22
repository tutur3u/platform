import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IncomeExpenseChartControls } from './chart-header-controls';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderControls(
  overrides: Partial<ComponentProps<typeof IncomeExpenseChartControls>> = {}
) {
  const props: ComponentProps<typeof IncomeExpenseChartControls> = {
    canGoNext: false,
    chartLabel: 'Daily totals',
    isConfidential: false,
    onNextPeriod: vi.fn(),
    onPreviousPeriod: vi.fn(),
    onToggleConfidential: vi.fn(),
    onViewModeChange: vi.fn(),
    rangeLabel: 'Nov 9 - November 22, 2026',
    viewMode: 'all',
    ...overrides,
  };

  render(<IncomeExpenseChartControls {...props} />);
  return props;
}

describe('IncomeExpenseChartControls', () => {
  it('renders All/Income/Expense as tabs named by the chart', () => {
    const props = renderControls();

    const tablist = screen.getByRole('tablist', { name: 'Daily totals' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'all',
      'income',
      'expense',
    ]);
    expect(screen.getByRole('tab', { name: 'all' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'income' }));
    expect(props.onViewModeChange).toHaveBeenCalledWith('income');
  });

  it('labels the period and visibility buttons', () => {
    const props = renderControls({ isConfidential: true });

    expect(screen.getByText('Nov 9 - November 22, 2026')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'previous-period' }));
    expect(props.onPreviousPeriod).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'next-period' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'show_confidential' }));
    expect(props.onToggleConfidential).toHaveBeenCalledTimes(1);
  });

  it('enables the next period once the range has moved back', () => {
    const props = renderControls({ canGoNext: true });

    fireEvent.click(screen.getByRole('button', { name: 'next-period' }));
    expect(props.onNextPeriod).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'hide_confidential' })
    ).toBeEnabled();
  });
});
