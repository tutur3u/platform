/**
 * Local re-exports of @tuturuuu/types for the native app.
 *
 * The native app cannot depend on @tuturuuu/types directly because that
 * package brings in @types/react@19.2.x (via @tiptap/react), which
 * conflicts with Expo SDK 54's @types/react@~19.1.x.
 *
 * These source files (supabase.ts, db.ts) are pure Supabase schema types
 * with zero React dependency, so importing them via relative path is safe.
 */

export type {
  TimeTrackingCategory,
  TimeTrackingPeriodStats,
  TimeTrackingSession,
  Workspace,
  WorkspaceCalendar,
  WorkspaceCalendarEvent,
  WorkspaceTask,
} from '../../../packages/types/src/db.js';
export type {
  Database,
  Json,
  Tables,
} from '../../../packages/types/src/supabase.js';
