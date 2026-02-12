// Session History - Modular Components

// Re-export formatDuration for backward compatibility
export { formatDuration } from '@tuturuuu/hooks/utils/time-format';
export { EditSessionDialog } from './edit-session-dialog';
export { MonthView } from './month-view';
export { PendingRequestsBanner } from './pending-requests-banner';
export { PeriodNavigation } from './period-navigation';
export { SessionFilters } from './session-filters';
export { SessionHistory } from './session-history';
export { SessionStats } from './session-stats';
// Types
export type {
  ActionStates,
  EditFormState,
  FilterState,
  SessionHistoryProps,
  StackedSession,
  TaskWithDetails,
  ViewMode,
} from './session-types';
export type { PeriodStats } from './session-utils';

// Utilities
export {
  calculatePeriodStats,
  createStackedSession,
  getCategoryColor,
  getDurationCategory,
  getSessionDays,
  getSessionDurationForDay,
  getSessionDurationInPeriod,
  getTimeOfDayCategory,
  isDatetimeMoreThanThresholdAgo,
  isSessionOlderThanThreshold,
  sessionOverlapsPeriod,
  stackSessions,
} from './session-utils';
export { StackedSessionItem } from './stacked-session-item';
export { useSessionActions } from './use-session-actions';
