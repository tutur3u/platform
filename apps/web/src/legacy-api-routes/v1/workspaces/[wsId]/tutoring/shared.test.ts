import { describe, expect, it } from 'vitest';
import {
  findConflictsWithExistingSessions,
  TutoringSessionListQuerySchema,
} from './shared';

describe('TutoringSessionListQuerySchema', () => {
  it('keeps the legacy newest-first ordering when sortOrder is omitted', () => {
    const parsed = TutoringSessionListQuerySchema.parse({});
    expect(parsed.sortOrder).toBe('desc');
  });

  it('accepts an explicit chronological ordering', () => {
    expect(
      TutoringSessionListQuerySchema.parse({ sortOrder: 'asc' }).sortOrder
    ).toBe('asc');
  });

  it('rejects an unknown ordering rather than silently defaulting', () => {
    expect(
      TutoringSessionListQuerySchema.safeParse({ sortOrder: 'sideways' })
        .success
    ).toBe(false);
  });
});

describe('findConflictsWithExistingSessions', () => {
  it('omits existing session identifiers from conflict payloads', () => {
    const existingSessions = [
      {
        duration_minutes: 45,
        id: 'existing-session-id',
        session_date: '2026-06-02',
        start_time: '09:00',
        student_user_id: 'student-1',
        teacher_user_id: 'teacher-1',
      },
    ];

    const conflicts = findConflictsWithExistingSessions(
      [
        {
          durationMinutes: 45,
          sessionDate: '2026-06-02',
          startTime: '09:15',
          studentUserId: 'student-1',
          teacherUserId: 'teacher-1',
        },
      ],
      existingSessions
    );

    expect(conflicts).toEqual([
      {
        conflictType: 'teacher',
        durationMinutes: 45,
        sessionDate: '2026-06-02',
        startTime: '09:15',
        studentUserId: 'student-1',
        teacherUserId: 'teacher-1',
      },
    ]);
    expect(conflicts[0]).not.toHaveProperty('conflictWithId');
  });
});
