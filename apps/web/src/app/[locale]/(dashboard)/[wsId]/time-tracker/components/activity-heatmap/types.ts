import type { HeatmapViewMode } from '@/components/settings/time-tracker/heatmap-display-settings';

export interface ActivityDay {
  date: string;
  /** Duration in seconds. */
  duration: number;
  sessions: number;
}

export interface HeatmapSize {
  rectSize: number;
  rectRadius: number;
  gap: number;
}

export interface DateRangeConfig {
  startDate: string;
  endDate: string;
  withOutsideDates: boolean;
}

export interface OnboardingState {
  showTips: boolean;
  dismissedAt: string | null;
  viewCount: number;
  lastViewMode: HeatmapViewMode;
}

export interface MonthlyActivityDate {
  date: string;
  activity: { duration: number; sessions: number };
}

export interface MonthlyAggregate {
  totalDuration: number;
  activeDays: number;
  totalSessions: number;
  dates: MonthlyActivityDate[];
  weekdays: number;
  weekends: number;
  bestDay: { duration: number; date: string };
  longestStreak: number;
  currentStreak: number;
}

export type MonthlyTrend = 'up' | 'down' | 'neutral';

export interface OverallStats {
  totalDuration: number;
  totalSessions: number;
  activeDays: number;
  avgDaily: number;
  avgSession: number;
  focusScore: number;
  monthCount: number;
}

export type CompactHeatmapCard =
  | { type: 'summary'; data: OverallStats }
  | {
      type: 'monthly';
      monthKey: string;
      data: MonthlyAggregate;
      trend: MonthlyTrend;
      trendValue: number;
    }
  | { type: 'upcoming'; monthKey: string; isSubtle?: boolean }
  | { type: 'getting-started' };
