import type { Tables } from '@tuturuuu/types/supabase';

export type PayrollSession = Pick<
  Tables<{ schema: 'private' }, 'workspace_tutoring_sessions'>,
  | 'id'
  | 'teacher_user_id'
  | 'session_date'
  | 'start_time'
  | 'duration_minutes'
  | 'attendance_status'
> & {
  teacher: {
    id: string;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
};

export function calculateTutoringPayroll(
  rows: PayrollSession[],
  today: string
) {
  const teachers = new Map<
    string,
    {
      teacher_id: string | null;
      teacher_name: string;
      completed_sessions: number;
      student_visits: number;
      total_minutes: number;
      total_cong: number;
      pending_past: number;
      slots: {
        key: string;
        date: string;
        time: string;
        duration_minutes: number;
        learner_count: number;
        status: string;
        total_cong: number;
      }[];
    }
  >();
  const slotsByKey = new Map<
    string,
    NonNullable<ReturnType<typeof teachers.get>>['slots'][number]
  >();
  for (const row of rows) {
    const key = row.teacher?.id ?? 'unassigned';
    const teacher = row.teacher;
    const current: NonNullable<ReturnType<typeof teachers.get>> = teachers.get(
      key
    ) ?? {
      teacher_id: teacher?.id ?? null,
      teacher_name:
        teacher?.full_name?.trim() ||
        teacher?.display_name?.trim() ||
        teacher?.email?.trim() ||
        'N/A',
      completed_sessions: 0,
      student_visits: 0,
      total_minutes: 0,
      total_cong: 0,
      pending_past: 0,
      slots: [],
    };
    // Preserve the export's exact key, including duration and independent unassigned rows.
    const slotKey = row.teacher_user_id
      ? [
          row.teacher_user_id,
          row.session_date,
          String(row.start_time).slice(0, 5),
          row.duration_minutes,
          row.attendance_status,
        ].join(':')
      : row.id;
    const existing = slotsByKey.get(slotKey);
    if (existing) existing.learner_count += 1;
    else {
      const slot = {
        key: slotKey,
        date: row.session_date,
        time: String(row.start_time).slice(0, 5),
        duration_minutes: row.duration_minutes,
        learner_count: 1,
        status: row.attendance_status,
        total_cong:
          row.attendance_status === 'DONE' ? row.duration_minutes / 45 : 0,
      };
      current.slots.push(slot);
      slotsByKey.set(slotKey, slot);
    }
    if (row.attendance_status === 'DONE') {
      current.student_visits += 1;
      if (!existing) {
        current.completed_sessions += 1;
        current.total_minutes += row.duration_minutes;
      }
    }
    if (row.attendance_status === 'PENDING' && row.session_date < today)
      current.pending_past += 1;
    current.total_cong = current.total_minutes / 45;
    teachers.set(key, current);
  }
  return [...teachers.values()].sort((a, b) =>
    a.teacher_name.localeCompare(b.teacher_name)
  );
}
