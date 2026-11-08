import type {
  ScheduleClass,
  ScheduleSession,
} from '@tuturuuu/utils/topic-schedule';
import { describe, expect, it } from 'vitest';
import { planScheduleClone } from './clone-plan';

const classes: ScheduleClass[] = [
  { id: 'k1', name: 'K1', primaryTeacherId: 't1', teachers: [] },
];

function source(id: string, overrides: Partial<ScheduleSession> = {}) {
  return {
    classLabel: 'K1',
    durationMinutes: 30,
    endTime: '18:00',
    groupId: 'k1',
    gvnnContactId: 'g1',
    hasTopic: false,
    id,
    place: null,
    room: null,
    sentAt: null,
    sessionDate: '2026-10-13',
    startTime: '17:30',
    status: 'draft',
    teacherWorkspaceUserId: 't1',
    ...overrides,
  } satisfies ScheduleSession;
}

describe('planScheduleClone', () => {
  it('creates each target slot once within one run', () => {
    const plan = planScheduleClone({
      classes,
      sourceSessions: [source('a'), source('b', { startTime: '17:30:00' })],
      targetMonth: '2026-11',
      targetSessions: [],
    });
    expect(plan.map((item) => item.status)).toEqual(['create', 'exists']);
    expect(plan[0]!.targetDate).toBe('2026-11-10');
  });

  it('marks sessions of a class that no longer exists', () => {
    const plan = planScheduleClone({
      classes,
      sourceSessions: [
        source('a', { groupId: 'gone' }),
        source('b', { groupId: null }),
      ],
      targetMonth: '2026-11',
      targetSessions: [],
    });
    expect(plan.map((item) => [item.status, item.reason])).toEqual([
      ['unplaced', 'class_removed'],
      ['unplaced', 'class_removed'],
    ]);
  });

  it('skips slots removed from the target unless asked to include them', () => {
    const removed = [
      source('r', { sessionDate: '2026-11-10', status: 'cancelled' }),
    ];
    const input = {
      classes,
      removedTargetSessions: removed,
      sourceSessions: [source('a')],
      targetMonth: '2026-11',
      targetSessions: [],
    };
    expect(planScheduleClone(input)[0]!.status).toBe('removed');
    expect(
      planScheduleClone({ ...input, includeRemoved: true })[0]!.status
    ).toBe('create');
  });
});
