import { expect, it } from 'vitest';
import {
  calculateTutoringPayroll,
  type PayrollSession,
} from './tutoring-payroll';

const row: PayrollSession = {
  id: '1',
  teacher_user_id: 'teacher',
  session_date: '2026-10-01',
  start_time: '17:15:00',
  duration_minutes: 60,
  attendance_status: 'DONE',
  teacher: {
    id: 'teacher',
    full_name: 'Teacher',
    display_name: null,
    email: null,
  },
};
it('retains shared slot fractions and pending visits without pay', () => {
  const [result] = calculateTutoringPayroll(
    [
      row,
      { ...row, id: '2' },
      { ...row, id: '3', attendance_status: 'PENDING' },
      { ...row, id: '4', attendance_status: 'NO_SHOW' },
      { ...row, id: '5', attendance_status: 'CANCELLED' },
    ],
    '2026-10-30'
  );
  expect(result).toMatchObject({
    completed_sessions: 1,
    student_visits: 2,
    total_minutes: 60,
    total_cong: 60 / 45,
    pending_past: 1,
  });
});
it('preserves duration and overlap distinctions and independent unassigned rows', () => {
  const [result] = calculateTutoringPayroll(
    [
      row,
      { ...row, id: '2', duration_minutes: 45 },
      { ...row, id: '3', start_time: '17:30:00' },
    ],
    '2026-10-30'
  );
  expect(result?.total_minutes).toBe(165);
  const [unassigned] = calculateTutoringPayroll(
    [
      { ...row, teacher_user_id: null, teacher: null },
      { ...row, id: '2', teacher_user_id: null, teacher: null },
    ],
    '2026-10-30'
  );
  expect(unassigned?.completed_sessions).toBe(2);
});
