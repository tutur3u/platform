export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type IntervalType = 'day' | 'week' | 'month';

export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface DateRangeParams {
  walletIds?: string[];
  userIds?: string[];
  startDate: string;
  endDate: string;
  groupByCreator: boolean;
  weekStartsOn?: WeekStartsOn;
  intervalType?: IntervalType;
}
