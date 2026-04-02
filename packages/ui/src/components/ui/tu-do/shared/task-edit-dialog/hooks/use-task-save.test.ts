import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const { mockCreateWorkspaceTaskRelationship } = vi.hoisted(() => ({
  mockCreateWorkspaceTaskRelationship: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/tasks', async () => {
  const actual = await vi.importActual<
    typeof import('@tuturuuu/internal-api/tasks')
  >('@tuturuuu/internal-api/tasks');

  return {
    ...actual,
    createWorkspaceTaskRelationship: mockCreateWorkspaceTaskRelationship,
  };
});

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
      }),
    },
  })),
}));

import {
  applyPendingRelationshipSummary,
  persistPendingTaskRelationships,
} from './use-task-save';

describe('persistPendingTaskRelationships', () => {
  it('persists pending relationships in deterministic order and invalidates affected tasks', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockCreateWorkspaceTaskRelationship.mockResolvedValue({});

    const affectedTaskIds = await persistPendingTaskRelationships(
      'workspace-1',
      'task-new',
      {
        parentTask: { id: 'task-parent', name: 'Parent task' },
        childTasks: [{ id: 'task-child', name: 'Child task' }],
        blockingTasks: [{ id: 'task-blocked', name: 'Blocked task' }],
        blockedByTasks: [{ id: 'task-blocker', name: 'Blocker task' }],
        relatedTasks: [{ id: 'task-related', name: 'Related task' }],
      },
      queryClient
    );

    expect(
      mockCreateWorkspaceTaskRelationship.mock.calls.map((call) => ({
        routeTaskId: call[1],
        sourceTaskId: call[2].source_task_id,
        targetTaskId: call[2].target_task_id,
        type: call[2].type,
      }))
    ).toEqual([
      {
        routeTaskId: 'task-parent',
        sourceTaskId: 'task-parent',
        targetTaskId: 'task-new',
        type: 'parent_child',
      },
      {
        routeTaskId: 'task-new',
        sourceTaskId: 'task-new',
        targetTaskId: 'task-child',
        type: 'parent_child',
      },
      {
        routeTaskId: 'task-new',
        sourceTaskId: 'task-new',
        targetTaskId: 'task-blocked',
        type: 'blocks',
      },
      {
        routeTaskId: 'task-blocker',
        sourceTaskId: 'task-blocker',
        targetTaskId: 'task-new',
        type: 'blocks',
      },
      {
        routeTaskId: 'task-related',
        sourceTaskId: 'task-related',
        targetTaskId: 'task-new',
        type: 'related',
      },
    ]);

    expect(new Set(affectedTaskIds)).toEqual(
      new Set([
        'task-new',
        'task-parent',
        'task-child',
        'task-blocked',
        'task-blocker',
        'task-related',
      ])
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(6);
  });
});

describe('applyPendingRelationshipSummary', () => {
  it('updates task cache relationship summaries for the new and affected tasks', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    queryClient.setQueryData(
      ['tasks', 'board-1'],
      [
        {
          id: 'task-parent',
          name: 'Parent',
          list_id: 'list-1',
          display_number: 1,
          created_at: '2024-01-01T00:00:00Z',
          relationship_summary: {
            parent_task_id: null,
            parent_task: null,
            child_count: 2,
            blocked_by_count: 0,
            blocking_count: 0,
            related_count: 0,
          },
        },
        {
          id: 'task-child',
          name: 'Child',
          list_id: 'list-1',
          display_number: 2,
          created_at: '2024-01-01T00:00:00Z',
          relationship_summary: {
            parent_task_id: null,
            parent_task: null,
            child_count: 0,
            blocked_by_count: 0,
            blocking_count: 0,
            related_count: 0,
          },
        },
        {
          id: 'task-new',
          name: 'New',
          list_id: 'list-1',
          display_number: 3,
          created_at: '2024-01-01T00:00:00Z',
        },
      ]
    );

    applyPendingRelationshipSummary({
      boardId: 'board-1',
      newTaskId: 'task-new',
      queryClient,
      pendingTaskRelationships: {
        parentTask: { id: 'task-parent', name: 'Parent' },
        childTasks: [{ id: 'task-child', name: 'Child' }],
        blockingTasks: [],
        blockedByTasks: [],
        relatedTasks: [],
      },
    });

    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([
      expect.objectContaining({
        id: 'task-parent',
        relationship_summary: expect.objectContaining({ child_count: 3 }),
      }),
      expect.objectContaining({
        id: 'task-child',
        relationship_summary: expect.objectContaining({
          parent_task_id: 'task-new',
          parent_task: expect.objectContaining({
            id: 'task-new',
            name: 'New',
          }),
        }),
      }),
      expect.objectContaining({
        id: 'task-new',
        relationship_summary: {
          parent_task_id: 'task-parent',
          parent_task: {
            id: 'task-parent',
            name: 'Parent',
            display_number: null,
            ticket_prefix: null,
          },
          child_count: 1,
          blocked_by_count: 0,
          blocking_count: 0,
          related_count: 0,
        },
      }),
    ]);
  });
});
