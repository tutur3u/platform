import { expect, test } from '@playwright/test';
import {
  addWorkspaceTaskLabel,
  listWorkspaceLabels,
  listWorkspaceTaskBoardViewableMembers,
  listWorkspaceTaskProjectsByIds,
  removeWorkspaceTaskLabel,
  upsertCurrentUserTaskPersonalPlacement,
} from '../../../packages/internal-api/src/tasks';
import { getTaskCardResourceContext } from '../../../packages/tasks-ui/src/tu-do/boards/boardId/task-card/task-card-resource-context';

const REPORTED_TASK_ID = 'bdd713b7-a7d0-4e8d-b651-399d6006e794';
const REPORTED_PERSONAL_BOARD_ID = '2ad6c068-c69d-4011-a3c8-46ac45c3cd05';
const REPORTED_PERSONAL_LIST_ID = '16b3fb2f-49ce-4e2b-9d6d-04d9b6f6bc29';
const REPORTED_PREVIOUS_TASK_ID = 'fee133d5-45b3-4561-99ee-2c9b74753e5a';

test.describe('Tasks satellite source resource routing', () => {
  test('keeps source-task support APIs on the tasks origin and source workspace', async () => {
    const requestedUrls: string[] = [];
    const requestedRequests: Array<{ body?: string | null; method: string }> =
      [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      requestedUrls.push(url);
      requestedRequests.push({
        body:
          typeof init?.body === 'string'
            ? init.body
            : typeof Request !== 'undefined' && input instanceof Request
              ? await input.clone().text()
              : null,
        method:
          init?.method ??
          (typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : 'GET'),
      });

      return new Response(
        JSON.stringify(
          url.includes('/viewable-members') ? { members: [] } : []
        ),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    };

    const resourceContext = getTaskCardResourceContext({
      boardId: 'personal-board',
      pageWorkspaceId: 'personal-workspace',
      propAvailableLists: [
        {
          archived: false,
          board_id: 'personal-board',
          color: 'BLUE',
          created_at: '2026-07-04T00:00:00.000Z',
          creator_id: 'user-1',
          deleted: false,
          id: 'personal-list',
          name: 'Personal',
          position: 0,
          status: 'not_started',
        },
      ],
      task: {
        created_at: '2026-07-04T00:00:00.000Z',
        description: '',
        display_number: 1,
        end_date: null,
        id: 'task-1',
        list_id: 'personal-list',
        name: 'External task',
        priority: 'normal',
        projects: [{ id: 'source-project', name: 'Source project' }],
        source_board_id: 'source-board',
        source_workspace_id: 'source-workspace',
      },
    });

    expect(resourceContext).toMatchObject({
      boardViewableMembersBoardId: 'source-board',
      boardViewableMembersWorkspaceId: 'source-workspace',
      effectiveWorkspaceId: 'source-workspace',
      initialAvailableLists: undefined,
      taskBoardId: 'source-board',
    });

    const clientOptions = {
      baseUrl: 'https://tasks.tuturuuu.test',
      fetch: fetchMock,
    };

    await listWorkspaceLabels(
      resourceContext.effectiveWorkspaceId ?? '',
      clientOptions
    );
    await listWorkspaceTaskProjectsByIds(
      resourceContext.effectiveWorkspaceId ?? '',
      ['source-project'],
      clientOptions
    );
    await listWorkspaceTaskBoardViewableMembers(
      resourceContext.boardViewableMembersWorkspaceId ?? '',
      resourceContext.boardViewableMembersBoardId,
      clientOptions
    );
    await addWorkspaceTaskLabel(
      resourceContext.effectiveWorkspaceId ?? '',
      'task-1',
      'label-1',
      clientOptions
    );
    await removeWorkspaceTaskLabel(
      resourceContext.effectiveWorkspaceId ?? '',
      'task-1',
      'label-1',
      clientOptions
    );

    expect(requestedUrls).toEqual([
      'https://tasks.tuturuuu.test/api/v1/workspaces/source-workspace/labels',
      'https://tasks.tuturuuu.test/api/v1/workspaces/source-workspace/task-projects?compact=true&ids=source-project',
      'https://tasks.tuturuuu.test/api/v1/workspaces/source-workspace/task-boards/source-board/viewable-members',
      'https://tasks.tuturuuu.test/api/v1/workspaces/source-workspace/tasks/task-1/labels',
      'https://tasks.tuturuuu.test/api/v1/workspaces/source-workspace/tasks/task-1/labels',
    ]);
    expect(requestedRequests).toEqual([
      { body: null, method: 'GET' },
      { body: null, method: 'GET' },
      { body: null, method: 'GET' },
      { body: JSON.stringify({ labelId: 'label-1' }), method: 'POST' },
      { body: JSON.stringify({ labelId: 'label-1' }), method: 'DELETE' },
    ]);
    expect(requestedUrls.join('\n')).not.toContain('personal-workspace');
    expect(requestedUrls.join('\n')).not.toContain('https://tuturuuu.com');
  });

  test('sends personal placement moves to the tasks origin with the reported payload shape', async () => {
    const requestedUrls: string[] = [];
    const requestedRequests: Array<{ body?: string | null; method: string }> =
      [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      requestedUrls.push(url);
      requestedRequests.push({
        body:
          typeof init?.body === 'string'
            ? init.body
            : typeof Request !== 'undefined' && input instanceof Request
              ? await input.clone().text()
              : null,
        method:
          init?.method ??
          (typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : 'GET'),
      });

      return new Response(
        JSON.stringify({
          task: {
            id: REPORTED_TASK_ID,
            personal_board_id: REPORTED_PERSONAL_BOARD_ID,
            personal_list_id: REPORTED_PERSONAL_LIST_ID,
            personal_sort_key: 2_000_000,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    };
    const payload = {
      personal_board_id: REPORTED_PERSONAL_BOARD_ID,
      personal_list_id: REPORTED_PERSONAL_LIST_ID,
      personal_sort_key: 2_000_000,
      previous_task_id: REPORTED_PREVIOUS_TASK_ID,
      next_task_id: null,
    };

    await upsertCurrentUserTaskPersonalPlacement(REPORTED_TASK_ID, payload, {
      baseUrl: 'https://tasks.tuturuuu.test',
      fetch: fetchMock,
    });

    expect(requestedUrls).toEqual([
      `https://tasks.tuturuuu.test/api/v1/users/me/tasks/${REPORTED_TASK_ID}/personal-placement`,
    ]);
    expect(requestedRequests).toEqual([
      { body: JSON.stringify(payload), method: 'PUT' },
    ]);
    expect(requestedUrls.join('\n')).not.toContain('https://tuturuuu.com');
  });
});
