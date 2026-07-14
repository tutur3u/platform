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

  it('includes lightweight parent task details in the summary', async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'task_relationships') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(
                async (
                  column: 'source_task_id' | 'target_task_id',
                  ids: string[]
                ) => {
                  if (
                    column === 'target_task_id' &&
                    ids.includes('task-child')
                  ) {
                    return {
                      data: [
                        {
                          id: 'rel-1',
                          source_task_id: 'task-parent',
                          target_task_id: 'task-child',
                          type: 'parent_child',
                        },
                      ],
                      error: null,
                    };
                  }

                  return { data: [], error: null };
                }
              ),
            })),
          };
        }

        if (table === 'tasks') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  {
                    id: 'task-parent',
                    name: 'Parent title',
                    display_number: 11,
                    completed_at: null,
                    closed_at: null,
                    deleted_at: null,
                    list: {
                      board: {
                        ws_id: 'ws-1',
                        name: 'Board',
                        ticket_prefix: 'TTR',
                      },
                    },
                  },
                  {
                    id: 'task-child',
                    name: 'Child title',
                    display_number: 12,
                    completed_at: null,
                    closed_at: null,
                    deleted_at: null,
                    list: {
                      board: {
                        ws_id: 'ws-1',
                        name: 'Board',
                        ticket_prefix: 'TTR',
                      },
                    },
                  },
                ],
                error: null,
              })),
            })),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const summary = await buildTaskRelationshipSummary(
      client as never,
      'ws-1',
      ['task-child']
    );

    expect(summary.get('task-child')).toEqual({
      parentTaskId: 'task-parent',
      parentTask: {
        id: 'task-parent',
        name: 'Parent title',
        display_number: 11,
        ticket_prefix: 'TTR',
      },
      childCount: 0,
      completedChildCount: 0,
      blockedByCount: 0,
      blockingCount: 0,
      relatedCount: 0,
    });
  });

  it('counts completed child tasks in the relationship summary', async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'task_relationships') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(
                async (
                  column: 'source_task_id' | 'target_task_id',
                  ids: string[]
                ) => {
                  if (
                    column === 'source_task_id' &&
                    ids.includes('task-parent')
                  ) {
                    return {
                      data: [
                        {
                          id: 'rel-1',
                          source_task_id: 'task-parent',
                          target_task_id: 'task-child-done',
                          type: 'parent_child',
                        },
                        {
                          id: 'rel-2',
                          source_task_id: 'task-parent',
                          target_task_id: 'task-child-open',
                          type: 'parent_child',
                        },
                      ],
                      error: null,
                    };
                  }

                  return { data: [], error: null };
                }
              ),
            })),
          };
        }

        if (table === 'tasks') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  {
                    id: 'task-parent',
                    name: 'Parent title',
                    display_number: 11,
                    completed_at: null,
                    closed_at: null,
                    deleted_at: null,
                    list: {
                      board: {
                        ws_id: 'ws-1',
                        name: 'Board',
                        ticket_prefix: 'TTR',
                      },
                    },
                  },
                  {
                    id: 'task-child-done',
                    name: 'Done child',
                    display_number: 12,
                    completed_at: '2026-05-01T01:00:00.000Z',
                    closed_at: null,
                    deleted_at: null,
                    list: {
                      board: {
                        ws_id: 'ws-1',
                        name: 'Board',
                        ticket_prefix: 'TTR',
                      },
                    },
                  },
                  {
                    id: 'task-child-open',
                    name: 'Open child',
                    display_number: 13,
                    completed_at: null,
                    closed_at: null,
                    deleted_at: null,
                    list: {
                      board: {
                        ws_id: 'ws-1',
                        name: 'Board',
                        ticket_prefix: 'TTR',
                      },
                    },
                  },
                ],
                error: null,
              })),
            })),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const summary = await buildTaskRelationshipSummary(
      client as never,
      'ws-1',
      ['task-parent']
    );

    expect(summary.get('task-parent')).toEqual({
      parentTaskId: null,
      parentTask: null,
      childCount: 2,
      completedChildCount: 1,
      blockedByCount: 0,
      blockingCount: 0,
      relatedCount: 0,
    });
  });
});
