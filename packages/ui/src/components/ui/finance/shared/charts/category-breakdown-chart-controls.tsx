import { useTranslations } from 'next-intl';
import { CardTitle } from '../../../card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../select';
import { FinanceSegmentedTabs } from '../segmented-tabs';
import type {
  CategoryBreakdownDisplayRange,
  ChartInterval,
  TransactionType,
} from './category-breakdown-chart-types';
import {
  ChartNumbersVisibilityButton,
  ChartPeriodNavigator,
} from './chart-header-controls';

interface CategoryBreakdownChartControlsProps {
  chartTitle: string;
  dateOffset: number;
  displayRange: CategoryBreakdownDisplayRange;
  interval: ChartInterval;
  intervalLabels: Record<ChartInterval, string>;
  isConfidential: boolean;
  onIntervalChange: (interval: ChartInterval) => void;
  onNextPeriod: () => void;
  onPreviousPeriod: () => void;
  onToggleConfidential: () => void;
  onTransactionTypeChange: (transactionType: TransactionType) => void;
  showRangeControls?: boolean;
  transactionType: TransactionType;
}

export function CategoryBreakdownChartControls({
  chartTitle,
  dateOffset,
  displayRange,
  interval,
  intervalLabels,
  isConfidential,
  onIntervalChange,
  onNextPeriod,
  onPreviousPeriod,
  onToggleConfidential,
  onTransactionTypeChange,
  showRangeControls = false,
  transactionType,
}: CategoryBreakdownChartControlsProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <CardTitle className="text-base sm:text-lg">{chartTitle}</CardTitle>
        <FinanceSegmentedTabs
          value={transactionType}
          onValueChange={onTransactionTypeChange}
          label={chartTitle}
          triggerClassName="text-xs"
          options={[
            {
              value: 'expense',
              label: t('transaction-data-table.expense'),
            },
            { value: 'income', label: t('transaction-data-table.income') },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={interval}
          onValueChange={(value) => onIntervalChange(value as ChartInterval)}
        >
          <SelectTrigger className="h-8 w-30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">{intervalLabels.daily}</SelectItem>
            <SelectItem value="weekly">{intervalLabels.weekly}</SelectItem>
            <SelectItem value="monthly">{intervalLabels.monthly}</SelectItem>
            <SelectItem value="yearly">{intervalLabels.yearly}</SelectItem>
          </SelectContent>
        </Select>

        {showRangeControls ? (
          <>
            <ChartPeriodNavigator
              canGoNext={dateOffset > 0}
              label={`${displayRange.displayStart} - ${displayRange.displayEnd}`}
              onNextPeriod={onNextPeriod}
              onPreviousPeriod={onPreviousPeriod}
            />
            <ChartNumbersVisibilityButton
              isConfidential={isConfidential}
              onToggle={onToggleConfidential}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
