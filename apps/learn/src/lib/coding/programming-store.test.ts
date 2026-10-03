import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listCodingExecutions,
  notifyProgrammingSubmission,
  readCodingSubmission,
} from './store';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), notify: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/devbox-control', () => ({
  notifyDevboxRun: mocks.notify,
}));
const data = new Map<string, Record<string, unknown>[]>();
const filters: Array<[string, string, unknown?]> = [];
const problemId = '11111111-1111-4111-8111-111111111111';
const submissionId = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
  vi.resetAllMocks();
  filters.length = 0;
  data.clear();
  mocks.admin.mockResolvedValue({
    schema: () => ({
      from: (table: string) => {
        const query = {
          select: (_columns: string) => query,
          eq: (column: string, value: unknown) => {
            filters.push([table, column, value]);
            return query;
          },
          or: (filter: string) => {
            filters.push([table, 'or', filter]);
            return query;
          },
          in: (_column: string, _values: string[]) => query,
          order: (_column: string, _options: unknown) => query,
          limit: async (count: number) => ({
            data: (data.get(table) ?? []).slice(0, count),
            error: null,
          }),
        };
        Object.defineProperty(query, 'then', {
          value: (resolve: (result: unknown) => unknown) =>
            Promise.resolve({ data: data.get(table) ?? [], error: null }).then(
              resolve
            ),
        });
        return query;
      },
    }),
  });
});
describe('Actual Programming history list, poll and wake scope', () => {
  it('binds both history and polling to workspace, learner and problem identity', async () => {
    await listCodingExecutions({
      problemId,
      challengeSlug: 'untrusted-slug',
      wsId: 'workspace',
      userId: 'learner',
    });
    await readCodingSubmission({
      id: submissionId,
      problemId,
      wsId: 'workspace',
      userId: 'learner',
    });
    for (const [column, value] of [
      ['ws_id', 'workspace'],
      ['user_id', 'learner'],
      ['problem_id', problemId],
    ])
      expect(
        filters.filter(([, c, v]) => c === column && v === value)
      ).toHaveLength(2);
    expect(filters).toContainEqual([
      'learn_coding_submissions',
      'id',
      submissionId,
    ]);
    expect(filters.some(([, c]) => c === 'challenge_slug')).toBe(false);
  });
  it('legacy history is admitted only for audited imported identity and never-bound records', async () => {
    const id = 'ca13cfe6-4e26-4dc0-908a-d5c0b37dc7f1';
    await readCodingSubmission({
      id: submissionId,
      problemId: id,
      wsId: 'workspace',
      userId: 'learner',
    });
    expect(filters).toContainEqual([
      'learn_coding_submissions',
      'or',
      `problem_id.eq.${id},and(problem_id.is.null,problem_bound.eq.false,challenge_slug.eq.two-sum)`,
    ]);
  });
  it('rejects malformed problem IDs instead of interpolating them into queries', async () => {
    await expect(
      readCodingSubmission({
        id: submissionId,
        problemId: 'id,ws_id.eq.foreign',
        wsId: 'workspace',
        userId: 'learner',
      })
    ).rejects.toThrow();
    expect(filters.some(([, c]) => c === 'or' || c === 'problem_id')).toBe(
      false
    );
  });
  it('wakes a returned run and tolerates an actual notification failure', async () => {
    data.set('learn_coding_submissions', [{ run_id: 'owned-run' }]);
    await notifyProgrammingSubmission({
      id: 'opaque-submission',
      problemId,
      wsId: 'workspace',
      userId: 'learner',
    });
    expect(mocks.notify).toHaveBeenCalledWith('owned-run');
    expect(filters).toContainEqual([
      'learn_coding_submissions',
      'id',
      'opaque-submission',
    ]);
    mocks.notify.mockRejectedValueOnce(new Error('Synthetic wake failure'));
    await expect(
      notifyProgrammingSubmission({
        id: submissionId,
        problemId,
        wsId: 'workspace',
        userId: 'learner',
      })
    ).resolves.toBeUndefined();
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });
  it('hydrates real returned history rows and derives the cursor from the last listed item', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: String(index),
      run_id: 'run',
      ws_id: 'workspace',
      user_id: 'learner',
      problem_id: problemId,
      problem_bound: true,
      challenge_slug: 'synthetic',
      created_at: '2026-01-01T00:00:00Z',
      source: 'print(1)',
    }));
    data.set('learn_coding_submissions', rows);
    data.set('devbox_runs', [{ id: 'run', status: 'succeeded' }]);
    const result = await listCodingExecutions({
      problemId,
      challengeSlug: 'synthetic',
      wsId: 'workspace',
      userId: 'learner',
    });
    expect(result.items).toHaveLength(25);
    expect(result.items[0]).toMatchObject({
      id: '0',
      status: 'succeeded',
      source: 'print(1)',
    });
    expect(result.nextCursor).toBe('2026-01-01T00:00:00Z|24');
    const poll = await readCodingSubmission({
      id: '0',
      problemId,
      wsId: 'workspace',
      userId: 'learner',
    });
    expect(poll).toMatchObject({ id: '0', status: 'succeeded' });
  });
  it('rejects a formerly bound deleted-problem row even if storage returns it', async () => {
    data.set('learn_coding_submissions', [
      {
        id: submissionId,
        ws_id: 'workspace',
        user_id: 'learner',
        problem_id: null,
        problem_bound: true,
        challenge_slug: 'two-sum',
      },
    ]);
    const id = 'ca13cfe6-4e26-4dc0-908a-d5c0b37dc7f1';
    expect(
      await readCodingSubmission({
        id: submissionId,
        problemId: id,
        wsId: 'workspace',
        userId: 'learner',
      })
    ).toBeNull();
    expect(
      (
        await listCodingExecutions({
          problemId: id,
          challengeSlug: 'two-sum',
          wsId: 'workspace',
          userId: 'learner',
        })
      ).items
    ).toEqual([]);
  });
  it('wake lookup keeps all binding filters and cannot turn notification failure into another enqueue', async () => {
    await expect(
      notifyProgrammingSubmission({
        id: submissionId,
        problemId,
        wsId: 'workspace',
        userId: 'learner',
      })
    ).resolves.toBeUndefined();
    expect(filters).toContainEqual([
      'learn_coding_submissions',
      'problem_id',
      problemId,
    ]);
    expect(mocks.notify).not.toHaveBeenCalled();
    mocks.admin.mockRejectedValue(new Error('Synthetic private storage error'));
    await expect(
      notifyProgrammingSubmission({
        id: submissionId,
        problemId,
        wsId: 'workspace',
        userId: 'learner',
      })
    ).resolves.toBeUndefined();
  });
});
