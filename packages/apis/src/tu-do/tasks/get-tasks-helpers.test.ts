import { describe, expect, it, vi } from 'vitest';
import { buildTaskRelationshipSummary } from './get-tasks-helpers';

function createMockSupabase() {
  const relationshipQueryCalls: Array<{
    column: 'source_task_id' | 'target_task_id';
    ids: string[];
  }> = [];

  return {
    relationshipQueryCalls,
    client: {
      from: vi.fn((table: string) => {
        if (table === 'task_relationships') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(
                async (
                  column: 'source_task_id' | 'target_task_id',
                  ids: string[]
                ) => {
                  relationshipQueryCalls.push({ column, ids });
                  return { data: [], error: null };
                }
              ),
            })),
          };
        }

        if (table === 'tasks') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    },
  };
}

describe('buildTaskRelationshipSummary', () => {
  it('chunks task relationship queries to avoid oversized .in requests', async () => {
    const taskIds = Array.from({ length: 401 }, (_, index) => `task-${index}`);
    const { client, relationshipQueryCalls } = createMockSupabase();

    const summary = await buildTaskRelationshipSummary(
      client as never,
      'ws-1',
      taskIds
    );

    expect(summary.size).toBe(taskIds.length);
    expect(relationshipQueryCalls).toHaveLength(6);

    expect(
      relationshipQueryCalls
        .filter((call) => call.column === 'source_task_id')
        .map((call) => call.ids.length)
    ).toEqual([200, 200, 1]);

    expect(
      relationshipQueryCalls
        .filter((call) => call.column === 'target_task_id')
        .map((call) => call.ids.length)
    ).toEqual([200, 200, 1]);
  });
});
