import { type APIRequestContext, expect, test } from '@playwright/test';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetAppRateLimitStateForTests,
  resetDbRateLimits,
} from './helpers/rate-limits';

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

async function getPersonalBoard(
  request: APIRequestContext,
  headers: Record<string, string>
) {
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
  const existingBoard = body.boards?.find((candidate) => candidate.ws_id);

  if (existingBoard) {
    return existingBoard;
  }

  const createResponse = await request.post(
    '/api/v1/workspaces/personal/task-boards',
    {
      data: {
        name: `E2E Shared Board ${Date.now()}`,
      },
      headers,
    }
  );

  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as { board?: TaskBoard };
  const createdBoard = createBody.board;

  expect(
    createdBoard?.ws_id,
    'expected a personal task board for the owner'
  ).toBeTruthy();
  return createdBoard as TaskBoard;
}

async function getOrCreateBoardList(
  request: APIRequestContext,
  boardId: string,
  headers: Record<string, string>
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
        name: `E2E Shared List ${Date.now()}`,
        status: 'active',
      },
      headers,
    }
  );

  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as { list: TaskList };
  return { created: true, list: createBody.list };
}

test.describe
  .skip('Task board guest access', () => {
    test('limits a direct board guest to shared task boards and guest-safe actions', async ({
      baseURL,
      browser,
      request,
    }, testInfo) => {
      const origin = baseURL ?? 'https://tuturuuu.localhost';
      const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 212));

      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: TEST_USER.email,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const board = await getPersonalBoard(request, headers);
      const { created: createdList, list } = await getOrCreateBoardList(
        request,
        board.id,
        headers
      );
      const guestEmail = `e2e-board-guest-${Date.now()}@tuturuuu.com`;
      const guestContext = await browser.newContext({
        extraHTTPHeaders: headers,
      });
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
            headers,
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
              completeOnboarding: true,
              email: guestEmail,
              locale: DEFAULT_LOCALE,
            },
            headers,
          }
        );
        expect(sessionResponse.ok()).toBeTruthy();

        const guestBoardsResponse = await guestPage.request.get(
          `${origin}/api/v1/workspaces/${board.ws_id}/task-boards`,
          {
            params: {
              status: 'active',
            },
            headers,
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
            headers,
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
            headers,
          }
        );
        expect(updateShareResponse.ok()).toBeTruthy();

        const guestTaskName = `E2E guest-created task ${Date.now()}`;
        const createTaskResponse = await guestPage.request.post(
          `${origin}/api/v1/workspaces/${board.ws_id}/tasks`,
          {
            data: {
              listId: list.id,
              name: guestTaskName,
            },
            headers,
          }
        );
        expect(createTaskResponse.status()).toBe(201);
        const createTaskBody = (await createTaskResponse.json()) as {
          task?: { id?: string };
        };
        expect(createTaskBody.task?.id).toBeTruthy();
        createdTaskIds.push(createTaskBody.task!.id!);

        const deniedDeleteResponse = await guestPage.request.delete(
          `${origin}/api/v1/workspaces/${board.ws_id}/tasks/${createTaskBody.task!.id}`,
          { failOnStatusCode: false, headers }
        );
        expect(deniedDeleteResponse.status()).toBe(403);

        const guestBoardPath = `/${board.ws_id}/tasks/boards/${board.id}`;
        const localizedGuestBoardPath = `/${DEFAULT_LOCALE}${guestBoardPath}`;
        await guestPage.goto(`${origin}${localizedGuestBoardPath}`, {
          waitUntil: 'domcontentloaded',
        });
        await expect(guestPage).toHaveURL(
          (url) =>
            url.pathname === guestBoardPath ||
            url.pathname === localizedGuestBoardPath,
          { timeout: 30_000 }
        );
        await expect(guestPage.locator('body')).not.toContainText(
          'Board not found'
        );
        await expect(
          guestPage.getByText(guestTaskName, { exact: true }).first()
        ).toBeVisible({ timeout: 30_000 });

        await guestPage
          .getByRole('button', { name: /select a workspace/i })
          .click();
        await expect(guestPage.getByText('Shared with me')).toBeVisible();
        await expect(guestPage.getByText('Guest access')).toBeVisible();
        await expect(guestPage.getByText('Tasks only')).toBeVisible();
      } finally {
        await guestContext.close();

        for (const taskId of createdTaskIds) {
          await request.delete(`/api/v1/workspaces/personal/tasks/${taskId}`, {
            failOnStatusCode: false,
            headers,
          });
        }

        if (shareId) {
          await request.delete(
            `/api/v1/workspaces/personal/task-boards/${board.id}/shares?shareId=${shareId}`,
            { failOnStatusCode: false, headers }
          );
        }

        if (createdList) {
          await request.patch(
            `/api/v1/workspaces/personal/task-boards/${board.id}/lists/${list.id}`,
            {
              data: { deleted: true },
              failOnStatusCode: false,
              headers,
            }
          );
        }
      }
    });
  });
