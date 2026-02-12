/**
 * Unified Scheduler Exports
 *
 * This module provides the preview engine for client-side scheduling previews.
 * The full server-side scheduler runs via API proxy to the web app.
 */

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
