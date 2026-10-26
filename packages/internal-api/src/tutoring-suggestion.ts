import {
  getAssignedTutoringShift,
  STANDARD_TUTORING_POLICY,
  type TutoringPolicy,
  usesEasyCenterPresetShifts,
} from './tutoring-policy';
import type { WorkspaceUserGroupSession } from './user-group-schedule';

export interface TutoringSuggestion {
  sessionDate: string;
  startTime: string;
  classStartsAt: string;
  durationMinutes?: number;
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
}

/** Suggest 45 minutes immediately before the next scheduled class after an absence. */
export function suggestTutoringBeforeNextClass(
  sessions: WorkspaceUserGroupSession[],
  missedDate: string,
  now = new Date()
): TutoringSuggestion | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(missedDate)) return null;

  const candidates = sessions
    .filter((session) => session.status === 'scheduled')
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  for (const session of candidates) {
    const classStart = new Date(session.startsAt);
    if (Number.isNaN(classStart.getTime())) continue;

    const suggestedStart = new Date(classStart.getTime() - 45 * 60_000);
    if (suggestedStart <= now) continue;

    try {
      const classLocal = localParts(classStart, session.startTimezone);
      if (classLocal.date <= missedDate) continue;
      const suggestedLocal = localParts(suggestedStart, session.startTimezone);
      return {
        classStartsAt: classLocal.time,
        sessionDate: suggestedLocal.date,
        startTime: suggestedLocal.time,
      };
    } catch {
      // A malformed timezone should never create a misleading suggestion.
    }
  }

  return null;
}

function minutesOf(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function timeOf(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Build editable suggestions, never persisted sessions. */
export function suggestTutoringSlots(
  sessions: WorkspaceUserGroupSession[],
  missedDate: string,
  count: number,
  policy: TutoringPolicy = STANDARD_TUTORING_POLICY,
  mode: 'separate' | 'consecutive' = 'separate',
  now = new Date()
): TutoringSuggestion[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(missedDate) || count < 1) return [];

  const candidates = sessions
    .filter((session) => session.status === 'scheduled')
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const suggestions: TutoringSuggestion[] = [];
  const seen = new Set<string>();

  for (const session of candidates) {
    const classStart = new Date(session.startsAt);
    if (Number.isNaN(classStart.getTime())) continue;

    try {
      const local = localParts(classStart, session.startTimezone);
      if (local.date <= missedDate || seen.has(`${local.date}:${local.time}`))
        continue;
      seen.add(`${local.date}:${local.time}`);

      // A group assigned to a shift follows that shift on its tutoring days,
      // even when its calendar holds placeholder clock times.
      const assigned = getAssignedTutoringShift(policy, session.groupId);
      if (assigned && !assigned.weekdays.includes(weekdayOf(local.date)))
        continue;
      const rule =
        assigned ??
        policy.timeRules.find(
          (entry) =>
            entry.weekdays.includes(weekdayOf(local.date)) &&
            entry.classStartTime === local.time
        );
      if (!rule && usesEasyCenterPresetShifts(policy)) continue;
      const classTime = assigned?.classStartTime ?? local.time;
      const duration = rule?.durationMinutes ?? policy.durationMinutes;
      const anchor = rule
        ? minutesOf(rule.tutoringStartTime)
        : minutesOf(local.time) - Math.max(policy.leadMinutes, duration);
      const afterClass = Boolean(rule && anchor >= minutesOf(classTime));
      const slotsForClass = mode === 'consecutive' ? count : 1;
      const proposed: TutoringSuggestion[] = [];

      for (let index = 0; index < slotsForClass; index += 1) {
        const start =
          mode === 'consecutive'
            ? afterClass
              ? anchor + index * duration
              : anchor - (slotsForClass - 1 - index) * duration
            : anchor;
        if (start < 0 || start + duration > 1440) {
          proposed.length = 0;
          break;
        }
        const startTime = timeOf(start);
        const localNow = localParts(now, session.startTimezone);
        if (
          `${local.date}T${startTime}` <= `${localNow.date}T${localNow.time}`
        ) {
          proposed.length = 0;
          break;
        }
        proposed.push({
          classStartsAt: classTime,
          durationMinutes: duration,
          sessionDate: local.date,
          startTime,
        });
      }

      if (!proposed.length) continue;
      suggestions.push(...proposed);
      if (suggestions.length >= count) return suggestions.slice(0, count);
    } catch {
      // Invalid timezone data is ignored; staff can still enter a slot manually.
    }
  }

  return suggestions;
}

function zonedTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    Math.floor(minutesOf(time) / 60),
    minutesOf(time) % 60
  );
  let guess = target;
  // Two passes settle the offset, including around a daylight-saving change.
  for (let pass = 0; pass < 2; pass += 1) {
    const local = localParts(new Date(guess), timeZone);
    const shown = Date.parse(`${local.date}T${local.time}:00Z`);
    guess += target - shown;
  }
  return new Date(guess);
}

/**
 * Class occurrences implied by a group's assigned shift. Use them only when the
 * group calendar has no scheduled classes in the window; they are never stored.
 */
export function buildShiftRuleSessions({
  days,
  fromDate,
  groupId,
  policy,
  timeZone = 'Asia/Ho_Chi_Minh',
}: {
  days: number;
  fromDate: string;
  groupId: string;
  policy: TutoringPolicy;
  timeZone?: string;
}): WorkspaceUserGroupSession[] {
  const rule = getAssignedTutoringShift(policy, groupId);
  if (!rule || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return [];
  const sessions: WorkspaceUserGroupSession[] = [];
  const start = Date.parse(`${fromDate}T12:00:00Z`);
  for (let offset = 0; offset <= Math.min(days, 180); offset += 1) {
    const date = new Date(start + offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (!rule.weekdays.includes(weekdayOf(date))) continue;
    try {
      const startsAt = zonedTimeToUtc(date, rule.classStartTime, timeZone);
      const endsAt = zonedTimeToUtc(
        date,
        rule.classEndTime ?? rule.classStartTime,
        timeZone
      );
      sessions.push({
        description: null,
        descriptionJson: null,
        endTimezone: timeZone,
        endsAt: endsAt.toISOString(),
        files: [],
        groupId,
        groupName: null,
        id: `shift-rule:${date}`,
        recurrenceInstanceDate: null,
        seriesId: null,
        source: 'tutoring_shift_rule',
        startTimezone: timeZone,
        startsAt: startsAt.toISOString(),
        status: 'scheduled',
        tags: [],
        title: rule.label ?? null,
      });
    } catch {
      return [];
    }
  }
  return sessions;
}

export {
  rankTutoringDraftChoices,
  type TutoringDraftChoice,
} from './tutoring-draft-plan';
