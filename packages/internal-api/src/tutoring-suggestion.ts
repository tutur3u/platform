import type { WorkspaceUserGroupSession } from './user-group-schedule';

export interface TutoringSuggestion {
  sessionDate: string;
  startTime: string;
  classStartsAt: string;
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
