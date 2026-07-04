/**
 * Unified Scheduler Exports
 *
 * This module provides both the full server-side scheduler and the preview engine.
 */

export type {
  BumpedHabitEvent,
  HabitScheduleResult,
  ScheduledEvent,
  ScheduleResult,
  SchedulingLogEntry,
  TaskScheduleResult,
  WorkspaceBreakSettings,
} from '../unified-scheduler';
// Re-export from main unified scheduler
export { scheduleWorkspace } from '../unified-scheduler';
export type {
  GeneratePreviewOptions,
  HourSettings,
  PreviewEvent,
  PreviewHabitResult,
  PreviewResult,
  PreviewTaskResult,
  SchedulingStep,
} from './preview-engine';
// Export preview engine
export {
  generatePreview,
  getAnimationSteps,
  getEventsAtStep,
} from './preview-engine';
