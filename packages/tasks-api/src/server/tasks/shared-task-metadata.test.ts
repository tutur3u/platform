import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  boardTask,
  LOCAL_TASK_ID,
  mocks,
  PERSONAL_BOARD_ID,
  PERSONAL_WS_ID,
  queueAdminRpcResult,
  queueResult,
  resetTaskRouteFixtures,
  USER_ID,
} from './task-route.test-fixture';

const label = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  name: 'Workspace label',
  color: 'RED',
  created_at: '2026-05-17T00:00:00.000Z',
};
const project = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  name: 'Workspace project',
  status: 'active',
  ticket_key: 'PROJECT',
};
const ticket = { ticket_number: 42, created_at: label.created_at };

const auth = {
  supabase: mocks.memberClient as unknown as TypedSupabaseClient,
  user: { id: USER_ID } as SupabaseUser,
};
const context = {
  params: Promise.resolve({ wsId: PERSONAL_WS_ID, taskId: LOCAL_TASK_ID }),
};
const tasksUrl = `http://localhost/api/v1/workspaces/${PERSONAL_WS_ID}/tasks`;
const boardTasksUrl = `${tasksUrl}?boardId=${PERSONAL_BOARD_ID}&includeRelationshipSummary=false`;

function queueGuestShare(permission: 'view' | 'edit' = 'view') {
  mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
  queueResult(mocks.adminQueues, 'task_board_shares', {
    data: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
        board_id: PERSONAL_BOARD_ID,
        permission,
        shared_with_user_id: USER_ID,
        workspace_boards: { id: PERSONAL_BOARD_ID, ws_id: PERSONAL_WS_ID },
      },
    ],
    error: null,
  });
}

function queueGuestBoard() {
  queueGuestShare();
  queueResult(mocks.adminQueues, 'workspace_boards', {
    data: { id: PERSONAL_BOARD_ID, ws_id: PERSONAL_WS_ID },
    error: null,
  });
}

function expectedTaskMetadata(isGuest: boolean) {
  return {
    id: LOCAL_TASK_ID,
    labels: isGuest ? [] : [label],
    projects: isGuest ? [] : [{ ...project, ...ticket }],
    label_ids: isGuest ? [] : [label.id],
    project_ids: isGuest ? [] : [project.id],
  };
}

describe('shared task metadata', () => {
  beforeEach(resetTaskRouteFixtures);

  it.each(['view share', 'edit share', 'workspace member'] as const)(
    'scopes the single-task response for a caller with a %s',
    async (access) => {
      const task = boardTask(LOCAL_TASK_ID);
      const isGuest = access !== 'workspace member';
      if (isGuest) {
        queueGuestShare(access === 'view share' ? 'view' : 'edit');
        queueResult(mocks.adminQueues, 'tasks', { data: task, error: null });
      }
      queueResult(mocks.adminQueues, 'tasks', {
        data: {
          ...task,
          labels: [label],
          projects: [{ ...project, ...ticket }],
        },
        error: null,
      });
      queueAdminRpcResult('_resolve_workspace_tier', {
        data: 'PRO',
        error: null,
      });

      const { handleTaskDetailRouteGET } = await import('./taskId/route.js');
      const response = await handleTaskDetailRouteGET(
        new NextRequest(`${tasksUrl}/${LOCAL_TASK_ID}`),
        context,
        auth
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        task: expectedTaskMetadata(isGuest),
        taskWorkspaceTier: 'PRO',
      });
    }
  );

  it.each(['guest', 'member'] as const)(
    'scopes task list metadata for a %s',
    async (access) => {
      const isGuest = access === 'guest';
      if (isGuest) queueGuestBoard();
      queueResult(mocks.adminQueues, 'workspaces', {
        data: { personal: false },
        error: null,
      });
      queueResult(mocks.adminQueues, 'tasks', {
        data: [
          {
            ...boardTask(LOCAL_TASK_ID),
            labels: [{ label }],
            projects: [{ project, ...ticket }],
          },
        ],
        error: null,
      });

      const { handleTaskRouteGET } = await import('./route.js');
      const response = await handleTaskRouteGET(
        new NextRequest(boardTasksUrl),
        context,
        auth
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        tasks: [expectedTaskMetadata(isGuest)],
      });
    }
  );

  it('searches current and retained board tickets for a share guest', async () => {
    queueGuestBoard();
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueAdminRpcResult('list_board_task_ids_by_ticket_prefix', {
      data: [{ id: LOCAL_TASK_ID }],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [boardTask(LOCAL_TASK_ID)],
      error: null,
      count: 1,
    });

    const { handleTaskRouteGET } = await import('./route.js');
    const response = await handleTaskRouteGET(
      new NextRequest(`${boardTasksUrl}&identifier=BOARD-44&includeCount=true`),
      context,
      auth
    );

    expect(response.status).toBe(200);
    expect(mocks.adminSchemaClient.rpc).toHaveBeenCalledWith(
      'list_board_task_ids_by_ticket_prefix',
      {
        p_workspace_ids: [PERSONAL_WS_ID],
        p_ticket_prefix: 'BOARD',
        p_display_number: 44,
      }
    );
    expect(mocks.adminClient.from).not.toHaveBeenCalledWith(
      'task_project_tasks'
    );
    expect(
      mocks.adminQueries.find(({ table }) => table === 'tasks')?.calls
    ).toContainEqual(['in', ['id', [LOCAL_TASK_ID]]]);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [expectedTaskMetadata(true)],
      count: 1,
    });
  });

  it.each(['labelIds', 'projectIds'])(
    'rejects a guest task list filter on %s',
    async (filter) => {
      queueGuestBoard();
      const { handleTaskRouteGET } = await import('./route.js');
      const response = await handleTaskRouteGET(
        new NextRequest(
          `${boardTasksUrl}&includeListCounts=true&${filter}=${label.id}`
        ),
        context,
        auth
      );

      expect(response.status).toBe(403);
      expect(mocks.adminClient.from).not.toHaveBeenCalledWith('tasks');
      expect(mocks.adminSchemaClient.rpc).not.toHaveBeenCalled();
    }
  );
});
