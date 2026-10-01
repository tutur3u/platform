import { PROGRAMMING_CATALOG_PAGE_SIZE } from '@tuturuuu/types/primitives/programming';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgrammingProblemRow } from './programming-model';
import { createProgrammingRepository } from './programming-repository';
import { listProgrammingProblems } from './programming-service';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
const wsId = '22222222-2222-4222-8222-222222222222';
const rows: ProgrammingProblemRow[] = Array.from({ length: 53 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  ws_id: wsId,
  slug: `synthetic-${i}`,
  title: { en: 'Example', vi: 'Ví dụ' },
  prompt: { en: 'Print', vi: 'In' },
  difficulty: 'easy',
  topic: 'arrays',
  starter_code: '',
  status: 'published',
  revision: 1,
}));
const calls: Array<[string, unknown, unknown?]> = [];
beforeEach(() => {
  calls.length = 0;
  mocks.admin.mockResolvedValue({
    schema: () => ({
      from: () => {
        let cursor: string | undefined;
        let count = 0;
        const query = {
          select: (_columns: string) => query,
          or: (filter: string) => {
            calls.push(['or', filter]);
            return query;
          },
          eq: (column: string, value: string) => {
            calls.push(['eq', column, value]);
            return query;
          },
          gt: (column: string, value: string) => {
            calls.push(['gt', column, value]);
            cursor = value;
            return query;
          },
          order: (column: string, options: unknown) => {
            calls.push(['order', column, options]);
            return query;
          },
          limit: (next: number) => {
            calls.push(['limit', next]);
            count = next;
            return query;
          },
        };
        Object.defineProperty(query, 'then', {
          value: (
            fulfilled: (result: {
              data: ProgrammingProblemRow[];
              error: null;
            }) => unknown
          ) =>
            Promise.resolve({
              data: rows
                .filter((r) => !cursor || r.id > cursor)
                .slice(0, count),
              error: null,
            }).then(fulfilled),
        });
        return query;
      },
    }),
  });
});
describe('Programming actual repository cursor pages', () => {
  it('returns a bounded deterministic page and an honest continuation', async () => {
    const repo = await createProgrammingRepository();
    const access = { wsId, actorId: 'actor', mode: 'learner' as const };
    const first = await listProgrammingProblems(repo, access);
    expect(first.problems).toHaveLength(PROGRAMMING_CATALOG_PAGE_SIZE);
    expect(first.nextCursor).toBe(rows[49]!.id);
    const second = await listProgrammingProblems(
      repo,
      access,
      first.nextCursor!
    );
    expect(second.problems.map((p) => p.id)).toEqual(
      rows.slice(50).map((r) => r.id)
    );
    expect(second.nextCursor).toBeNull();
    expect(calls.filter(([name]) => name === 'limit')).toEqual([
      ['limit', 51],
      ['limit', 51],
    ]);
    expect(calls.filter(([name]) => name === 'or')).toEqual([
      ['or', `ws_id.eq.${wsId},ws_id.is.null`],
      ['or', `ws_id.eq.${wsId},ws_id.is.null`],
    ]);
    expect(calls.filter(([name]) => name === 'eq')).toEqual([
      ['eq', 'status', 'published'],
      ['eq', 'status', 'published'],
    ]);
    expect(calls).toContainEqual(['gt', 'id', first.nextCursor]);
  });
  it('author pages keep global published scope and reject malformed cursors before storage', async () => {
    const repo = await createProgrammingRepository();
    const access = { wsId, actorId: 'actor', mode: 'author' as const };
    await listProgrammingProblems(repo, access);
    expect(calls).toContainEqual([
      'or',
      `ws_id.eq.${wsId},and(ws_id.is.null,status.eq.published)`,
    ]);
    const previous = calls.length;
    await expect(
      listProgrammingProblems(repo, access, 'invalid')
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(previous);
  });
});
