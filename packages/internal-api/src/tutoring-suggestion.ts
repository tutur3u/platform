import {
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

      const rule = policy.timeRules.find(
        (entry) =>
          entry.weekdays.includes(weekdayOf(local.date)) &&
          entry.classStartTime === local.time
      );
      if (!rule && usesEasyCenterPresetShifts(policy)) continue;
      const duration = rule?.durationMinutes ?? policy.durationMinutes;
      const anchor = rule
        ? minutesOf(rule.tutoringStartTime)
        : minutesOf(local.time) - Math.max(policy.leadMinutes, duration);
      const afterClass = Boolean(rule && anchor >= minutesOf(local.time));
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
          classStartsAt: local.time,
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
