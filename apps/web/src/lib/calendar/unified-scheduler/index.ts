/**
 * Unified Scheduler Exports
 *
 * This module provides both the full server-side scheduler and the preview engine.
 */

// Re-export from main unified scheduler
export { scheduleWorkspace } from '../unified-scheduler';
export type {
  ScheduleResult,
  ScheduledEvent,
  HabitScheduleResult,
  TaskScheduleResult,
  BumpedHabitEvent,
  SchedulingLogEntry,
  WorkspaceBreakSettings,
} from '../unified-scheduler';

// Export preview engine
export {
  generatePreview,
  getAnimationSteps,
  getEventsAtStep,
} from './preview-engine';

export type {
  PreviewEvent,
  PreviewResult,
  PreviewTaskResult,
  PreviewHabitResult,
  SchedulingStep,
  GeneratePreviewOptions,
  HourSettings,
} from './preview-engine';
