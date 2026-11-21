import type {
  WorkspaceTaskRecurrenceSchedule,
  WorkspaceTaskRecurrenceTemplate,
} from '@tuturuuu/internal-api/task-recurrence';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type {
  CalendarRecurrenceRule,
  CalendarWeekday,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import {
  buildCustomTaskRecurrence,
  buildTaskRecurrencePreset,
  detectTaskRecurrencePreset,
  isTaskOccurrenceSkipped,
  listTaskOccurrenceDates,
  nextTaskOccurrenceDate,
  TASK_RECURRENCE_LIMITS,
  type TaskRecurrencePreset,
  taskRecurrenceWeekday,
} from '@tuturuuu/utils/task-recurrence';

export type TaskRecurrenceFrequency = CalendarRecurrenceRule['frequency'];
export type TaskRecurrenceEnd = CalendarRecurrenceRule['end'];

export interface TaskRecurrenceCustomValues {
  frequency: TaskRecurrenceFrequency;
  interval: number;
  /** Weekly only. */
  weekdays: CalendarWeekday[];
  /** Monthly and yearly; 29–31 clamp to the last day of shorter months. */
  monthDay: number;
  end: TaskRecurrenceEnd;
}

export type TaskRecurrenceChoice =
  | { preset: TaskRecurrencePreset }
  | { preset: 'custom'; custom: TaskRecurrenceCustomValues };

/** Where a new series starts, derived from the task's dates. */
export interface TaskRecurrenceTimingDraft {
  /** The local date the user picked (due date, else start date, else today). */
  requestedDate: string;
  timeZone: string;
  dueTime: string | null;
  startOffsetDays: number;
}

export const TASK_RECURRENCE_TEMPLATE_DESCRIPTION_LIMIT = 16_000;
export const TASK_RECURRENCE_TEMPLATE_TITLE_LIMIT = 255;
export const TASK_RECURRENCE_PREVIEW_COUNT = 3;

interface LocalParts {
  date: string;
  time: string;
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    calendar: 'iso8601',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${read('year')}-${read('month')}-${read('day')}`,
    time: `${read('hour')}:${read('minute')}`,
  };
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** The browser zone, unless the calendar preference names one. */
export function resolveTaskRecurrenceTimeZone(preference?: string | null) {
  if (preference && preference !== 'auto') return preference;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** A due time of 23:59 or later means "end of day", the planner's null. */
export function taskRecurrenceTimingFromDates(input: {
  startDate?: Date;
  endDate?: Date;
  timeZone: string;
  now?: Date;
}): TaskRecurrenceTimingDraft {
  const { startDate, endDate, timeZone } = input;
  const due = endDate ?? startDate ?? input.now ?? new Date();
  const local = localParts(due, timeZone);
  const dueTime = endDate && local.time < '23:59' ? local.time : null;
  const offset =
    startDate && endDate
      ? daysBetween(localParts(startDate, timeZone).date, local.date)
      : 0;
  return {
    requestedDate: local.date,
    timeZone,
    dueTime,
    startOffsetDays: Math.min(
      Math.max(offset, 0),
      TASK_RECURRENCE_LIMITS.maxStartOffsetDays
    ),
  };
}

export function defaultTaskRecurrenceCustomValues(
  requestedDate: string
): TaskRecurrenceCustomValues {
  return {
    frequency: 'weekly',
    interval: 1,
    weekdays: [taskRecurrenceWeekday(requestedDate)],
    monthDay: Number(requestedDate.slice(8, 10)),
    end: { type: 'never' },
  };
}

export type TaskRecurrenceBuildResult =
  | { ok: true; schedule: WorkspaceTaskRecurrenceSchedule }
  | { ok: false; reason: 'until_range' | 'invalid' };

/** Builds a validated schedule through the shared planner, or a reason the
 * editor can show. */
export function buildTaskRecurrenceSchedule(
  choice: TaskRecurrenceChoice,
  timing: TaskRecurrenceTimingDraft
): TaskRecurrenceBuildResult {
  const base = {
    timeZone: timing.timeZone,
    dueTime: timing.dueTime,
    startOffsetDays: timing.startOffsetDays,
  };
  try {
    if (choice.preset !== 'custom') {
      return {
        ok: true,
        schedule: buildTaskRecurrencePreset(
          choice.preset,
          timing.requestedDate,
          base
        ) as WorkspaceTaskRecurrenceSchedule,
      };
    }
    const { custom } = choice;
    const monthly =
      custom.frequency === 'monthly' || custom.frequency === 'yearly';
    return {
      ok: true,
      schedule: buildCustomTaskRecurrence(timing.requestedDate, {
        ...base,
        frequency: custom.frequency,
        interval: custom.interval,
        weekdays: custom.frequency === 'weekly' ? custom.weekdays : undefined,
        monthDay: monthly ? custom.monthDay : undefined,
        end: custom.end,
      }) as WorkspaceTaskRecurrenceSchedule,
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof RangeError && /within/.test(error.message)
          ? 'until_range'
          : 'invalid',
    };
  }
}

export interface TaskRecurrencePreviewDate {
  date: string;
  /** The civil date is absent in the zone; the series records it as skipped. */
  skipped: boolean;
}

export interface TaskRecurrencePreview {
  dates: TaskRecurrencePreviewDate[];
  /** The picked date is not a repeat date, so the series starts later. */
  requestedSkipped: boolean;
}

export function previewTaskRecurrence(
  schedule: WorkspaceTaskRecurrenceSchedule,
  requestedDate: string,
  count = TASK_RECURRENCE_PREVIEW_COUNT
): TaskRecurrencePreview {
  const timing = {
    timeZone: schedule.rule.timeZone,
    dueTime: schedule.dueTime,
    startOffsetDays: schedule.startOffsetDays,
  };
  const dates = listTaskOccurrenceDates(schedule, {
    onOrAfter: schedule.anchorDate,
    limit: count,
  }).map((date) => ({
    date,
    skipped: isTaskOccurrenceSkipped(timing, date),
  }));
  return { dates, requestedSkipped: schedule.anchorDate !== requestedDate };
}

export interface TaskRecurrenceTemplateInput {
  name: string;
  description: string | null;
  priority: TaskPriority | null;
  estimationPoints: number | null | undefined;
  labels: ReadonlyArray<{ id: string }>;
  projects: ReadonlyArray<{ id: string }>;
  assignees: ReadonlyArray<{ id: string; user_id?: string | null }>;
}

const uniqueIds = (ids: string[]) =>
  [...new Set(ids)].slice(0, TASK_RECURRENCE_LIMITS.maxTemplateIds).sort();

/** The task fields a series copies into every generated task. */
export function taskRecurrenceTemplate(
  input: TaskRecurrenceTemplateInput
): WorkspaceTaskRecurrenceTemplate {
  return {
    title: input.name.trim(),
    description: input.description || null,
    priority: input.priority,
    estimate: input.estimationPoints ?? null,
    labels: uniqueIds(input.labels.map((label) => label.id)),
    projects: uniqueIds(input.projects.map((project) => project.id)),
    assignees: uniqueIds(
      input.assignees.map((assignee) => assignee.user_id || assignee.id)
    ),
  };
}

export function taskRecurrenceTemplatesDiffer(
  a: WorkspaceTaskRecurrenceTemplate,
  b: WorkspaceTaskRecurrenceTemplate
) {
  const sameIds = (x: string[], y: string[]) => {
    const ys = new Set(y);
    return x.length === ys.size && x.every((id) => ys.has(id));
  };
  return !(
    a.title === b.title &&
    (a.description ?? null) === (b.description ?? null) &&
    (a.priority ?? null) === (b.priority ?? null) &&
    (a.estimate ?? null) === (b.estimate ?? null) &&
    sameIds(a.labels, b.labels) &&
    sameIds(a.projects, b.projects) &&
    sameIds(a.assignees, b.assignees)
  );
}

/** The schedule stored on a series, in the planner's shape. */
export function taskRecurrenceScheduleFromEntry(entry: {
  rule?: CalendarRecurrenceRule;
  anchor_date?: string;
  due_time?: string | null;
  start_offset_days?: number;
}): WorkspaceTaskRecurrenceSchedule | null {
  if (!entry.rule || !entry.anchor_date) return null;
  return {
    rule: entry.rule,
    anchorDate: entry.anchor_date,
    dueTime: entry.due_time ? entry.due_time.slice(0, 5) : null,
    startOffsetDays: entry.start_offset_days ?? 0,
  };
}

/** The picker state that reproduces a stored schedule. */
export function taskRecurrenceChoiceFromSchedule(
  schedule: WorkspaceTaskRecurrenceSchedule
): TaskRecurrenceChoice {
  let preset: TaskRecurrencePreset | 'custom' = 'custom';
  try {
    preset = detectTaskRecurrencePreset(schedule);
  } catch {
    // An unreadable rule opens in the custom editor.
  }
  if (preset !== 'custom') return { preset };
  const { rule, anchorDate } = schedule;
  return {
    preset: 'custom',
    custom: {
      frequency: rule.frequency,
      interval: rule.interval,
      weekdays: rule.weekdays?.length
        ? [...rule.weekdays]
        : [taskRecurrenceWeekday(anchorDate)],
      monthDay: rule.monthDay ?? Number(anchorDate.slice(8, 10)),
      end: rule.end,
    },
  };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Timing for editing a series from one of its tasks. The server rejects an
 * anchor on or before a date it already created, so a changed schedule
 * starts the day after this task's date. */
export function taskRecurrenceTimingFromSchedule(
  schedule: WorkspaceTaskRecurrenceSchedule,
  occurrenceDate: string
): TaskRecurrenceTimingDraft {
  return {
    requestedDate: addDays(occurrenceDate, 1),
    timeZone: schedule.rule.timeZone,
    dueTime: schedule.dueTime,
    startOffsetDays: schedule.startOffsetDays,
  };
}

/** The stored schedule re-anchored on its first date after this task, which
 * keeps the interval phase for a template-only edit. Null once it ends. */
export function taskRecurrenceScheduleAfter(
  schedule: WorkspaceTaskRecurrenceSchedule,
  occurrenceDate: string
): WorkspaceTaskRecurrenceSchedule | null {
  try {
    const next = nextTaskOccurrenceDate(schedule, { after: occurrenceDate });
    return next ? { ...schedule, anchorDate: next } : null;
  } catch {
    return null;
  }
}
