import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const workspaceMembersMaybeSingle = vi.fn();

  const taskListMaybeSingle = vi.fn();
  const tasksEq = vi.fn();
  const taskAssigneesIn = vi.fn();
  const taskProjectsMaybeSingle = vi.fn();
  const workspaceLabelsMaybeSingle = vi.fn();
  const rpc = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser,
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: workspaceMembersMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_task_labels') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: workspaceLabelsMaybeSingle,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'task_lists') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: taskListMaybeSingle,
            })),
          })),
        };
      }

      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: tasksEq,
            })),
          })),
        };
      }

      if (table === 'task_assignees') {
        return {
          select: vi.fn(() => ({
            in: taskAssigneesIn,
          })),
        };
      }

      if (table === 'task_projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: taskProjectsMaybeSingle,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
    rpc,
  };

  return {
    adminSupabase,
    getUser,
    normalizeWorkspaceId,
    rpc,
    sessionSupabase,
    taskAssigneesIn,
    taskListMaybeSingle,
    taskProjectsMaybeSingle,
    tasksEq,
    workspaceLabelsMaybeSingle,
    workspaceMembersMaybeSingle,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

describe('task bulk route', () => {
  const asNextRequest = (request: Request) => request as unknown as NextRequest;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));

    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
        },
      },
      error: null,
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000000'
    );

    mocks.workspaceMembersMaybeSingle.mockResolvedValue({
      data: {
        user_id: '11111111-1111-4111-8111-111111111111',
      },
      error: null,
    });

    mocks.taskListMaybeSingle.mockResolvedValue({
      data: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        board_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'active',
        deleted: false,
        workspace_boards: {
          ws_id: '00000000-0000-0000-0000-000000000000',
        },
      },
      error: null,
    });

    mocks.tasksEq.mockResolvedValue({
      data: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          list_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          completed: false,
          completed_at: null,
          closed_at: null,
          task_lists: {
            status: 'active',
            board_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            workspace_boards: {
              ws_id: '00000000-0000-0000-0000-000000000000',
            },
          },
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          list_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          completed: false,
          completed_at: null,
          closed_at: null,
          task_lists: {
            status: 'active',
            board_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            workspace_boards: {
              ws_id: '00000000-0000-0000-0000-000000000000',
            },
          },
        },
      ],
      error: null,
    });

    mocks.taskAssigneesIn.mockResolvedValue({ data: [], error: null });
    mocks.taskProjectsMaybeSingle.mockResolvedValue({
      data: { id: '44444444-4444-4444-8444-444444444444' },
      error: null,
    });
    mocks.workspaceLabelsMaybeSingle.mockResolvedValue({
      data: { id: '55555555-5555-4555-8555-555555555555' },
      error: null,
    });

    mocks.rpc
      .mockResolvedValueOnce({ data: [{ id: 'ok-1' }], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: new Error('task failed'),
      });
  });

  it('returns partial success for bulk update_fields and continues processing', async () => {
    const { POST } = await import('./route.js');

    const response = await POST(
      asNextRequest(
        new Request('http://localhost/api/v1/workspaces/ws-1/tasks/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds: [
              '22222222-2222-4222-8222-222222222222',
              '33333333-3333-4333-8333-333333333333',
            ],
            operation: {
              type: 'update_fields',
              updates: {
                priority: 'high',
              },
            },
          }),
        })
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        successCount: 1,
        failCount: 1,
        succeededTaskIds: ['22222222-2222-4222-8222-222222222222'],
        failures: [
          {
            taskId: '33333333-3333-4333-8333-333333333333',
            error: 'task failed',
          },
        ],
      })
    );

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'update_task_fields_with_actor',
      expect.objectContaining({
        p_task_id: '22222222-2222-4222-8222-222222222222',
        p_actor_user_id: '11111111-1111-4111-8111-111111111111',
      })
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'update_task_fields_with_actor',
      expect.objectContaining({
        p_task_id: '33333333-3333-4333-8333-333333333333',
        p_actor_user_id: '11111111-1111-4111-8111-111111111111',
      })
    );
  });

  it('returns move metadata for succeeded tasks in move_to_list', async () => {
    const { POST } = await import('./route.js');

    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ id: 'ok-1' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'ok-2' }], error: null });

    const response = await POST(
      asNextRequest(
        new Request('http://localhost/api/v1/workspaces/ws-1/tasks/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds: [
              '22222222-2222-4222-8222-222222222222',
              '33333333-3333-4333-8333-333333333333',
            ],
            operation: {
              type: 'move_to_list',
              listId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            },
          }),
        })
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        successCount: 2,
        failCount: 0,
        taskMetaById: {
          '22222222-2222-4222-8222-222222222222': expect.objectContaining({
            list_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            completed_at: null,
            closed_at: null,
          }),
          '33333333-3333-4333-8333-333333333333': expect.objectContaining({
            list_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            completed_at: null,
            closed_at: null,
          }),
        },
      })
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      'update_task_fields_with_actor',
      expect.objectContaining({
        p_task_updates: expect.objectContaining({
          list_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      })
    );
  });

  it('preserves completion timestamps for completion-to-completion moves and only updates on boundary transitions', async () => {
    const { POST } = await import('./route.js');

    // done -> closed should preserve historical completion timestamps
    mocks.taskListMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        board_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'closed',
        deleted: false,
        workspace_boards: {
          ws_id: '00000000-0000-0000-0000-000000000000',
        },
      },
      error: null,
    });
    mocks.tasksEq.mockResolvedValueOnce({
      data: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          list_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          completed: true,
          completed_at: '2026-01-01T00:00:00.000Z',
          closed_at: '2026-01-02T00:00:00.000Z',
          task_lists: {
            status: 'done',
            board_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            workspace_boards: {
              ws_id: '00000000-0000-0000-0000-000000000000',
            },
          },
        },
      ],
      error: null,
    });
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'ok-1' }], error: null });

    const completionToCompletionResponse = await POST(
      asNextRequest(
        new Request('http://localhost/api/v1/workspaces/ws-1/tasks/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds: ['22222222-2222-4222-8222-222222222222'],
            operation: {
              type: 'move_to_list',
              listId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            },
          }),
        })
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(completionToCompletionResponse.status).toBe(200);
    await expect(completionToCompletionResponse.json()).resolves.toEqual(
      expect.objectContaining({
        successCount: 1,
        failCount: 0,
        taskMetaById: {
          '22222222-2222-4222-8222-222222222222': expect.objectContaining({
            list_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            completed_at: '2026-01-01T00:00:00.000Z',
            closed_at: '2026-01-02T00:00:00.000Z',
          }),
        },
      })
    );

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'update_task_fields_with_actor',
      expect.objectContaining({
        p_task_updates: expect.objectContaining({
          list_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          completed: true,
          completed_at: '2026-01-01T00:00:00.000Z',
          closed_at: '2026-01-02T00:00:00.000Z',
        }),
      })
    );

    // active -> done should stamp completion timestamps
    mocks.taskListMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        board_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'done',
        deleted: false,
        workspace_boards: {
          ws_id: '00000000-0000-0000-0000-000000000000',
        },
      },
      error: null,
    });
    mocks.tasksEq.mockResolvedValueOnce({
      data: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          list_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          completed: false,
          completed_at: null,
          closed_at: null,
          task_lists: {
            status: 'active',
            board_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            workspace_boards: {
              ws_id: '00000000-0000-0000-0000-000000000000',
            },
          },
        },
      ],
      error: null,
    });
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'ok-2' }], error: null });

    const enteringCompletionResponse = await POST(
      asNextRequest(
        new Request('http://localhost/api/v1/workspaces/ws-1/tasks/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds: ['33333333-3333-4333-8333-333333333333'],
            operation: {
              type: 'move_to_list',
              listId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            },
          }),
        })
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(enteringCompletionResponse.status).toBe(200);
    await expect(enteringCompletionResponse.json()).resolves.toEqual(
      expect.objectContaining({
        taskMetaById: {
          '33333333-3333-4333-8333-333333333333': expect.objectContaining({
            list_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            completed_at: '2026-04-09T10:00:00.000Z',
            closed_at: '2026-04-09T10:00:00.000Z',
          }),
        },
      })
    );

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'update_task_fields_with_actor',
      expect.objectContaining({
        p_task_updates: expect.objectContaining({
          list_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          completed: true,
          completed_at: '2026-04-09T10:00:00.000Z',
          closed_at: '2026-04-09T10:00:00.000Z',
        }),
      })
    );

    // done -> active should clear completion timestamps
    mocks.taskListMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        board_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'active',
        deleted: false,
        workspace_boards: {
          ws_id: '00000000-0000-0000-0000-000000000000',
        },
      },
      error: null,
    });
    mocks.tasksEq.mockResolvedValueOnce({
      data: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          list_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          completed: true,
          completed_at: '2026-01-01T00:00:00.000Z',
          closed_at: '2026-01-02T00:00:00.000Z',
          task_lists: {
            status: 'done',
            board_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            workspace_boards: {
              ws_id: '00000000-0000-0000-0000-000000000000',
            },
          },
        },
      ],
      error: null,
    });
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'ok-3' }], error: null });

    const exitingCompletionResponse = await POST(
      asNextRequest(
        new Request('http://localhost/api/v1/workspaces/ws-1/tasks/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds: ['22222222-2222-4222-8222-222222222222'],
            operation: {
              type: 'move_to_list',
              listId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            },
          }),
        })
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(exitingCompletionResponse.status).toBe(200);
    await expect(exitingCompletionResponse.json()).resolves.toEqual(
      expect.objectContaining({
        taskMetaById: {
          '22222222-2222-4222-8222-222222222222': expect.objectContaining({
            list_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            completed_at: null,
            closed_at: null,
          }),
        },
      })
    );

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'update_task_fields_with_actor',
      expect.objectContaining({
        p_task_updates: expect.objectContaining({
          list_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          completed: false,
          completed_at: null,
          closed_at: null,
        }),
      })
    );
  });

  it('treats duplicate add_label writes as success', async () => {
    const { POST } = await import('./route.js');

    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

    const response = await POST(
      asNextRequest(
        new Request('http://localhost/api/v1/workspaces/ws-1/tasks/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds: [
              '22222222-2222-4222-8222-222222222222',
              '33333333-3333-4333-8333-333333333333',
            ],
            operation: {
              type: 'add_label',
              labelId: '55555555-5555-4555-8555-555555555555',
            },
          }),
        })
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        successCount: 2,
        failCount: 0,
        failures: [],
      })
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'add_task_label_with_actor',
      expect.any(Object)
    );
  });
});
