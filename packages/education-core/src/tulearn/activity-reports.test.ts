import { describe, expect, it, vi } from 'vitest';
import { getLearnerReports } from './activity';
import type { Db, TulearnRole } from './types';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('getLearnerReports must use the injected db in tests');
  }),
}));

type Row = Record<string, unknown>;
type QueryResult = { data: Row[]; error: null };

// Minimal in-memory PostgREST builder: applies eq/in/order/limit for real, so
// the tests prove the result set, not only which methods were called.
function createQuery(rows: Row[], { applyFilters = true } = {}) {
  let current = [...rows];
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    calls,
    eq: vi.fn((column: string, value: unknown) => {
      calls.push(['eq', column, value]);
      if (applyFilters) {
        current = current.filter((row) => row[column] === value);
      }
      return query;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      calls.push(['in', column, values]);
      current = current.filter((row) => values.includes(row[column]));
      return query;
    }),
    limit: vi.fn((count: number) => {
      calls.push(['limit', count]);
      current = current.slice(0, count);
      return query;
    }),
    order: vi.fn((column: string, options?: { ascending?: boolean }) => {
      calls.push(['order', column, options]);
      const direction = options?.ascending === false ? -1 : 1;
      current = [...current].sort(
        (a, b) => String(a[column]).localeCompare(String(b[column])) * direction
      );
      return query;
    }),
    select: vi.fn((columns: string) => {
      calls.push(['select', columns]);
      return query;
    }),
  };

  Object.defineProperty(query, 'then', {
    value: (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) =>
      Promise.resolve({ data: current, error: null }).then(
        onFulfilled,
        onRejected
      ),
  });

  return query;
}

// Synthetic fixtures only: fake ids, one workspace, one learner, one course.
const WS_ID = 'ws-synthetic';
const STUDENT_ID = 'student-synthetic';
const COURSE_ID = 'course-synthetic';

type Stage =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'queued'
  | 'processing'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'sent';

let reportSeq = 0;
function report({
  stage,
  approval = stage === 'rejected'
    ? 'REJECTED'
    : stage === 'draft' || stage === 'pending'
      ? 'PENDING'
      : 'APPROVED',
  day,
}: {
  stage: Stage;
  approval?: 'APPROVED' | 'PENDING' | 'REJECTED';
  day: number;
}): Row {
  reportSeq += 1;
  return {
    content: `Synthetic ${stage} body`,
    created_at: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    feedback: `Synthetic ${stage} feedback`,
    group_id: COURSE_ID,
    group_name: 'Synthetic Course',
    id: `report-${stage}-${approval}-${reportSeq}`,
    report_approval_status: approval,
    report_stage: stage,
    score: 7,
    title: `${stage} report`,
    user_id: STUDENT_ID,
    user_ws_id: WS_ID,
  };
}

function createDbMock(rows: Row[]) {
  const reportQueries: ReturnType<typeof createQuery>[] = [];
  const staffOnlyTables: string[] = [];
  const from = vi.fn((table: string) => {
    if (table === 'workspace_user_groups_users') {
      // Course assignment is covered elsewhere; always one assigned course.
      return createQuery([{ group_id: COURSE_ID }], { applyFilters: false });
    }
    staffOnlyTables.push(table);
    throw new Error(`Unexpected public table query: ${table}`);
  });
  const privateFrom = vi.fn((table: string) => {
    if (table === 'external_user_monthly_reports_workspace_view') {
      const query = createQuery(rows);
      reportQueries.push(query);
      return query;
    }
    staffOnlyTables.push(table);
    throw new Error(`Unexpected private table query: ${table}`);
  });
  const schema = vi.fn(() => ({ from: privateFrom }));

  return {
    db: { from, schema } as unknown as Db,
    privateFrom,
    reportQueries,
    staffOnlyTables,
  };
}

function load(rows: Row[], viewerRole: TulearnRole) {
  const mock = createDbMock(rows);
  return {
    mock,
    reports: getLearnerReports({
      db: mock.db,
      studentWorkspaceUserId: STUDENT_ID,
      viewerRole,
      wsId: WS_ID,
    }),
  };
}

const HIDDEN_STAGES: Stage[] = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'queued',
  'processing',
  'failed',
  'blocked',
  'skipped',
];

describe.each<TulearnRole>(['parent', 'student'])(
  'getLearnerReports for a %s viewer',
  (viewerRole) => {
    it('hides unapproved, draft, rejected, pending and undelivered reports', async () => {
      const rows = HIDDEN_STAGES.map((stage, index) =>
        report({ stage, day: index + 10 })
      );
      const { reports } = load(rows, viewerRole);

      expect(await reports).toEqual([]);
    });

    it('shows approved reports that were delivered (stage sent)', async () => {
      const sent = report({ stage: 'sent', day: 1 });
      const rows = [
        sent,
        ...HIDDEN_STAGES.map((stage, index) =>
          report({ stage, day: index + 10 })
        ),
      ];
      const { reports } = load(rows, viewerRole);

      expect(await reports).toEqual([
        {
          content: 'Synthetic sent body',
          course: { id: COURSE_ID, name: 'Synthetic Course' },
          created_at: sent.created_at,
          feedback: 'Synthetic sent feedback',
          id: sent.id,
          score: 7,
          title: 'sent report',
        },
      ]);
    });

    it('hides a sent report whose approval was later revoked', async () => {
      const rows = [
        report({ stage: 'sent', approval: 'REJECTED', day: 2 }),
        report({ stage: 'sent', approval: 'PENDING', day: 3 }),
      ];
      const { reports } = load(rows, viewerRole);

      expect(await reports).toEqual([]);
    });

    it('applies the stage filter before the 12-report limit', async () => {
      // 15 delivered reports (days 1-15), plus 9 newer hidden reports that
      // would crowd the delivered ones out if the limit ran first.
      const sent = Array.from({ length: 15 }, (_, index) =>
        report({ stage: 'sent', day: index + 1 })
      );
      const hidden = HIDDEN_STAGES.map((stage, index) =>
        report({ stage, day: index + 20 })
      );
      const { mock, reports } = load([...hidden, ...sent], viewerRole);
      const result = await reports;

      expect(result).toHaveLength(12);
      expect(result.map((row) => row.id)).toEqual(
        sent
          .slice(3)
          .reverse()
          .map((row) => row.id)
      );

      const calls = mock.reportQueries[0]?.calls ?? [];
      const limitIndex = calls.findIndex(([name]) => name === 'limit');
      const stageIndex = calls.findIndex(
        ([name, column]) => name === 'eq' && column === 'report_stage'
      );
      expect(calls[limitIndex]).toEqual(['limit', 12]);
      expect(stageIndex).toBeGreaterThanOrEqual(0);
      expect(stageIndex).toBeLessThan(limitIndex);
    });

    it('reads only the learner view and no staff tables', async () => {
      const { mock, reports } = load(
        [report({ stage: 'sent', day: 1 })],
        viewerRole
      );
      await reports;

      expect(mock.privateFrom).toHaveBeenCalledTimes(1);
      expect(mock.privateFrom).toHaveBeenCalledWith(
        'external_user_monthly_reports_workspace_view'
      );
      expect(mock.staffOnlyTables).toEqual([]);
    });
  }
);

describe('getLearnerReports viewer roles', () => {
  it('fails closed for an unknown viewer role without reading reports', async () => {
    const mock = createDbMock([report({ stage: 'sent', day: 1 })]);

    const reports = await getLearnerReports({
      db: mock.db,
      studentWorkspaceUserId: STUDENT_ID,
      viewerRole: 'teacher' as unknown as TulearnRole,
      wsId: WS_ID,
    });

    expect(reports).toEqual([]);
    expect(mock.privateFrom).not.toHaveBeenCalled();
  });
});
