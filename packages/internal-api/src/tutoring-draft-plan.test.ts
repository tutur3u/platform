import { describe, expect, it } from 'vitest';
import { rankTutoringDraftChoices } from './tutoring-draft-plan';

const teachers = ['b', 'a'].map((id) => ({
  id,
  full_name: null,
  display_name: null,
}));
const suggestion = {
  sessionDate: '2030-01-07',
  startTime: '17:15',
  durationMinutes: 45,
  classStartsAt: '18:00',
};
const input = {
  suggestions: [suggestion],
  teachers,
  sessions: [],
  studentId: 'learner',
  fromDate: '2030-01-01',
  toDate: '2030-01-31',
};
const busy = {
  session_date: '2030-01-07',
  start_time: '17:30:00',
  duration_minutes: 30,
  teacher_user_id: 'a',
  student_user_id: 'other',
  attendance_status: 'PENDING' as const,
};
describe('bounded tutoring draft choices', () => {
  it('ranks stable explicit teacher choices, without mutating data', () => {
    expect(
      rankTutoringDraftChoices(input)[0]?.teachers.map((t) => t.id)
    ).toEqual(['a', 'b']);
    expect(teachers.map((t) => t.id)).toEqual(['b', 'a']);
  });
  it('excludes recorded teacher conflicts across groups', () =>
    expect(
      rankTutoringDraftChoices({ ...input, sessions: [busy] })[0]?.teachers.map(
        (t) => t.id
      )
    ).toEqual(['b']));
  it('excludes student conflicts regardless of teacher', () =>
    expect(
      rankTutoringDraftChoices({
        ...input,
        sessions: [{ ...busy, student_user_id: 'learner' }],
      })
    ).toEqual([]));
  it('allows exact back-to-back half-open intervals', () =>
    expect(
      rankTutoringDraftChoices({
        ...input,
        sessions: [{ ...busy, start_time: '18:00' }],
      })[0]?.teachers
    ).toHaveLength(2));
  it('conservatively follows creation conflict checks for all recorded statuses', () => {
    expect(
      rankTutoringDraftChoices({
        ...input,
        sessions: [{ ...busy, attendance_status: 'CANCELLED' }],
      })[0]?.teachers
    ).toHaveLength(1);
    expect(
      rankTutoringDraftChoices({
        ...input,
        sessions: [{ ...busy, attendance_status: 'DONE' }],
      })[0]?.teachers
    ).toHaveLength(1);
  });
  it('handles prior-day overnight conflicts', () =>
    expect(
      rankTutoringDraftChoices({
        ...input,
        suggestions: [{ ...suggestion, startTime: '00:15' }],
        sessions: [
          {
            ...busy,
            session_date: '2030-01-06',
            start_time: '23:45',
            duration_minutes: 60,
          },
        ],
      })[0]?.teachers.map((t) => t.id)
    ).toEqual(['b']));
  it('fails closed for malformed occupancy and missing teachers', () => {
    expect(
      rankTutoringDraftChoices({
        ...input,
        sessions: [{ ...busy, start_time: 'invalid' }],
      })
    ).toEqual([]);
    expect(rankTutoringDraftChoices({ ...input, teachers: [] })).toEqual([]);
  });
  it('never offers dates outside the policy horizon or duplicate slots', () => {
    expect(
      rankTutoringDraftChoices({ ...input, toDate: '2030-01-06' })
    ).toEqual([]);
    expect(
      rankTutoringDraftChoices({
        ...input,
        suggestions: [suggestion, suggestion],
      })
    ).toHaveLength(1);
  });
  it('caps distinct ranked choices at 50 and validates actual calendar dates', () => {
    const suggestions = Array.from({ length: 60 }, (_, index) => ({
      ...suggestion,
      sessionDate: new Date(Date.UTC(2030, 0, 1 + index))
        .toISOString()
        .slice(0, 10),
    }));
    expect(
      rankTutoringDraftChoices({ ...input, suggestions, toDate: '2030-12-31' })
    ).toHaveLength(50);
    expect(
      rankTutoringDraftChoices({
        ...input,
        suggestions: [{ ...suggestion, sessionDate: '2030-02-30' }],
        toDate: '2030-12-31',
      })
    ).toEqual([]);
  });
});
