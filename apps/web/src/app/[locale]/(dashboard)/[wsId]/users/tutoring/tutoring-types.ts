import type {
  TutoringAttendanceStatus,
  TutoringQueueItem,
  TutoringReasonType,
  TutoringSessionRecord,
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
};

export const STATUS_ACTIONS: TutoringAttendanceStatus[] = [
  'PENDING',
  'DONE',
  'NO_SHOW',
  'CANCELLED',
];

export function getDisplayName(
  user: WorkspaceBasicUserRecord | null | undefined
) {
  if (!user) return '-';
  return user.full_name ?? user.display_name ?? user.email ?? '-';
}

export function toDetailedRows(sessions: TutoringSessionRecord[]) {
  return sessions.map((session) => ({
    AttendanceStatus: session.attendance_status,
    Content: session.content,
    Date: session.session_date,
    DurationMinutes: session.duration_minutes,
    Group: session.group?.name ?? '-',
    ReasonType: session.reason_type,
    Student: getDisplayName(session.student),
    Teacher: getDisplayName(session.teacher),
    Time: String(session.start_time).slice(0, 5),
  }));
}

export function toPayrollRows(sessions: TutoringSessionRecord[]) {
  const map = new Map<
    string,
    { completed_sessions: number; teacher_name: string; total_minutes: number }
  >();

  for (const session of sessions) {
    if (session.attendance_status !== 'DONE') continue;
    const teacherName = getDisplayName(session.teacher);
    const current = map.get(teacherName) ?? {
      completed_sessions: 0,
      teacher_name: teacherName,
      total_minutes: 0,
    };
    current.completed_sessions += 1;
    current.total_minutes += session.duration_minutes;
    map.set(teacherName, current);
  }

  return [...map.values()].sort((a, b) =>
    a.teacher_name.localeCompare(b.teacher_name)
  );
}

export function queueSummary(queue: TutoringQueueItem[]) {
  const absent = queue.filter(
    (item) => item.reason_type !== 'WEAK_SUPPORT'
  ).length;
  const weak = queue.filter(
    (item) => item.reason_type !== 'ABSENT_RECOVERY'
  ).length;
  return { absent, weak };
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

function slotsOverlap(
  startMinutesA: number,
  durationMinutesA: number,
  startMinutesB: number,
  durationMinutesB: number
) {
  const endA = startMinutesA + durationMinutesA;
  const endB = startMinutesB + durationMinutesB;
  return startMinutesA < endB && startMinutesB < endA;
}

export function findSessionSlotConflicts(
  form: TutoringFormValues
): TutoringSessionSlotConflict[] {
  const conflicts: TutoringSessionSlotConflict[] = [];
  const { sessionSlots } = form;

  for (let i = 0; i < sessionSlots.length; i += 1) {
    const current = sessionSlots[i];
    const currentStart = current ? parseTimeToMinutes(current.startTime) : null;

    if (!current || currentStart === null || !current.sessionDate) {
      continue;
    }

    for (let j = i + 1; j < sessionSlots.length; j += 1) {
      const next = sessionSlots[j];
      const nextStart = next ? parseTimeToMinutes(next.startTime) : null;

      if (!next || nextStart === null || !next.sessionDate) {
        continue;
      }

      if (current.sessionDate !== next.sessionDate) {
        continue;
      }

      if (
        !slotsOverlap(
          currentStart,
          current.durationMinutes,
          nextStart,
          next.durationMinutes
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
