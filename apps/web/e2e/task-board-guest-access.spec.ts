import { type APIRequestContext, expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';

type TaskBoard = {
  id: string;
  name?: string | null;
  ws_id: string;
};

type TaskList = {
  deleted?: boolean | null;
  id: string;
  name?: string | null;
};

async function getPersonalBoard(request: APIRequestContext) {
  const response = await request.get(
    '/api/v1/workspaces/personal/task-boards',
    {
      params: {
        page: '1',
        pageSize: '20',
        status: 'active',
      },
    }
  );

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { boards?: TaskBoard[] };
  const board = body.boards?.find((candidate) => candidate.ws_id);

  expect(board, 'expected a personal task board for the owner').toBeTruthy();
  return board as TaskBoard;
}

async function getOrCreateBoardList(
  request: APIRequestContext,
  boardId: string
) {
  const listsResponse = await request.get(
    `/api/v1/workspaces/personal/task-boards/${boardId}/lists`
  );

  expect(listsResponse.ok()).toBeTruthy();
  const listsBody = (await listsResponse.json()) as { lists?: TaskList[] };
  const existingList = listsBody.lists?.find((list) => !list.deleted);

  if (existingList) return { created: false, list: existingList };

  const createResponse = await request.post(
    `/api/v1/workspaces/personal/task-boards/${boardId}/lists`,
    {
      data: {
        color: 'BLUE',
        name: `E2E Guest Access ${Date.now()}`,
        status: 'active',
      },
    }
  );

  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as { list: TaskList };
  return { created: true, list: createBody.list };
}

test.describe('Task board guest access', () => {
  test('limits a direct board guest to shared task boards and guest-safe actions', async ({
    baseURL,
    browser,
    request,
  }) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const board = await getPersonalBoard(request);
    const { created: createdList, list } = await getOrCreateBoardList(
      request,
      board.id
    );
    const guestEmail = `e2e-board-guest-${Date.now()}@tuturuuu.com`;
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    const createdTaskIds: string[] = [];
    let shareId: string | null = null;

    try {
      const shareResponse = await request.post(
        `/api/v1/workspaces/personal/task-boards/${board.id}/shares`,
        {
          data: {
            email: guestEmail,
            permission: 'view',
          },
        }
      );
      expect(shareResponse.status()).toBe(200);
      const shareBody = (await shareResponse.json()) as {
        share?: { id?: string };
      };
      shareId = shareBody.share?.id ?? null;
      expect(shareId, 'expected created board share id').toBeTruthy();

      const sessionResponse = await guestPage.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            email: guestEmail,
            locale: DEFAULT_LOCALE,
          },
        }
      );
      expect(sessionResponse.ok()).toBeTruthy();

      const guestBoardsResponse = await guestPage.request.get(
        `${origin}/api/v1/workspaces/${board.ws_id}/task-boards`,
        {
          params: {
            status: 'active',
          },
        }
      );
      expect(guestBoardsResponse.status()).toBe(200);
      const guestBoardsBody = (await guestBoardsResponse.json()) as {
        access_type?: string;
        boards?: Array<{ id: string; guest_permission?: string }>;
      };
      expect(guestBoardsBody.access_type).toBe('guest');
      expect(
        guestBoardsBody.boards?.map((guestBoard) => guestBoard.id)
      ).toEqual([board.id]);
      expect(guestBoardsBody.boards?.[0]?.guest_permission).toBe('view');

      const deniedCreateResponse = await guestPage.request.post(
        `${origin}/api/v1/workspaces/${board.ws_id}/tasks`,
        {
          data: {
            listId: list.id,
            name: 'View-only guest should not create this',
          },
          failOnStatusCode: false,
        }
      );
      expect(deniedCreateResponse.status()).toBe(403);

      const updateShareResponse = await request.patch(
        `/api/v1/workspaces/personal/task-boards/${board.id}/shares`,
        {
          data: {
            permission: 'edit',
            shareId,
          },
        }
      );
      expect(updateShareResponse.ok()).toBeTruthy();

      const createTaskResponse = await guestPage.request.post(
        `${origin}/api/v1/workspaces/${board.ws_id}/tasks`,
        {
          data: {
            listId: list.id,
            name: `E2E guest-created task ${Date.now()}`,
          },
        }
      );
      expect(createTaskResponse.status()).toBe(201);
      const createTaskBody = (await createTaskResponse.json()) as {
        task?: { id?: string };
      };
      expect(createTaskBody.task?.id).toBeTruthy();
      createdTaskIds.push(createTaskBody.task!.id!);

      const deniedDeleteResponse = await guestPage.request.delete(
        `${origin}/api/v1/workspaces/${board.ws_id}/tasks/${createdTaskBody.task!.id}`,
        { failOnStatusCode: false }
      );
      expect(deniedDeleteResponse.status()).toBe(403);

      await guestPage.goto(
        `${origin}/${DEFAULT_LOCALE}/${board.ws_id}/tasks/boards/${board.id}`,
        { waitUntil: 'domcontentloaded' }
      );
      await expect(guestPage.locator('body')).not.toContainText(
        'Board not found'
      );
      await expect(guestPage.getByText(board.name ?? 'Tasks')).toBeVisible({
        timeout: 30_000,
      });

      await guestPage
        .getByRole('button', { name: /select a workspace/i })
        .click();
      await expect(guestPage.getByText('Guest workspaces')).toBeVisible();
      await expect(guestPage.getByText('Guest access')).toBeVisible();
      await expect(guestPage.getByText('Tasks only')).toBeVisible();
    } finally {
      await guestContext.close();

      for (const taskId of createdTaskIds) {
        await request.delete(`/api/v1/workspaces/personal/tasks/${taskId}`, {
          failOnStatusCode: false,
        });
      }

      if (shareId) {
        await request.delete(
          `/api/v1/workspaces/personal/task-boards/${board.id}/shares?shareId=${shareId}`,
          { failOnStatusCode: false }
        );
      }

      if (createdList) {
        await request.patch(
          `/api/v1/workspaces/personal/task-boards/${board.id}/lists/${list.id}`,
          {
            data: { deleted: true },
            failOnStatusCode: false,
          }
        );
      }
    }
  });
});
