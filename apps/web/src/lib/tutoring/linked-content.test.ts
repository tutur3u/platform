// @vitest-environment node
import {
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FREEZE_TIMEOUT_MS,
  freezeLinkedLessonContent,
  isLinkedContentSession,
  type LinkableTutoringSession,
  loadLinkedLessonContent,
  pairSessionsWithAbsences,
} from './linked-content';

const wsId = 'ws-1';

type Row = Record<string, unknown>;
type Filter = [op: string, column: string, value: unknown];

const tables: Record<string, Row[]> = {};
const updates: { table: string; values: Row; filters: Filter[] }[] = [];

function matches(row: Row, filters: Filter[]) {
  return filters.every(([op, column, value]) => {
    const cell = row[column] as string;
    if (op === 'eq') return cell === value;
    if (op === 'neq') return cell !== value;
    if (op === 'in') return (value as unknown[]).includes(cell);
    if (op === 'gte') return cell >= (value as string);
    if (op === 'lt') return cell < (value as string);
    if (op === 'like') return cell.startsWith(String(value).replace('%', ''));
    return true;
  });
}

function query(table: string) {
  const filters: Filter[] = [];
  let updateValues: Row | null = null;
  let limit = Number.POSITIVE_INFINITY;
  const builder = {
    select: () => builder,
    update: (values: Row) => {
      updateValues = values;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push(['eq', column, value]);
      return builder;
    },
    neq: (column: string, value: unknown) => {
      filters.push(['neq', column, value]);
      return builder;
    },
    in: (column: string, value: unknown) => {
      filters.push(['in', column, value]);
      return builder;
    },
    gte: (column: string, value: unknown) => {
      filters.push(['gte', column, value]);
      return builder;
    },
    lt: (column: string, value: unknown) => {
      filters.push(['lt', column, value]);
      return builder;
    },
    like: (column: string, value: unknown) => {
      filters.push(['like', column, value]);
      return builder;
    },
    order: () => builder,
    limit: (count: number) => {
      limit = count;
      return builder;
    },
    maybeSingle: async () => ({
      data: (tables[table] ?? []).find((row) => matches(row, filters)) ?? null,
      error: null,
    }),
    // biome-ignore lint/suspicious/noThenProperty: mirrors a Supabase builder
    then: (resolve: (value: { data: Row[] | null; error: null }) => void) => {
      if (updateValues) {
        updates.push({ table, values: updateValues, filters: [...filters] });
        for (const row of tables[table] ?? []) {
          if (matches(row, filters)) Object.assign(row, updateValues);
        }
        return resolve({ data: null, error: null });
      }
      return resolve({
        data: (tables[table] ?? [])
          .filter((row) => matches(row, filters))
          .slice(0, limit),
        error: null,
      });
    },
  };
  return builder;
}

const sbAdmin = {
  from: query,
  schema: () => ({ from: query }),
} as unknown as TypedSupabaseClient;

const recent = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const missedDate = recent(5);

function session(
  overrides: Partial<LinkableTutoringSession> = {}
): LinkableTutoringSession & Row {
  return {
    id: 'tutoring-1',
    ws_id: wsId,
    group_id: 'group-1',
    student_user_id: 'student-1',
    reason_type: 'ABSENT_RECOVERY',
    attendance_status: 'PENDING',
    content: '',
    session_date: recent(1),
    start_time: '18:00',
    ...overrides,
  };
}

function lesson(description: string | null) {
  return {
    ws_id: wsId,
    group_id: 'group-1',
    status: 'scheduled',
    starts_at: `${missedDate}T10:00:00Z`,
    start_timezone: 'Asia/Ho_Chi_Minh',
    recurrence_instance_date: null,
    description,
    description_json: null,
  };
}

/** Created the morning after the missed lesson, in the class's zone. */
function report(content: string, status = 'APPROVED') {
  return {
    group_id: 'group-1',
    title: null,
    content,
    created_at: `${recent(4)}T01:00:00Z`,
    post_approval_status: status,
  };
}

const withPosts = (notes: string) =>
  `Ghi chú buổi học:\n${notes}\n\nBài viết của lớp:\n${missedDate}: Daily report`;

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  updates.length = 0;
  tables.workspace_configs = [];
  tables.workspace_user_groups = [{ id: 'group-1', ws_id: wsId }];
  tables.user_group_attendance = [
    {
      group_id: 'group-1',
      user_id: 'student-1',
      date: missedDate,
      status: 'ABSENT',
    },
  ];
});

afterEach(() => vi.useRealTimers());

describe('linked make-up content', () => {
  it('only links pending absence sessions without stored content', () => {
    expect(isLinkedContentSession(session())).toBe(true);
    expect(isLinkedContentSession(session({ attendance_status: 'DONE' }))).toBe(
      false
    );
    expect(isLinkedContentSession(session({ content: 'Tutor plan' }))).toBe(
      false
    );
    expect(
      isLinkedContentSession(session({ reason_type: 'WEAK_SUPPORT' }))
    ).toBe(false);
  });

  it('pairs sessions with the oldest absence on or before each date', () => {
    const pairs = pairSessionsWithAbsences(
      ['2026-10-05', '2026-10-01', '2026-10-20'],
      [
        { id: 'b', session_date: '2026-10-10', start_time: '18:00' },
        { id: 'a', session_date: '2026-10-03', start_time: '18:00' },
        { id: 'c', session_date: '2026-10-12', start_time: '18:00' },
      ]
    );
    expect(Object.fromEntries(pairs)).toEqual({
      a: '2026-10-01',
      b: '2026-10-05',
    });
  });

  it('shows lesson notes recorded after the session was scheduled', async () => {
    const pending = session();
    tables.workspace_tutoring_sessions = [pending];
    tables.workspace_user_group_sessions = [lesson(null)];

    const before = await loadLinkedLessonContent({
      sbAdmin,
      sessions: [pending],
      wsId,
    });
    expect(before.get(pending.id)).toBe('');

    tables.workspace_user_group_sessions = [lesson('Unit 4: past tense')];
    const after = await loadLinkedLessonContent({
      sbAdmin,
      sessions: [pending],
      wsId,
    });
    expect(after.get(pending.id)).toBe(`${missedDate}: Unit 4: past tense`);
  });

  it('pairs only with absences the queue counts once a count-from date is set', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T05:00:00Z'));
    tables.workspace_configs = serializeTutoringPolicyConfigRows({
      ...STANDARD_TUTORING_POLICY,
      absenceLookbackDays: 21,
      absenceCountFromDate: '2026-11-01',
    }).map((row) => ({ ...row, ws_id: wsId }));
    tables.user_group_attendance = ['2026-10-28', '2026-11-03'].map((date) => ({
      group_id: 'group-1',
      user_id: 'student-1',
      date,
      status: 'ABSENT',
    }));
    tables.workspace_user_group_sessions = [
      {
        ...lesson('Unit 3: before the date'),
        starts_at: '2026-10-28T10:00:00Z',
      },
      {
        ...lesson('Unit 5: after the date'),
        starts_at: '2026-11-03T10:00:00Z',
      },
    ];
    const pending = session({ session_date: '2026-11-05' });
    tables.workspace_tutoring_sessions = [pending];

    const linked = await loadLinkedLessonContent({
      sbAdmin,
      sessions: [pending],
      wsId,
    });
    expect(linked.get(pending.id)).toBe('2026-11-03: Unit 5: after the date');

    pending.attendance_status = 'DONE';
    await expect(
      freezeLinkedLessonContent({ sbAdmin, sessionId: pending.id, wsId })
    ).resolves.toBe('stored');
    expect(pending.content).toBe('2026-11-03: Unit 5: after the date');
  });

  describe('when the queue window is shorter than the make-up booking', () => {
    const now = new Date('2026-11-05T05:00:00Z');

    function policy(overrides: Partial<typeof STANDARD_TUTORING_POLICY>) {
      tables.workspace_configs = serializeTutoringPolicyConfigRows({
        ...STANDARD_TUTORING_POLICY,
        ...overrides,
      }).map((row) => ({ ...row, ws_id: wsId }));
    }

    function absences(dates: string[]) {
      tables.user_group_attendance = dates.map((date) => ({
        group_id: 'group-1',
        user_id: 'student-1',
        date,
        status: 'ABSENT',
      }));
    }

    function notes(entries: [date: string, description: string][]) {
      tables.workspace_user_group_sessions = entries.map(
        ([date, description]) => ({
          ...lesson(description),
          starts_at: `${date}T10:00:00Z`,
        })
      );
    }

    async function linkedFor(pending: LinkableTutoringSession & Row) {
      tables.workspace_tutoring_sessions = [pending];
      const linked = await loadLinkedLessonContent({
        sbAdmin,
        sessions: [pending],
        wsId,
      });
      return linked.get(pending.id);
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
    });

    it('keeps the notes of an absence older than the queue window', async () => {
      // Queue window 4 days; absence 10 days ago; make-up booked 3 days ago.
      policy({ absenceLookbackDays: 4, absenceCountFromDate: null });
      absences(['2026-10-26']);
      notes([['2026-10-26', 'Unit 2: fractions']]);

      await expect(
        linkedFor(session({ session_date: '2026-11-02' }))
      ).resolves.toBe('2026-10-26: Unit 2: fractions');
    });

    it('still never pairs with an absence before the count-from date', async () => {
      // The queue window (1 day) excludes 3 Nov; the count-from date still
      // hides 28 Oct, so the make-up follows 3 Nov.
      policy({ absenceLookbackDays: 1, absenceCountFromDate: '2026-11-01' });
      absences(['2026-10-28', '2026-11-03']);
      notes([
        ['2026-10-28', 'Unit 3: before the date'],
        ['2026-11-03', 'Unit 5: after the date'],
      ]);

      await expect(
        linkedFor(session({ session_date: '2026-11-05' }))
      ).resolves.toBe('2026-11-03: Unit 5: after the date');
    });

    it('does not pair with an absence beyond the link horizon', async () => {
      // 100 days before 5 Nov.
      policy({ absenceLookbackDays: 4, absenceCountFromDate: null });
      absences(['2026-07-28']);
      notes([['2026-07-28', 'Unit 1: long ago']]);

      await expect(
        linkedFor(session({ session_date: '2026-11-02' }))
      ).resolves.toBe('');
    });
  });

  it('never derives content over a staff edit', async () => {
    const edited = session({ content: 'Tutor plan' });
    tables.workspace_tutoring_sessions = [edited];
    tables.workspace_user_group_sessions = [lesson('Unit 4: past tense')];

    const linked = await loadLinkedLessonContent({
      sbAdmin,
      sessions: [edited],
      wsId,
    });
    expect(linked.has(edited.id)).toBe(false);

    edited.attendance_status = 'DONE';
    await expect(
      freezeLinkedLessonContent({ sbAdmin, sessionId: edited.id, wsId })
    ).resolves.toBe('skipped');
    expect(updates).toEqual([]);
    expect(edited.content).toBe('Tutor plan');
  });

  it('stores the notes on completion, then stops following the class', async () => {
    const completed = session({ attendance_status: 'DONE' });
    tables.workspace_tutoring_sessions = [completed];
    tables.workspace_user_group_sessions = [lesson('Unit 4: past tense')];

    await expect(
      freezeLinkedLessonContent({ sbAdmin, sessionId: completed.id, wsId })
    ).resolves.toBe('stored');
    expect(completed.content).toBe(`${missedDate}: Unit 4: past tense`);
    expect(updates[0]?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'attendance_status', 'DONE'],
        ['eq', 'content', ''],
      ])
    );

    tables.workspace_user_group_sessions = [lesson('Rewritten later')];
    const linked = await loadLinkedLessonContent({
      sbAdmin,
      sessions: [completed],
      wsId,
    });
    expect(linked.has(completed.id)).toBe(false);
    expect(completed.content).toBe(`${missedDate}: Unit 4: past tense`);
  });

  it('treats whitespace-only content as linked when completing', async () => {
    const blank = session({ attendance_status: 'DONE', content: '  \n ' });
    tables.workspace_tutoring_sessions = [blank];
    tables.workspace_user_group_sessions = [lesson('Unit 4: past tense')];

    expect(
      isLinkedContentSession({ ...blank, attendance_status: 'PENDING' })
    ).toBe(true);
    await freezeLinkedLessonContent({ sbAdmin, sessionId: blank.id, wsId });
    expect(blank.content).toBe(`${missedDate}: Unit 4: past tense`);
    expect(updates[0]?.filters).toEqual(
      expect.arrayContaining([['eq', 'content', '  \n ']])
    );
  });

  it('logs instead of failing completion when the notes lookup fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failing = {
      from: () => {
        throw new Error('database unavailable');
      },
      schema: () => ({
        from: () => {
          throw new Error('database unavailable');
        },
      }),
    } as unknown as TypedSupabaseClient;

    await expect(
      freezeLinkedLessonContent({ sbAdmin: failing, sessionId: 'x', wsId })
    ).resolves.toBe('failed');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('stops waiting for a slow notes lookup so completion latency stays bounded', async () => {
    vi.useFakeTimers();
    const consoleWarn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const hanging = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => new Promise(() => undefined) }),
            }),
          }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = freezeLinkedLessonContent({
      sbAdmin: hanging,
      sessionId: 'x',
      wsId,
    });
    await vi.advanceTimersByTimeAsync(FREEZE_TIMEOUT_MS);
    await expect(result).resolves.toBe('failed');
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
    vi.useRealTimers();
  });

  it('shows a class report written after booking, labelled like the draft', async () => {
    const pending = session();
    tables.workspace_tutoring_sessions = [pending];
    tables.workspace_user_group_sessions = [lesson('Unit 4: past tense')];
    tables.user_group_posts = [];
    const load = () =>
      loadLinkedLessonContent({
        includePosts: true,
        sbAdmin,
        sessions: [pending],
        wsId,
      });

    expect((await load()).get(pending.id)).toBe(
      `${missedDate}: Unit 4: past tense`
    );
    tables.user_group_posts = [report('Daily report')];
    expect((await load()).get(pending.id)).toBe(
      withPosts(`${missedDate}: Unit 4: past tense`)
    );
  });

  it('includes pending-approval reports and excludes rejected ones', async () => {
    const pending = session();
    tables.workspace_tutoring_sessions = [pending];
    tables.workspace_user_group_sessions = [lesson(null)];
    tables.user_group_posts = [
      report('Daily report', 'PENDING'),
      report('Rejected draft', 'REJECTED'),
    ];

    const linked = await loadLinkedLessonContent({
      includePosts: true,
      sbAdmin,
      sessions: [pending],
      wsId,
    });
    expect(linked.get(pending.id)).toBe(`${missedDate}: Daily report`);
  });

  it('leaves out reports for viewers without post access', async () => {
    const pending = session();
    tables.workspace_tutoring_sessions = [pending];
    tables.workspace_user_group_sessions = [lesson(null)];
    tables.user_group_posts = [report('Daily report')];

    const linked = await loadLinkedLessonContent({
      sbAdmin,
      sessions: [pending],
      wsId,
    });
    expect(linked.get(pending.id)).toBe('');
  });

  it('never copies reports into content on completion', async () => {
    const completed = session({ attendance_status: 'DONE' });
    tables.workspace_tutoring_sessions = [completed];
    tables.workspace_user_group_sessions = [lesson('Unit 4: past tense')];
    tables.user_group_posts = [report('Daily report')];

    await expect(
      freezeLinkedLessonContent({ sbAdmin, sessionId: completed.id, wsId })
    ).resolves.toBe('stored');
    expect(completed.content).toBe(`${missedDate}: Unit 4: past tense`);

    tables.user_group_posts = [report('Edited later')];
    const linked = await loadLinkedLessonContent({
      includePosts: true,
      sbAdmin,
      sessions: [completed],
      wsId,
    });
    expect(linked.has(completed.id)).toBe(false);
    expect(completed.content).toBe(`${missedDate}: Unit 4: past tense`);
  });

  it('reads every lesson a report could belong to, whatever the batch', async () => {
    // No lesson on the missed date; one two days earlier claims the report.
    const pending = session();
    tables.workspace_tutoring_sessions = [pending];
    tables.workspace_user_group_sessions = [
      { ...lesson(null), starts_at: `${recent(7)}T11:00:00Z` },
    ];
    tables.user_group_posts = [
      { ...report('Daily report'), created_at: `${missedDate}T01:00:00Z` },
    ];

    const linked = await loadLinkedLessonContent({
      includePosts: true,
      sbAdmin,
      sessions: [pending],
      wsId,
    });
    expect(linked.get(pending.id)).toBe('');
  });

  it('fails instead of composing from a truncated post list', async () => {
    const pending = session();
    tables.workspace_tutoring_sessions = [pending];
    tables.workspace_user_group_sessions = [lesson(null)];
    tables.user_group_posts = Array.from({ length: 1000 }, (_, index) =>
      report(`Report ${index}`)
    );

    await expect(
      loadLinkedLessonContent({
        includePosts: true,
        sbAdmin,
        sessions: [pending],
        wsId,
      })
    ).rejects.toThrow('row limit');
  });

  it('reads posts only for groups in the workspace', async () => {
    const pending = session();
    tables.workspace_tutoring_sessions = [pending];
    tables.workspace_user_group_sessions = [lesson(null)];
    tables.workspace_user_groups = [{ id: 'group-1', ws_id: 'ws-other' }];
    tables.user_group_posts = [report('Daily report')];

    const linked = await loadLinkedLessonContent({
      includePosts: true,
      sbAdmin,
      sessions: [pending],
      wsId,
    });
    expect(linked.get(pending.id)).toBe('');
  });
});
