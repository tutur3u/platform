// Session History - Modular Components
export { SessionHistory } from './session-history';
export { StackedSessionItem } from './stacked-session-item';
export { SessionFilters } from './session-filters';
export { PeriodNavigation } from './period-navigation';
export { SessionStats } from './session-stats';
export { MonthView } from './month-view';
export { EditSessionDialog } from './edit-session-dialog';
export { useSessionActions } from './use-session-actions';

// Types
export type {
  ViewMode,
  StackedSession,
  SessionHistoryProps,
  TaskWithDetails,
  FilterState,
  ActionStates,
  EditFormState,
} from './session-types';

// Utilities
export {
  getSessionDurationInPeriod,
  getSessionDurationForDay,
  sessionOverlapsPeriod,
  getSessionDays,
  createStackedSession,
  stackSessions,
  getCategoryColor,
  isSessionOlderThanThreshold,
  isDatetimeMoreThanThresholdAgo,
  getTimeOfDayCategory,
  getDurationCategory,
  calculatePeriodStats,
} from './session-utils';
export type { PeriodStats } from './session-utils';

// Re-export formatDuration for backward compatibility
export { formatDuration } from '@/lib/time-format';
