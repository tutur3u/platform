'use client';

import { ChevronLeft, ChevronRight, Eye, EyeOff } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { Button } from '../../../button';
import { FinanceSegmentedTabs } from '../segmented-tabs';

export type IncomeExpenseViewMode = 'all' | 'income' | 'expense';

interface ChartPeriodNavigatorProps {
  canGoNext: boolean;
  label: string;
  onNextPeriod: () => void;
  onPreviousPeriod: () => void;
}

/** Previous/next period arrows around the visible range, at control height. */
export function ChartPeriodNavigator({
  canGoNext,
  label,
  onNextPeriod,
  onPreviousPeriod,
}: ChartPeriodNavigatorProps) {
  const t = useTranslations('finance-analytics');

  return (
    <div className="flex h-8 items-center gap-0.5 rounded-(--radius-segment) border border-border bg-background px-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onPreviousPeriod}
        className="size-7"
        title={t('previous-period')}
        aria-label={t('previous-period')}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-35 px-2 text-center text-xs tabular-nums">
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onNextPeriod}
        disabled={!canGoNext}
        className="size-7"
        title={t('next-period')}
        aria-label={t('next-period')}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

interface ChartNumbersVisibilityButtonProps {
  isConfidential: boolean;
  onToggle: () => void;
}

/** The chart-level Show/Hide numbers toggle, as a labelled icon button. */
export function ChartNumbersVisibilityButton({
  isConfidential,
  onToggle,
}: ChartNumbersVisibilityButtonProps) {
  const t = useTranslations('transaction-data-table');
  const label = isConfidential
    ? t('show_confidential')
    : t('hide_confidential');

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="size-8 shrink-0"
      title={label}
      aria-label={label}
    >
      {isConfidential ? (
        <EyeOff className="size-4" />
      ) : (
        <Eye className="size-4" />
      )}
    </Button>
  );
}

interface IncomeExpenseChartControlsProps {
  canGoNext: boolean;
  /** Accessible name for the view tabs, usually the chart title. */
  chartLabel: string;
  isConfidential: boolean;
  onNextPeriod: () => void;
  onPreviousPeriod: () => void;
  onToggleConfidential: () => void;
  onViewModeChange: (viewMode: IncomeExpenseViewMode) => void;
  rangeLabel: string;
  viewMode: IncomeExpenseViewMode;
}

/** Period navigation, numbers visibility and the All/Income/Expense tabs. */
export function IncomeExpenseChartControls({
  canGoNext,
  chartLabel,
  isConfidential,
  onNextPeriod,
  onPreviousPeriod,
  onToggleConfidential,
  onViewModeChange,
  rangeLabel,
  viewMode,
}: IncomeExpenseChartControlsProps) {
  const t = useTranslations('transaction-data-table');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ChartPeriodNavigator
        canGoNext={canGoNext}
        label={rangeLabel}
        onNextPeriod={onNextPeriod}
        onPreviousPeriod={onPreviousPeriod}
      />
      <ChartNumbersVisibilityButton
        isConfidential={isConfidential}
        onToggle={onToggleConfidential}
      />
      <FinanceSegmentedTabs
        value={viewMode}
        onValueChange={onViewModeChange}
        label={chartLabel}
        triggerClassName="text-xs"
        options={[
          { value: 'all', label: t('all') },
          { value: 'income', label: t('income') },
          { value: 'expense', label: t('expense') },
        ]}
      />
    </div>
  );
}
