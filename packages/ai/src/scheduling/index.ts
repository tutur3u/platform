/**
 * Task Scheduling Module
 *
 * This module provides task scheduling algorithms that:
 * - Prioritize tasks by deadline (earlier deadlines get earlier slots)
 * - Respect min/max split durations
 * - Handle existing calendar events (locked events)
 * - Support work, personal, and meeting hour types
 */

export {
  prepareTaskChunks,
  promoteEventToTask,
  scheduleTasks,
  scheduleWithFlexibleEvents,
} from './algorithm';
export { defaultActiveHours, defaultTasks } from './default';
export {
  calculateOccurrences,
  getNextOccurrence,
  getNextOccurrenceDescription,
  getOccurrencesInRange,
  isOccurrenceDate,
} from './recurrence-calculator';
export { templateScenarios } from './templates';
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
export {
  convertHourSettingsToActiveHours,
  convertWebEventsToLocked,
  convertWebTasksToSchedulerTasks,
  convertWebTaskToSchedulerTask,
  mapCalendarHoursToCategory,
  scheduleWebTask,
  scheduleWebTasks,
} from './web-adapter';
