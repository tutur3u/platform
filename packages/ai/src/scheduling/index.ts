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
export type {
  HabitDurationConfig,
  SlotCharacteristics,
  TaskSlotConfig,
  TimeSlotInfo,
} from './duration-optimizer';
export {
  calculateIdealStartTimeForHabit,
  calculateIdealStartTimeForTask,
  calculateOptimalDuration,
  findBestSlotForHabit,
  findBestSlotForTask,
  getEffectiveDurationBounds,
  getSlotCharacteristics,
  roundToNext15Minutes,
  scoreSlotForHabit,
  scoreSlotForTask,
  slotMatchesPreference,
  timeMatchesSlot,
} from './duration-optimizer';
export type { PrioritizableItem } from './priority-calculator';
export {
  calculatePriorityScore,
  canBump,
  comparePriority,
  getEffectivePriority,
  isHigherPriority,
  isUrgent,
  PRIORITY_WEIGHTS,
  sortByPriority,
} from './priority-calculator';
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
  SchedulingWeights,
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
