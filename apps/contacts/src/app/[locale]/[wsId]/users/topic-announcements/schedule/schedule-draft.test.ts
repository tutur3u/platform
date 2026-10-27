import type { TopicScheduleSession } from '@tuturuuu/internal-api/topic-announcements';
import { describe, expect, it } from 'vitest';
import { buildMissingGvnnReminder } from './missing-gvnn';
import {
  countDraftChanges,
  draftFromSessions,
  draftGvcnId,
  draftSavePayload,
  newDraftSession,
  validateDraft,
} from './schedule-draft';

function saved(
  overrides: Partial<TopicScheduleSession> = {}
): TopicScheduleSession {
  return {
    classLabel: 'K1',
    durationMinutes: 30,
    endTime: '18:00',
    groupId: 'k1',
    gvnnContactId: 'anna',
    hasTopic: false,
    id: 's1',
    place: 'Campus A',
    room: '101',
    sentAt: null,
    sessionDate: '2026-11-10',
    startTime: '17:30',
    status: 'draft',
    teacherWorkspaceUserId: 't1',
    ...overrides,
  };
}

describe('schedule draft', () => {
  it('defaults a new session to 30 minutes with no GVNN', () => {
    const row = newDraftSession('new:1', '2026-11-03');
    expect(row).toMatchObject({
      durationMinutes: 30,
      gvnnContactId: null,
      id: null,
      sessionDate: '2026-11-03',
    });
  });

  it('sends only new, changed and removed rows', () => {
    const original = draftFromSessions([
      saved(),
      saved({ id: 's2', startTime: '18:30' }),
    ]);
    const rows = [
      { ...original[0]!, gvnnContactId: 'ben' },
      { ...newDraftSession('new:1', '2026-11-17'), groupId: 'k1' },
    ];
    const { payload, sessionKeys } = draftSavePayload(
      rows,
      original,
      '2026-11'
    );
    expect(payload.deleteIds).toEqual(['s2']);
    expect(payload.sessions).toEqual([
      expect.objectContaining({ gvnnContactId: 'ben', id: 's1' }),
      expect.objectContaining({
        durationMinutes: 30,
        gvnnContactId: null,
        groupId: 'k1',
      }),
    ]);
    expect(payload.sessions[1]).not.toHaveProperty('id');
    expect(sessionKeys).toEqual(['s1', 'new:1']);
    expect(countDraftChanges(rows, original)).toBe(3);
    expect(countDraftChanges(original, original)).toBe(0);
  });

  it('never sends locked (already sent) sessions', () => {
    const original = draftFromSessions([saved({ status: 'sent' })]);
    const rows = [{ ...original[0]!, room: '202' }];
    expect(
      draftSavePayload(rows, original, '2026-11').payload.sessions
    ).toEqual([]);
  });

  it('flags blocking problems but not a missing GVNN', () => {
    const rows = [
      { ...newDraftSession('a', '2026-11-10'), groupId: 'k1' },
      { ...newDraftSession('b', '2026-11-10'), groupId: 'k1' },
      { ...newDraftSession('c', '2026-12-01'), groupId: null },
      {
        ...newDraftSession('d', '2026-11-11'),
        groupId: 'k2',
        startTime: '23:45',
      },
      {
        ...newDraftSession('e', '2026-11-12'),
        durationMinutes: 0,
        groupId: 'k2',
      },
    ];
    const issues = validateDraft(rows, '2026-11');
    expect(issues.get('a')).toEqual(['duplicate_slot']);
    expect(issues.get('b')).toEqual(['duplicate_slot']);
    expect(issues.get('c')).toEqual(['missing_class', 'outside_month']);
    expect(issues.get('d')).toEqual(['ends_after_midnight']);
    expect(issues.get('e')).toEqual(['invalid_duration']);
    expect(validateDraft([{ ...rows[0]! }], '2026-11').size).toBe(0);
  });

  it('shows the saved GVCN, or the class GVCN for new rows and class changes', () => {
    const classById = new Map([
      ['k1', { id: 'k1', name: 'K1', primaryTeacherId: 't9', teachers: [] }],
      ['k2', { id: 'k2', name: 'K2', primaryTeacherId: null, teachers: [] }],
    ]);
    const [original] = draftFromSessions([saved()]);
    expect(draftGvcnId(original!, original, classById)).toBe('t1');
    expect(
      draftGvcnId({ ...original!, groupId: 'k2' }, original, classById)
    ).toBeNull();
    const fresh = { ...newDraftSession('n', '2026-11-03'), groupId: 'k1' };
    expect(draftGvcnId(fresh, undefined, classById)).toBe('t9');
  });
});

describe('missing GVNN reminder', () => {
  const classLabel = (groupId: string | null) => groupId ?? 'No class';

  it('lists sessions without a GVNN by class, in date order', () => {
    const rows = draftFromSessions([
      saved({
        gvnnContactId: null,
        groupId: 'k2',
        id: 'a',
        sessionDate: '2026-11-20',
      }),
      saved({
        gvnnContactId: null,
        groupId: 'k2',
        id: 'b',
        sessionDate: '2026-11-06',
      }),
      saved({ gvnnContactId: null, groupId: 'k1', id: 'c' }),
      saved({ id: 'd' }),
      saved({ gvnnContactId: null, id: 'e', status: 'sent' }),
    ]);
    const reminder = buildMissingGvnnReminder(rows, { classLabel });
    expect(reminder.total).toBe(3);
    expect(reminder.classes.map((entry) => entry.label)).toEqual(['k1', 'k2']);
    expect(reminder.classes[1]!.sessions.map((row) => row.key)).toEqual([
      'b',
      'a',
    ]);
  });

  it('leaves out classes marked as not needing a GVNN', () => {
    const rows = draftFromSessions([
      saved({ gvnnContactId: null, groupId: 'k1', id: 'a' }),
      saved({ gvnnContactId: null, groupId: 'k2', id: 'b' }),
    ]);
    const reminder = buildMissingGvnnReminder(rows, {
      classLabel,
      exemptGroupIds: new Set(['k1']),
    });
    expect(reminder.total).toBe(1);
    expect(reminder.classes[0]!.groupId).toBe('k2');
  });
});
