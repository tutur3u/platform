import { ChevronLeft, ChevronRight, Eye, EyeOff } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { Button } from '../../../button';
import { CardTitle } from '../../../card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../select';
import { ToggleGroup, ToggleGroupItem } from '../../../toggle-group';
import type {
  CategoryBreakdownDisplayRange,
  ChartInterval,
  TransactionType,
} from './category-breakdown-chart-types';

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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <CardTitle className="text-base sm:text-lg">{chartTitle}</CardTitle>
        <ToggleGroup
          type="single"
          value={transactionType}
          onValueChange={(value) => {
            if (value) onTransactionTypeChange(value as TransactionType);
          }}
          className="h-8"
        >
          <ToggleGroupItem
            value="expense"
            aria-label={t('transaction-data-table.expense')}
            className="h-7 px-3 text-xs"
          >
            {t('transaction-data-table.expense')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="income"
            aria-label={t('transaction-data-table.income')}
            className="h-7 px-3 text-xs"
          >
            {t('transaction-data-table.income')}
          </ToggleGroupItem>
        </ToggleGroup>
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
            <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onPreviousPeriod}
                className="h-7 w-7"
                title={t('finance-analytics.previous-period')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-35 px-2 text-center text-xs">
                {displayRange.displayStart} - {displayRange.displayEnd}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onNextPeriod}
                disabled={dateOffset === 0}
                className="h-7 w-7"
                title={t('finance-analytics.next-period')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleConfidential}
              className="h-8 w-8 shrink-0"
              title={
                isConfidential
                  ? t('transaction-data-table.show_confidential')
                  : t('transaction-data-table.hide_confidential')
              }
            >
              {isConfidential ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
