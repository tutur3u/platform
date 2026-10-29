import { describe, expect, it } from 'vitest';
import {
  findConflictsWithExistingSessions,
  findConflictsWithinSlots,
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

describe('shared tutoring slot conflicts', () => {
  const slot = {
    groupId: 'group-a',
    sessionDate: '2030-01-07',
    startTime: '09:00',
    durationMinutes: 45,
    teacherUserId: 'teacher',
    studentUserId: 'student-1',
  };
  const recorded = (student: string) => ({
    group_id: slot.groupId,
    session_date: slot.sessionDate,
    start_time: '09:00:00',
    duration_minutes: 45,
    teacher_user_id: slot.teacherUserId,
    student_user_id: student,
  });
  it('accepts three learners sequentially and within one group slot batch', () => {
    const existing = [recorded('student-1')];
    expect(
      findConflictsWithExistingSessions(
        [{ ...slot, studentUserId: 'student-2' }],
        existing
      )
    ).toEqual([]);
    existing.push(recorded('student-2'));
    expect(
      findConflictsWithExistingSessions(
        [{ ...slot, studentUserId: 'student-3' }],
        existing
      )
    ).toEqual([]);
    expect(
      findConflictsWithinSlots(
        ['1', '2', '3'].map((studentUserId) => ({ ...slot, studentUserId }))
      )
    ).toEqual([]);
  });
  it('accepts learners from different groups in the same teacher slot', () => {
    const otherGroup = {
      ...slot,
      groupId: 'group-b',
      studentUserId: 'student-2',
    };
    expect(
      findConflictsWithExistingSessions([otherGroup], [recorded('student-1')])
    ).toEqual([]);
    expect(findConflictsWithinSlots([slot, otherGroup])).toEqual([]);
    expect(
      findConflictsWithExistingSessions(
        [{ ...slot, groupId: undefined, studentUserId: 'student-3' }],
        [recorded('student-1')]
      )
    ).toEqual([]);
  });
  it.each([
    { startTime: '09:15' },
    { durationMinutes: 60 },
    { durationMinutes: 30 },
    { startTime: '09:15', durationMinutes: 30 },
  ])('blocks a different overlapping session %j', (change) => {
    expect(
      findConflictsWithExistingSessions(
        [{ ...slot, ...change, studentUserId: 'student-2' }],
        [recorded('student-1')]
      )[0]?.conflictType
    ).toBe('teacher');
    expect(
      findConflictsWithinSlots([
        slot,
        { ...slot, ...change, studentUserId: 'student-2' },
      ])[0]?.conflictType
    ).toBe('teacher');
  });
  it('still blocks a learner already booked in the slot, in any group', () => {
    expect(
      findConflictsWithExistingSessions([slot], [recorded('student-1')])[0]
        ?.conflictType
    ).toBe('student');
    expect(
      findConflictsWithExistingSessions(
        [{ ...slot, groupId: 'group-b' }],
        [recorded('student-1')]
      )[0]?.conflictType
    ).toBe('student');
    expect(
      findConflictsWithinSlots([slot, { ...slot, teacherUserId: 'other' }])[0]
        ?.conflictType
    ).toBe('student');
  });
  it('blocks an overlapping booking even when an identical one is shared', () => {
    expect(
      findConflictsWithExistingSessions(
        [{ ...slot, studentUserId: 'student-3' }],
        [
          recorded('student-1'),
          { ...recorded('student-2'), start_time: '09:15:00' },
        ]
      ).map((conflict) => conflict.conflictType)
    ).toEqual(['teacher']);
  });
  it('allows back-to-back slots and ignores seconds when matching a slot', () => {
    expect(
      findConflictsWithExistingSessions(
        [{ ...slot, startTime: '09:45', studentUserId: 'student-1' }],
        [recorded('student-1')]
      )
    ).toEqual([]);
    expect(
      findConflictsWithExistingSessions(
        [{ ...slot, startTime: '09:00:30', studentUserId: 'student-2' }],
        [recorded('student-1')]
      )
    ).toEqual([]);
  });
  it('checks only the learner when no teacher is assigned', () => {
    const unassigned = { ...slot, startTime: '09:15', teacherUserId: null };
    expect(
      findConflictsWithExistingSessions(
        [{ ...unassigned, studentUserId: 'student-2' }],
        [recorded('student-1')]
      )
    ).toEqual([]);
    expect(
      findConflictsWithExistingSessions(
        [unassigned],
        [recorded('student-1')]
      )[0]?.conflictType
    ).toBe('student');
  });
});
