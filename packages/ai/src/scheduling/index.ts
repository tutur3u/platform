/**
 * Task Scheduling Module
 *
 * This module provides task scheduling algorithms that:
 * - Prioritize tasks by deadline (earlier deadlines get earlier slots)
 * - Respect min/max split durations
 * - Handle existing calendar events (locked events)
 * - Support work, personal, and meeting hour types
 */

// Core algorithm
export {
  prepareTaskChunks,
  promoteEventToTask,
  scheduleTasks,
  scheduleWithFlexibleEvents,
} from './algorithm';
// Defaults
export { defaultActiveHours, defaultTasks } from './default';
// Templates
export { templateScenarios } from './templates';
// Core types
export type {
  ActiveHours,
  CalendarHoursType,
  DateRange,
  Event,
  Log,
  ScheduleResult,
  Task,
  TemplateScenario,
  WebCalendarEvent,
  WebScheduleResult,
  WebTaskInput,
} from './types';

// Web adapter functions
export {
  convertHourSettingsToActiveHours,
  convertWebEventsToLocked,
  convertWebTasksToSchedulerTasks,
  convertWebTaskToSchedulerTask,
  mapCalendarHoursToCategory,
  scheduleWebTask,
  scheduleWebTasks,
} from './web-adapter';
