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
  sessionSlots: {
    sessionDate: string;
    startTime: string;
    durationMinutes: number;
  }[];
  reasonType: TutoringReasonType;
  reasonDetail: string;
  content: string;
}

export const DEFAULT_FORM: TutoringFormValues = {
  groupId: '',
  studentUserId: '',
  sessionSlots: [
    {
      sessionDate: '',
      startTime: '18:00',
      durationMinutes: 45,
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
