import { describe, expect, it, vi } from 'vitest';
import { getLearnerReports } from './activity';
import type { Db } from './types';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('getLearnerReports must use the injected db in tests');
  }),
}));

type QueryResult = { data: unknown; error: null };

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };

  Object.defineProperty(query, 'then', {
    value: (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  });

  return query;
}

// Synthetic fixtures only: one assigned course and one stored periodic report.
function createDbMock() {
  const from = vi.fn((table: string) => {
    if (table === 'workspace_user_groups_users') {
      return createQuery({ data: [{ group_id: 'course-1' }], error: null });
    }
    throw new Error(`Unexpected public table query: ${table}`);
  });
  const privateFrom = vi.fn((table: string) => {
    if (table === 'external_user_monthly_reports_workspace_view') {
      return createQuery({
        data: [
          {
            content: 'Synthetic report body',
            created_at: '2026-10-01T00:00:00.000Z',
            feedback: 'Synthetic feedback',
            group_id: 'course-1',
            group_name: 'Synthetic Course',
            id: 'report-1',
            score: 9,
            title: 'October report',
          },
        ],
        error: null,
      });
    }
    throw new Error(`Unexpected private table query: ${table}`);
  });
  const schema = vi.fn(() => ({ from: privateFrom }));

  return {
    db: { from, schema } as unknown as Db,
    from,
    privateFrom,
    schema,
  };
}

describe('getLearnerReports', () => {
  it('returns no periodic reports to a parent and never queries them', async () => {
    const mock = createDbMock();

    const reports = await getLearnerReports({
      db: mock.db,
      studentWorkspaceUserId: 'student-1',
      viewerRole: 'parent',
      wsId: 'ws-1',
    });

    expect(reports).toEqual([]);
    expect(mock.schema).not.toHaveBeenCalled();
    expect(mock.privateFrom).not.toHaveBeenCalled();
  });

  it('still returns periodic reports to the learner', async () => {
    const mock = createDbMock();

    const reports = await getLearnerReports({
      db: mock.db,
      studentWorkspaceUserId: 'student-1',
      viewerRole: 'student',
      wsId: 'ws-1',
    });

    expect(mock.privateFrom).toHaveBeenCalledWith(
      'external_user_monthly_reports_workspace_view'
    );
    expect(reports).toEqual([
      {
        content: 'Synthetic report body',
        course: { id: 'course-1', name: 'Synthetic Course' },
        created_at: '2026-10-01T00:00:00.000Z',
        feedback: 'Synthetic feedback',
        id: 'report-1',
        score: 9,
        title: 'October report',
      },
    ]);
  });
});
