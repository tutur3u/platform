import type { HeatmapViewMode } from '@/components/settings/time-tracker/heatmap-display-settings';

export interface ActivityDay {
  /** Canonical activity date key in YYYY-MM-DD format for the user's timezone. */
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
  /** Inclusive start date in canonical YYYY-MM-DD format for the active user timezone. */
  startDate: string;
  /** Inclusive end date in canonical YYYY-MM-DD format for the active user timezone. */
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
  /** Canonical activity date key in YYYY-MM-DD format for the user's timezone. */
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
  bestDay: {
    duration: number;
    /** Canonical activity date key in YYYY-MM-DD format for the user's timezone. */
    date: string;
  };
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
  /**
   * OverallStats.focusScore is an integer percentage in the 0-100 range.
   * It is calculated in useActivityAnalytics as Math.min(100, Math.round((avgSession / 3600) * 25)),
   * where avgSession is the average session length in seconds across the aggregated months.
   * Consumers should display higher values as stronger sustained focus, with 100 representing the capped maximum.
   */
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
