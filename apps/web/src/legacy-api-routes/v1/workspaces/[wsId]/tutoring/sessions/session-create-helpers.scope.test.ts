import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TutoringSessionCreateSchema } from '../shared';
import {
  buildTutoringSessionSlots,
  getAdjacentSessionDates,
  listGroupTeacherIds,
  listPotentialSchedulingConflicts,
  validateTutoringSessionScope,
} from './session-create-helpers';

const ids = {
  groupId: '11111111-1111-4111-8111-111111111111',
  studentUserId: '22222222-2222-4222-8222-222222222222',
  teacherUserId: '33333333-3333-4333-8333-333333333333',
  feedbackId: '44444444-4444-4444-8444-444444444444',
};

type Result = { data: unknown; error: unknown };

interface Recorder {
  calls: { table: string; filters: [string, unknown][] }[];
}

/**
 * A chainable Supabase stand-in: every table read replays the next queued
 * result, whether it ends in `maybeSingle()` or is awaited directly.
 */
function fakeClient(results: Result[]) {
  const recorder: Recorder = { calls: [] };
  const queue = [...results];
  const from = (table: string) => {
    const call = { table, filters: [] as [string, unknown][] };
    recorder.calls.push(call);
    const result = () => queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in']) {
      builder[method] = (column: string, value?: unknown) => {
        if (method !== 'select') call.filters.push([column, value]);
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve(result());
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    builder.then = (
      resolve: (value: Result) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result()).then(resolve, reject);
    return builder;
  };
  const client = { from, schema: () => ({ from }) };
  return { client: client as unknown as TypedSupabaseClient, recorder };
}

function parse(body: Record<string, unknown>) {
  return TutoringSessionCreateSchema.parse({
    groupId: ids.groupId,
    reasonType: 'ABSENT_RECOVERY',
    studentUserId: ids.studentUserId,
    ...body,
  });
}

async function statusOf(response: Response | null) {
  if (!response) return null;
  return { body: await response.json(), status: response.status };
}

afterEach(() => vi.restoreAllMocks());

describe('getAdjacentSessionDates', () => {
  it('returns the day before, the day itself and the day after', () => {
    expect(getAdjacentSessionDates('2026-10-31')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('crosses month and year boundaries and leap days', () => {
    expect(getAdjacentSessionDates('2026-12-31')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
    expect(getAdjacentSessionDates('2028-03-01')[0]).toBe('2028-02-29');
  });
});

describe('buildTutoringSessionSlots', () => {
  it('lays sequential sessions back to back from the start time', () => {
    const slots = buildTutoringSessionSlots(
      parse({
        durationMinutes: 45,
        sessionCount: 3,
        sessionDate: '2026-10-05',
        startTime: '17:30',
        teacherUserId: ids.teacherUserId,
      })
    );

    expect(slots?.map((slot) => slot.startTime)).toEqual([
      '17:30',
      '18:15',
      '19:00',
    ]);
    expect(slots?.every((slot) => slot.durationMinutes === 45)).toBe(true);
    expect(
      slots?.every((slot) => slot.teacherUserId === ids.teacherUserId)
    ).toBe(true);
  });

  it('rolls sequential sessions past midnight onto the next date', () => {
    const slots = buildTutoringSessionSlots(
      parse({
        durationMinutes: 60,
        sessionCount: 3,
        sessionDate: '2026-10-31',
        startTime: '23:00',
      })
    );

    expect(slots?.map((slot) => [slot.sessionDate, slot.startTime])).toEqual([
      ['2026-10-31', '23:00'],
      ['2026-11-01', '00:00'],
      ['2026-11-01', '01:00'],
    ]);
    expect(slots?.[0]?.teacherUserId).toBeNull();
  });

  it('reads a 12-hour start time', () => {
    const slots = buildTutoringSessionSlots(
      parse({ sessionDate: '2026-10-05', startTime: '5:30 PM' })
    );

    expect(slots?.[0]?.startTime).toBe('17:30');
  });

  it('returns null without a start date and time', () => {
    expect(buildTutoringSessionSlots(parse({}))).toBeNull();
    expect(
      buildTutoringSessionSlots(parse({ sessionDate: '2026-10-05' }))
    ).toBeNull();
  });

  it('keeps explicit slots and fills in the payload teacher only where missing', () => {
    const other = '55555555-5555-4555-8555-555555555555';
    const slots = buildTutoringSessionSlots(
      parse({
        sessions: [
          {
            durationMinutes: 60,
            sessionDate: '2026-10-05',
            startTime: '17:30',
          },
          {
            durationMinutes: 45,
            sessionDate: '2026-10-06',
            startTime: '17:30',
            teacherUserId: other,
          },
        ],
        teacherUserId: ids.teacherUserId,
      })
    );

    expect(slots?.map((slot) => slot.teacherUserId)).toEqual([
      ids.teacherUserId,
      other,
    ]);
    expect(slots?.map((slot) => slot.durationMinutes)).toEqual([60, 45]);
  });
});

describe('validateTutoringSessionScope', () => {
  const scope = (client: TypedSupabaseClient, body = {}) =>
    validateTutoringSessionScope({
      normalizedWsId: 'ws-1',
      payload: parse(body),
      supabase: client,
    });
  const found = { data: { id: 'x' }, error: null };

  it('passes when the group, learner and membership all belong to the workspace', async () => {
    const { client, recorder } = fakeClient([found, found, found]);

    await expect(scope(client)).resolves.toBeNull();
    expect(recorder.calls.map((call) => call.table)).toEqual([
      'workspace_user_groups',
      'workspace_users',
      'workspace_user_groups_users',
    ]);
    expect(recorder.calls[0]?.filters).toContainEqual(['ws_id', 'ws-1']);
  });

  it.each([
    ['group lookup fails', [{ data: null, error: new Error('db') }], 500],
    ['group is missing', [{ data: null, error: null }], 404],
    [
      'student lookup fails',
      [found, { data: null, error: new Error('db') }],
      500,
    ],
    ['student is missing', [found, { data: null, error: null }], 404],
    [
      'membership lookup fails',
      [found, found, { data: null, error: new Error('db') }],
      500,
    ],
    [
      'student is not in the group',
      [found, found, { data: null, error: null }],
      400,
    ],
  ] as [string, Result[], number][])(
    'rejects when the %s',
    async (_, results, status) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { client } = fakeClient(results);

      expect((await statusOf(await scope(client)))?.status).toBe(status);
    }
  );

  it('checks the source feedback belongs to the learner in this workspace', async () => {
    const { client, recorder } = fakeClient([found, found, found, found]);

    await expect(
      scope(client, { sourceFeedbackId: ids.feedbackId })
    ).resolves.toBeNull();
    expect(recorder.calls.at(-1)).toMatchObject({ table: 'user_feedbacks' });
    expect(recorder.calls.at(-1)?.filters).toEqual(
      expect.arrayContaining([
        ['id', ids.feedbackId],
        ['user_id', ids.studentUserId],
        ['user.ws_id', 'ws-1'],
      ])
    );
  });

  it('rejects feedback that is missing or fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = { sourceFeedbackId: ids.feedbackId };

    const missing = fakeClient([
      found,
      found,
      found,
      { data: null, error: null },
    ]);
    expect(await statusOf(await scope(missing.client, body))).toMatchObject({
      status: 400,
    });

    const failed = fakeClient([
      found,
      found,
      found,
      { data: null, error: new Error('db') },
    ]);
    expect(await statusOf(await scope(failed.client, body))).toMatchObject({
      status: 500,
    });
  });
});

describe('listGroupTeacherIds', () => {
  const args = { groupId: ids.groupId, normalizedWsId: 'ws-1' };

  it('skips the query when no teacher was proposed', async () => {
    const { client, recorder } = fakeClient([]);

    await expect(
      listGroupTeacherIds({ ...args, sbAdmin: client, teacherUserIds: [] })
    ).resolves.toEqual({ error: null, teacherIds: new Set() });
    expect(recorder.calls).toHaveLength(0);
  });

  it('returns the teachers of the group, dropping blank ids', async () => {
    const { client, recorder } = fakeClient([
      {
        data: [{ user_id: 't-1' }, { user_id: null }, { user_id: 't-2' }],
        error: null,
      },
    ]);

    const result = await listGroupTeacherIds({
      ...args,
      sbAdmin: client,
      teacherUserIds: ['t-1', 't-2', 't-3'],
    });

    expect(result.teacherIds).toEqual(new Set(['t-1', 't-2']));
    expect(recorder.calls[0]?.filters).toEqual(
      expect.arrayContaining([
        ['role', 'TEACHER'],
        ['group_id', ids.groupId],
      ])
    );
  });

  it('treats a null result as no teachers and passes errors through', async () => {
    const empty = fakeClient([{ data: null, error: null }]);
    expect(
      (
        await listGroupTeacherIds({
          ...args,
          sbAdmin: empty.client,
          teacherUserIds: ['t-1'],
        })
      ).teacherIds
    ).toEqual(new Set());

    const error = new Error('db');
    const failed = fakeClient([{ data: null, error }]);
    expect(
      await listGroupTeacherIds({
        ...args,
        sbAdmin: failed.client,
        teacherUserIds: ['t-1'],
      })
    ).toEqual({ error, teacherIds: new Set() });
  });
});

describe('listPotentialSchedulingConflicts', () => {
  const slot = (overrides = {}) => ({
    durationMinutes: 45,
    sessionDate: '2026-10-05',
    startTime: '17:30',
    studentUserId: 'student-1',
    teacherUserId: 'teacher-1',
    ...overrides,
  });
  const row = (id: string) => ({ id, session_date: '2026-10-05' });

  it('returns nothing to check for no slots', async () => {
    const { client, recorder } = fakeClient([]);

    await expect(
      listPotentialSchedulingConflicts({
        normalizedWsId: 'ws-1',
        sbAdmin: client,
        slots: [],
      })
    ).resolves.toEqual({ data: [], error: null });
    expect(recorder.calls).toHaveLength(0);
  });

  it('merges teacher and learner rows, once per session id', async () => {
    const { client, recorder } = fakeClient([
      { data: [row('a'), row('b')], error: null },
      { data: [row('b'), row('c')], error: null },
    ]);

    const result = await listPotentialSchedulingConflicts({
      normalizedWsId: 'ws-1',
      sbAdmin: client,
      slots: [slot(), slot({ studentUserId: 'student-2' })],
    });

    expect(result.error).toBeNull();
    expect(result.data.map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
    const [teacherCall, studentCall] = recorder.calls;
    expect(teacherCall?.filters).toContainEqual([
      'session_date',
      ['2026-10-04', '2026-10-05', '2026-10-06'],
    ]);
    expect(teacherCall?.filters).toContainEqual([
      'teacher_user_id',
      ['teacher-1'],
    ]);
    expect(studentCall?.filters).toContainEqual([
      'student_user_id',
      ['student-1', 'student-2'],
    ]);
  });

  it('only checks learners when no slot has a teacher', async () => {
    const { client, recorder } = fakeClient([
      { data: [row('c')], error: null },
    ]);

    const result = await listPotentialSchedulingConflicts({
      normalizedWsId: 'ws-1',
      sbAdmin: client,
      slots: [slot({ teacherUserId: null })],
    });

    expect(recorder.calls).toHaveLength(1);
    expect(result.data).toEqual([row('c')]);
  });

  it('surfaces a teacher-side or learner-side read failure', async () => {
    const error = new Error('db');

    const teacherFailed = fakeClient([
      { data: null, error },
      { data: [], error: null },
    ]);
    expect(
      await listPotentialSchedulingConflicts({
        normalizedWsId: 'ws-1',
        sbAdmin: teacherFailed.client,
        slots: [slot()],
      })
    ).toEqual({ data: [], error });

    const studentFailed = fakeClient([
      { data: [], error: null },
      { data: null, error },
    ]);
    expect(
      await listPotentialSchedulingConflicts({
        normalizedWsId: 'ws-1',
        sbAdmin: studentFailed.client,
        slots: [slot()],
      })
    ).toEqual({ data: [], error });
  });
});
