import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '../db.js';

/**
 * A time-tracking session joined with its related category and task.
 *
 * Shared between the dedicated track app (apps/track) and the apps/web globals
 * that still surface active-session data (the header timer indicator, the
 * threshold hooks, notifications) after the time-tracker UI moved out of web.
 */
export interface SessionWithRelations extends TimeTrackingSession {
  category: TimeTrackingCategory | null;
  task: WorkspaceTask | null;
}
