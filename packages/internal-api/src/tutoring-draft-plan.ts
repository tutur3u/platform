import type { TutoringSessionRecord, TutoringTeacher } from './tutoring';
import type { TutoringSuggestion } from './tutoring-suggestion';

export interface TutoringDraftChoice extends TutoringSuggestion {
  teachers: TutoringTeacher[];
}

type RecordedSession = Pick<
  TutoringSessionRecord,
  | 'session_date'
  | 'start_time'
  | 'duration_minutes'
  | 'teacher_user_id'
  | 'student_user_id'
  | 'attendance_status'
>;

function range(date: string, time: string, duration: number) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)
  )
    return null;
  const [hour, minute, second = 0] = time.split(':').map(Number);
  if (
    hour === undefined ||
    minute === undefined ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 480
  )
    return null;
  const start =
    Date.parse(`${date}T00:00:00Z`) / 60_000 + hour * 60 + minute + second / 60;
  return Number.isFinite(start) &&
    new Date(start * 60_000).toISOString().slice(0, 10) === date
    ? ([start, start + duration] as const)
    : null;
}

/** Recorded tutoring conflicts only; class, room and contractual availability are unknown. */
export function rankTutoringDraftChoices({
  suggestions,
  teachers,
  sessions,
  studentId,
  fromDate,
  toDate,
}: {
  suggestions: TutoringSuggestion[];
  teachers: TutoringTeacher[];
  sessions: RecordedSession[];
  studentId: string;
  fromDate: string;
  toDate: string;
}): TutoringDraftChoice[] {
  const catalog = [
    ...new Map(teachers.filter((t) => t.id).map((t) => [t.id, t])).values(),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const occupied = sessions.map((s) => ({
    session: s,
    range: range(s.session_date, s.start_time, s.duration_minutes),
  }));
  // Incomplete/malformed conflict records cannot safely become free time.
  if (occupied.some((s) => !s.range)) return [];
  const seen = new Set<string>();
  return [...suggestions]
    .sort((a, b) =>
      `${a.sessionDate}T${a.startTime}`.localeCompare(
        `${b.sessionDate}T${b.startTime}`
      )
    )
    .flatMap((suggestion) => {
      const slot = range(
        suggestion.sessionDate,
        suggestion.startTime,
        suggestion.durationMinutes ?? 45
      );
      const key = `${suggestion.sessionDate}:${suggestion.startTime}:${suggestion.durationMinutes}`;
      if (
        !slot ||
        suggestion.sessionDate < fromDate ||
        suggestion.sessionDate > toDate ||
        seen.has(key)
      )
        return [];
      seen.add(key);
      const overlaps = occupied.filter(
        (s) => s.range && slot[0] < s.range[1] && s.range[0] < slot[1]
      );
      if (overlaps.some((s) => s.session.student_user_id === studentId))
        return [];
      const choices = catalog.filter(
        (t) => !overlaps.some((s) => s.session.teacher_user_id === t.id)
      );
      return choices.length ? [{ ...suggestion, teachers: choices }] : [];
    })
    .slice(0, 50);
}
