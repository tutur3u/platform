import type {
  TutoringReasonType,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';

export interface TutoringFormValues {
  groupId: string;
  studentUserId: string;
  studentLabel?: string;
  sessionSlots: {
    sessionDate: string;
    startTime: string;
    durationMinutes: number;
    teacherUserId: string;
  }[];
  reasonType: TutoringReasonType;
  reasonDetail: string;
  content: string;
  sourceFeedbackId?: string | null;
}

export interface TutoringSessionSlotConflict {
  firstIndex: number;
  secondIndex: number;
  conflictType: 'teacher' | 'student';
}

export const DEFAULT_FORM: TutoringFormValues = {
  groupId: '',
  studentUserId: '',
  studentLabel: undefined,
  sessionSlots: [
    {
      sessionDate: '',
      startTime: '18:00',
      durationMinutes: 45,
      teacherUserId: '',
    },
  ],
  reasonType: 'CUSTOM',
  reasonDetail: '',
  content: '',
  sourceFeedbackId: null,
};

export function getDisplayName(
  user: WorkspaceBasicUserRecord | null | undefined
) {
  if (!user) return '-';
  const fullName = user.full_name?.trim();
  if (fullName) return fullName;

  const displayName = user.display_name?.trim();
  if (displayName) return displayName;

  const email = user.email?.trim();
  if (email) return email;

  return '-';
}

function parseTimeToMinutes(time: string) {
  const normalized = time.trim();
  const meridiemMatch = normalized.match(/\s?(AM|PM)$/i);
  const meridiem = meridiemMatch?.[1]?.toUpperCase();
  const timePart = meridiem
    ? normalized.slice(0, meridiemMatch?.index ?? normalized.length).trim()
    : normalized;
  const [rawHour = '0', rawMinute = '0'] = timePart.split(':');
  let hour = Number.parseInt(rawHour, 10);
  const minute = Number.parseInt(rawMinute, 10);

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    if (meridiem === 'AM') {
      hour = hour % 12;
    } else {
      hour = (hour % 12) + 12;
    }
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

function dateStringToDayNumber(dateString: string) {
  const [year, month, day] = dateString
    .split('-')
    .map((part) => Number.parseInt(part, 10));

  if (!(year && month && day)) {
    return null;
  }

  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function slotsOverlap(
  absoluteStartMinutesA: number,
  absoluteEndMinutesA: number,
  absoluteStartMinutesB: number,
  absoluteEndMinutesB: number
) {
  return (
    absoluteStartMinutesA < absoluteEndMinutesB &&
    absoluteStartMinutesB < absoluteEndMinutesA
  );
}

export function findSessionSlotConflicts(
  form: TutoringFormValues
): TutoringSessionSlotConflict[] {
  const conflicts: TutoringSessionSlotConflict[] = [];
  const { sessionSlots } = form;

  for (let i = 0; i < sessionSlots.length; i += 1) {
    const current = sessionSlots[i];
    const currentStart = current ? parseTimeToMinutes(current.startTime) : null;
    const currentDay = current
      ? dateStringToDayNumber(current.sessionDate)
      : null;

    if (
      !current ||
      currentStart === null ||
      currentDay === null ||
      !current.sessionDate
    ) {
      continue;
    }
    const currentAbsoluteStart = currentDay * 1440 + currentStart;
    const currentAbsoluteEnd = currentAbsoluteStart + current.durationMinutes;

    for (let j = i + 1; j < sessionSlots.length; j += 1) {
      const next = sessionSlots[j];
      const nextStart = next ? parseTimeToMinutes(next.startTime) : null;
      const nextDay = next ? dateStringToDayNumber(next.sessionDate) : null;

      if (
        !next ||
        nextStart === null ||
        nextDay === null ||
        !next.sessionDate
      ) {
        continue;
      }
      const nextAbsoluteStart = nextDay * 1440 + nextStart;
      const nextAbsoluteEnd = nextAbsoluteStart + next.durationMinutes;

      if (
        !slotsOverlap(
          currentAbsoluteStart,
          currentAbsoluteEnd,
          nextAbsoluteStart,
          nextAbsoluteEnd
        )
      ) {
        continue;
      }

      if (
        current.teacherUserId &&
        next.teacherUserId &&
        current.teacherUserId === next.teacherUserId
      ) {
        conflicts.push({
          conflictType: 'teacher',
          firstIndex: i,
          secondIndex: j,
        });
      }

      if (form.studentUserId) {
        conflicts.push({
          conflictType: 'student',
          firstIndex: i,
          secondIndex: j,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Slot indexes involved in at least one overlap, so the editor can highlight
 * the offending rows instead of only naming them in a message below the form.
 */
export function getConflictingSlotIndexes(form: TutoringFormValues) {
  const indexes = new Set<number>();

  for (const conflict of findSessionSlotConflicts(form)) {
    indexes.add(conflict.firstIndex);
    indexes.add(conflict.secondIndex);
  }

  return indexes;
}

/** Duration presets offered next to the free-form minutes input. */
export const DURATION_PRESETS = [30, 45, 60, 90, 120] as const;

export function nextWeeklySlot(
  slots: TutoringFormValues['sessionSlots'],
  fallbackTeacherId: string
) {
  const last = slots.at(-1);

  if (!last?.sessionDate) {
    return {
      durationMinutes: last?.durationMinutes ?? 45,
      sessionDate: '',
      startTime: last?.startTime ?? '18:00',
      teacherUserId: last?.teacherUserId || fallbackTeacherId,
    };
  }

  const [year, month, day] = last.sessionDate
    .split('-')
    .map((part) => Number.parseInt(part, 10));

  if (!(year && month && day)) {
    return { ...last, teacherUserId: last.teacherUserId || fallbackTeacherId };
  }

  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + 7);
  const nextMonth = `${next.getMonth() + 1}`.padStart(2, '0');
  const nextDay = `${next.getDate()}`.padStart(2, '0');

  return {
    durationMinutes: last.durationMinutes,
    sessionDate: `${next.getFullYear()}-${nextMonth}-${nextDay}`,
    startTime: last.startTime,
    teacherUserId: last.teacherUserId || fallbackTeacherId,
  };
}
