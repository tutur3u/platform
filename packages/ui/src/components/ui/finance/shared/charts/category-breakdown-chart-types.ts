export type TransactionType = 'expense' | 'income';

export type ChartInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface CategoryBreakdownCategory {
  color: string;
  id: string | null;
  name: string;
}

export type CategoryBreakdownChartDatum = {
  period: string;
} & Record<string, string | number>;

export interface CategoryBreakdownDisplayRange {
  displayEnd: string;
  displayStart: string;
}

export interface CategoryBreakdownDateRange
  extends CategoryBreakdownDisplayRange {
  endDate: string;
  startDate: string;
}
