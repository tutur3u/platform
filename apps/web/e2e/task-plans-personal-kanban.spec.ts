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
    { params: { page: '1', pageSize: '20', status: 'active' } }
  );
  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as { boards?: TaskBoard[] };
  const board = body.boards?.find((candidate) => candidate.ws_id);
  if (board) return board;

  const createResponse = await request.post(
    '/api/v1/workspaces/personal/task-boards',
    {
      data: { name: `E2E Plan Board ${Date.now()}` },
      headers,
    }
  );
  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as { board?: TaskBoard };
  expect(createBody.board?.ws_id).toBeTruthy();
  return createBody.board as TaskBoard;
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
  if (existingList) return existingList;

  const createResponse = await request.post(
    `/api/v1/workspaces/personal/task-boards/${boardId}/lists`,
    {
      data: {
        color: 'BLUE',
        name: `E2E Plan List ${Date.now()}`,
        status: 'not_started',
      },
      headers,
    }
  );
  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as { list?: TaskList };
  expect(createBody.list?.id).toBeTruthy();
  return createBody.list as TaskList;
}

test.describe('Shareable task plans in personal Kanban', () => {
  test.setTimeout(180_000);

  test('creates, shares, manages, and renders a plan', async ({
    page,
    request,
  }, testInfo) => {
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 244));
    await resetDbRateLimits();
    await resetAppRateLimitStateForTests(request, {
      completeOnboarding: true,
      email: TEST_USER.email,
      headers,
      locale: DEFAULT_LOCALE,
    });

    const board = await getPersonalBoard(request, headers);
    const list = await getOrCreateBoardList(request, board.id, headers);
    const timestamp = Date.now();
    let planId: string | null = null;
    let taskId: string | null = null;

    try {
      const createPlan = await request.post(
        '/api/v1/workspaces/personal/task-plans',
        {
          data: {
            title: `E2E weekly plan ${timestamp}`,
            period_type: 'week',
            period_start: '2026-06-22',
            period_end: '2026-06-28',
            default_target_ws_id: board.ws_id,
            default_target_board_id: board.id,
            default_target_list_id: list.id,
            intended_workspace_ids: [board.ws_id],
          },
          headers,
        }
      );
      expect(createPlan.ok()).toBeTruthy();
      const createPlanBody = (await createPlan.json()) as {
        plan?: { id?: string };
      };
      planId = createPlanBody.plan?.id ?? null;
      expect(planId).toBeTruthy();

      await page.goto(`/${DEFAULT_LOCALE}/personal/tasks/boards/${board.id}`, {
        waitUntil: 'domcontentloaded',
      });

      const plannerTrigger = page.getByRole('button', { name: /^planner$/i });
      await expect(plannerTrigger).toBeVisible();
      await expect(page.getByPlaceholder('Task title')).toHaveCount(0);
      await plannerTrigger.click();
      await expect(
        page.getByRole('dialog', { name: /planner/i })
      ).toBeVisible();
      await expect(
        page.getByText(`E2E weekly plan ${timestamp}`)
      ).toBeVisible();
      await page.getByRole('button', { name: /target workspace/i }).click();
      await expect(page.getByPlaceholder('Task title')).toBeVisible();

      const createItem = await request.post(
        `/api/v1/workspaces/personal/task-plans/${planId}/items`,
        {
          data: {
            target_ws_id: board.ws_id,
            target_board_id: board.id,
            target_list_id: list.id,
            planned_start: '2026-06-23',
            snapshot_title: `E2E plan task ${timestamp}`,
            source_task: {
              name: `E2E plan task ${timestamp}`,
              listId: list.id,
              end_date: '2026-06-23',
            },
          },
          headers,
        }
      );
      expect(createItem.ok()).toBeTruthy();
      const createItemBody = (await createItem.json()) as {
        task?: { id?: string };
      };
      taskId = createItemBody.task?.id ?? null;
      expect(taskId).toBeTruthy();

      const share = await request.post(
        `/api/v1/workspaces/personal/task-plans/${planId}/shares`,
        {
          data: {
            shared_with_email: `plan-share-${timestamp}@example.com`,
            permission: 'view',
          },
          headers,
        }
      );
      expect(share.ok()).toBeTruthy();

      const update = await request.patch(
        `/api/v1/workspaces/personal/task-plans/${planId}`,
        {
          data: { status: 'active' },
          headers,
        }
      );
      expect(update.ok()).toBeTruthy();

      const digest = await request.get(
        `/api/v1/workspaces/personal/task-plans/${planId}/digest`
      );
      expect(digest.ok()).toBeTruthy();
      const digestBody = (await digest.json()) as { digest?: string };
      expect(digestBody.digest).toContain(`E2E plan task ${timestamp}`);
    } finally {
      if (taskId) {
        await request.delete(
          `/api/v1/workspaces/${board.ws_id}/tasks/${taskId}`,
          {
            failOnStatusCode: false,
            headers,
          }
        );
      }
      if (planId) {
        await request.delete(
          `/api/v1/workspaces/personal/task-plans/${planId}`,
          { failOnStatusCode: false, headers }
        );
      }
    }
  });
});
