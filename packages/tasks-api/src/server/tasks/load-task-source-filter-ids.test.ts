import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { expect, it, vi } from 'vitest';
import { loadTaskSourceFilterIds } from './load-task-source-filter-ids';

it.each(['first', 'last'] as const)(
  'applies %s placement before pagination using the existing RPC',
  async (unprioritizedPosition) => {
    const rpc = vi.fn(async (_name, args) => {
      const ids = args.p_priorities ? ['high', 'low'] : ['high', 'low', 'none'];
      return {
        error: null,
        data: ids
          .slice(args.p_offset, args.p_offset + args.p_limit)
          .map((task_id) => ({
            task_id,
            list_id: 'list',
            total_count: ids.length,
          })),
      };
    });
    const sbAdmin = {
      schema: vi.fn(() => ({ rpc })),
    } as unknown as TypedSupabaseClient;
    const result = await loadTaskSourceFilterIds({
      sbAdmin,
      userId: 'actor',
      workspaceId: 'workspace',
      boardId: 'board',
      listId: 'list',
      sourceScope: 'current_board',
      sourceWorkspaceIds: [],
      sourceBoardIds: [],
      listStatuses: ['active'],
      parsedIdentifier: null,
      assignedToMe: false,
      completedMode: null,
      closedMode: null,
      includeArchivedBoards: false,
      includeDeletedMode: 'none',
      hasDueDate: false,
      externalSortBy: 'created-desc',
      sortBy: 'priority-high',
      labelIds: ['label'],
      assigneeIds: [],
      projectIds: [],
      priorities: [],
      estimationMin: null,
      estimationMax: null,
      dueDateFrom: null,
      dueDateTo: null,
      includeUnassigned: false,
      limit: 1,
      offset: 0,
      unprioritizedPosition,
    });
    expect(result).toEqual({
      count: 3,
      taskIds: [unprioritizedPosition === 'first' ? 'none' : 'high'],
    });
    for (const [name, args] of rpc.mock.calls) {
      expect(name).toBe('list_task_source_filter_ids');
      expect(args).toMatchObject({
        p_actor_id: 'actor',
        p_workspace_id: 'workspace',
        p_board_id: 'board',
        p_list_id: 'list',
        p_label_ids: ['label'],
        p_list_statuses: ['active'],
      });
    }
  }
);
