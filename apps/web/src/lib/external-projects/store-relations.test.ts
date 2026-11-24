import { describe, expect, it, vi } from 'vitest';
import { EXTERNAL_PROJECT_QUERY_PAGE_SIZE } from './paged-rows';
import { listWorkspaceExternalProjectRelationData } from './store-relations';

vi.mock('./cache', () => ({
  invalidateWorkspaceExternalProjectCache: vi.fn(),
}));

const PAGE = EXTERNAL_PROJECT_QUERY_PAGE_SIZE;
const RELATIONS = 'workspace_external_project_entry_relations';
const DEFINITIONS = 'workspace_external_project_relation_definitions';

type Row = Record<string, unknown> & { id: string };

const idOf = (index: number) => `id-${String(index).padStart(6, '0')}`;

/**
 * A query fake that applies the ws_id, gt('id') and range filters the way
 * PostgREST would, over rows kept in id order.
 */
function createDb(tables: Record<string, Row[]>) {
  const calls: Array<{
    afterId: string | null;
    table: string;
    wsId: unknown;
  }> = [];
  const db = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        const state = {
          afterId: null as string | null,
          wsId: undefined as unknown,
        };
        const query = {
          eq: vi.fn((column: string, value: unknown) => {
            if (column === 'ws_id') state.wsId = value;
            return query;
          }),
          gt: vi.fn((_column: string, value: string) => {
            state.afterId = value;
            return query;
          }),
          order: vi.fn(() => query),
          range: vi.fn((from: number, to: number) => {
            calls.push({ afterId: state.afterId, table, wsId: state.wsId });
            const rows = (tables[table] ?? [])
              .filter((row) => row.ws_id === state.wsId)
              .filter((row) => state.afterId === null || row.id > state.afterId)
              .slice(from, to + 1);
            return Promise.resolve({ data: rows, error: null });
          }),
        };
        return query;
      }),
    })),
  };
  return { calls, db };
}

function relationRows(count: number, wsId = 'workspace-1'): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    created_at: '2026-01-01T00:00:00Z',
    id: idOf(index),
    sort_order: 0,
    ws_id: wsId,
  }));
}

describe('listWorkspaceExternalProjectRelationData', () => {
  it.each([
    [PAGE - 1, 1],
    [PAGE, 2],
    [PAGE + 1, 2],
    [PAGE * 2, 3],
  ])('reads all %i rows in %i pages', async (count, pages) => {
    const { calls, db } = createDb({ [RELATIONS]: relationRows(count) });

    const data = await listWorkspaceExternalProjectRelationData(
      'workspace-1',
      db as never
    );

    expect(data.relations).toHaveLength(count);
    const relationCalls = calls.filter((call) => call.table === RELATIONS);
    expect(relationCalls).toHaveLength(pages);
    expect(relationCalls[0]?.afterId).toBeNull();
    if (pages > 1) expect(relationCalls[1]?.afterId).toBe(idOf(PAGE - 1));
  });

  it('scopes every page to the workspace', async () => {
    const { calls, db } = createDb({
      [RELATIONS]: [
        ...relationRows(PAGE + 3),
        ...relationRows(5, 'workspace-2').map((row) => ({
          ...row,
          id: `${row.id}-other`,
        })),
      ],
    });

    const data = await listWorkspaceExternalProjectRelationData(
      'workspace-1',
      db as never
    );

    expect(data.relations).toHaveLength(PAGE + 3);
    expect(data.relations.every((row) => row.ws_id === 'workspace-1')).toBe(
      true
    );
    expect(calls.every((call) => call.wsId === 'workspace-1')).toBe(true);
  });

  it('throws when a later page fails instead of returning part of the list', async () => {
    let call = 0;
    const query = {
      eq: () => query,
      gt: () => query,
      order: () => query,
      range: () => {
        call += 1;
        return Promise.resolve(
          call === 1
            ? { data: relationRows(PAGE), error: null }
            : { data: null, error: { message: 'page failed' } }
        );
      },
    };
    const db = {
      from: (table: string) => ({
        select: () =>
          table === RELATIONS
            ? query
            : {
                eq: () => ({
                  order: () => ({
                    range: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              },
      }),
    };

    await expect(
      listWorkspaceExternalProjectRelationData('workspace-1', db as never)
    ).rejects.toThrow('page failed');
  });

  it('orders rows by sort order, then key or creation time, then id', async () => {
    const { db } = createDb({
      [DEFINITIONS]: [
        { id: 'a', key: 'rival', sort_order: 1, ws_id: 'workspace-1' },
        { id: 'b', key: 'ally', sort_order: 1, ws_id: 'workspace-1' },
        { id: 'c', key: 'ally', sort_order: 1, ws_id: 'workspace-1' },
        { id: 'd', key: 'zeta', sort_order: 0, ws_id: 'workspace-1' },
      ],
      [RELATIONS]: [
        {
          created_at: '2026-02-01',
          id: 'r1',
          sort_order: 0,
          ws_id: 'workspace-1',
        },
        {
          created_at: '2026-01-01',
          id: 'r2',
          sort_order: 0,
          ws_id: 'workspace-1',
        },
        {
          created_at: '2026-01-01',
          id: 'r3',
          sort_order: 0,
          ws_id: 'workspace-1',
        },
        {
          created_at: '2025-01-01',
          id: 'r4',
          sort_order: 1,
          ws_id: 'workspace-1',
        },
      ],
    });

    const data = await listWorkspaceExternalProjectRelationData(
      'workspace-1',
      db as never
    );

    expect(data.definitions.map((row) => row.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(data.relations.map((row) => row.id)).toEqual([
      'r2',
      'r3',
      'r1',
      'r4',
    ]);
  });
});
