import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetAppRateLimitStateForTests,
  resetDbRateLimits,
} from './helpers/rate-limits';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

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

type TaskTemplate = {
  default_board_id: string | null;
  default_list_id: string | null;
  description: string | null;
  id: string;
  name: string;
  priority: string | null;
  slug: string;
  task_name: string;
};

type TaskRecord = {
  description?: string | null;
  id: string;
  name: string;
  priority?: string | null;
};

function serviceHeaders(prefer?: string) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

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
  const existingBoard = body.boards?.find((candidate) => candidate.ws_id);
  if (existingBoard) return { board: existingBoard, created: false };

  const createResponse = await request.post(
    '/api/v1/workspaces/personal/task-boards',
    {
      data: { name: `E2E Task Template Board ${Date.now()}` },
      headers,
    }
  );
  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as { board?: TaskBoard };
  expect(createBody.board?.ws_id).toBeTruthy();
  return { board: createBody.board as TaskBoard, created: true };
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
        name: `E2E Task Template List ${Date.now()}`,
        status: 'active',
      },
      headers,
    }
  );
  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as { list?: TaskList };
  expect(createBody.list?.id).toBeTruthy();
  return { created: true, list: createBody.list as TaskList };
}

async function getTaskTemplate(
  request: APIRequestContext,
  slug: string,
  headers: Record<string, string>
) {
  const response = await request.get(
    `/api/v1/workspaces/personal/task-templates/${slug}`,
    { headers }
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { template: TaskTemplate };
  return body.template;
}

async function findTaskByName(
  request: APIRequestContext,
  name: string,
  headers: Record<string, string>
) {
  const response = await request.get('/api/v1/workspaces/personal/tasks', {
    headers,
    params: { q: name },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { tasks?: TaskRecord[] };
  return body.tasks?.find((task) => task.name === name) ?? null;
}

test.describe('Task templates', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test.setTimeout(180_000);

  test('creates, uses, saves, and keeps board-template routes compatible', async ({
    page,
    request,
  }, testInfo) => {
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 246));
    const suffix = randomUUID().slice(0, 8);
    const uiTemplateName = `E2E UI Template ${suffix}`;
    const uiTemplateSlug = `e2e-ui-template-${suffix}`;
    const uiTaskTitle = `E2E template task ${suffix}`;
    const uiOverrideTitle = `E2E override task ${suffix}`;
    const savedTemplateName = `E2E saved template ${suffix}`;
    const savedTaskTitle = `E2E saved source task ${suffix}`;
    const savedOverrideTitle = `E2E saved override ${suffix}`;
    const boardTemplateName = `E2E Board Template ${suffix}`;
    const createdTaskIds: string[] = [];
    const createdTemplateSlugs = [uiTemplateSlug];
    let savedTemplateSlug: string | null = null;
    let boardTemplateId: string | null = null;
    let createdList = false;
    let createdBoard = false;
    let board: TaskBoard | null = null;
    let list: TaskList | null = null;

    await resetDbRateLimits();
    await resetAppRateLimitStateForTests(request, {
      completeOnboarding: true,
      email: TEST_USER.email,
      headers,
      locale: DEFAULT_LOCALE,
    });

    try {
      const boardResult = await getPersonalBoard(request, headers);
      board = boardResult.board;
      createdBoard = boardResult.created;
      const listResult = await getOrCreateBoardList(request, board.id, headers);
      list = listResult.list;
      createdList = listResult.created;

      await page.goto(`/${DEFAULT_LOCALE}/personal/tasks/templates`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(
        page.getByRole('tab', { name: /task templates/i })
      ).toHaveAttribute('data-state', 'active');
      await expect(
        page.getByRole('tab', { name: /board templates/i })
      ).toBeVisible();

      await page.getByRole('button', { name: /new template/i }).click();
      await page.getByLabel('Template name').fill(uiTemplateName);
      await page.getByLabel('Key').fill(uiTemplateSlug);
      await page.getByLabel('Task title').fill(uiTaskTitle);
      await page.getByLabel('Description').fill('Created through Playwright');
      await page
        .getByRole('dialog', { name: /create task template/i })
        .getByRole('button', { name: /create template/i })
        .click();

      await expect(page.getByText(uiTemplateName)).toBeVisible({
        timeout: 30_000,
      });

      const uiTemplate = await getTaskTemplate(
        request,
        uiTemplateSlug,
        headers
      );
      expect(uiTemplate.task_name).toBe(uiTaskTitle);

      const patchTemplate = await request.patch(
        `/api/v1/workspaces/personal/task-templates/${uiTemplateSlug}`,
        {
          data: {
            default_board_id: board.id,
            default_list_id: list.id,
            priority: 'high',
          },
          headers,
        }
      );
      expect(patchTemplate.ok()).toBeTruthy();

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('Search task templates').fill(uiTemplateName);
      await page.getByRole('button', { name: /^use$/i }).first().click();
      await page.getByLabel('Override task title').fill(uiOverrideTitle);
      await page
        .getByRole('dialog', { name: /use task template/i })
        .getByRole('button', { name: /create task/i })
        .click();

      await expect
        .poll(
          async () =>
            (await findTaskByName(request, uiOverrideTitle, headers))?.id ??
            null,
          {
            timeout: 30_000,
          }
        )
        .not.toBeNull();
      const uiCreatedTask = await findTaskByName(
        request,
        uiOverrideTitle,
        headers
      );
      createdTaskIds.push(uiCreatedTask!.id);

      const sourceTaskResponse = await request.post(
        '/api/v1/workspaces/personal/tasks',
        {
          data: {
            description: 'Save-from-task source description',
            listId: list.id,
            name: savedTaskTitle,
            priority: 'critical',
          },
          headers,
        }
      );
      expect(sourceTaskResponse.status()).toBe(201);
      const sourceTaskBody = (await sourceTaskResponse.json()) as {
        task?: { id?: string };
      };
      const sourceTaskId = sourceTaskBody.task?.id;
      expect(sourceTaskId).toBeTruthy();
      createdTaskIds.push(sourceTaskId!);

      const saveTemplateResponse = await request.post(
        '/api/v1/workspaces/personal/task-templates/from-task',
        {
          data: {
            name: savedTemplateName,
            taskId: sourceTaskId,
            visibility: 'private',
          },
          headers,
        }
      );
      expect(saveTemplateResponse.status()).toBe(201);
      const saveTemplateBody = (await saveTemplateResponse.json()) as {
        template: TaskTemplate;
      };
      savedTemplateSlug = saveTemplateBody.template.slug;
      createdTemplateSlugs.push(savedTemplateSlug);
      expect(saveTemplateBody.template.description).toBe(
        'Save-from-task source description'
      );

      const instantiateResponse = await request.post(
        `/api/v1/workspaces/personal/task-templates/${savedTemplateSlug}/instantiate`,
        {
          data: {
            listId: list.id,
            name: savedOverrideTitle,
          },
          headers,
        }
      );
      expect(instantiateResponse.ok()).toBeTruthy();
      const instantiateBody = (await instantiateResponse.json()) as {
        task?: TaskRecord;
        template?: TaskTemplate;
      };
      expect(instantiateBody.task?.name).toBe(savedOverrideTitle);
      expect(instantiateBody.template?.task_name).toBe(savedTaskTitle);
      expect(instantiateBody.template?.priority).toBe('critical');
      expect(instantiateBody.task?.id).toBeTruthy();
      createdTaskIds.push(instantiateBody.task!.id);

      const boardTemplateResponse = await request.post(
        `/api/v1/workspaces/personal/task-boards/${board.id}/templates`,
        {
          data: {
            description: 'Legacy board template detail compatibility',
            includeLabels: false,
            includeTasks: false,
            name: boardTemplateName,
            visibility: 'private',
          },
          headers,
        }
      );
      expect(boardTemplateResponse.ok()).toBeTruthy();

      const boardTemplatesResponse = await request.get(
        '/api/v1/workspaces/personal/templates',
        { headers }
      );
      expect(boardTemplatesResponse.ok()).toBeTruthy();
      const boardTemplatesBody = (await boardTemplatesResponse.json()) as {
        templates?: Array<{ id: string; name: string }>;
      };
      boardTemplateId =
        boardTemplatesBody.templates?.find(
          (template) => template.name === boardTemplateName
        )?.id ?? null;
      expect(boardTemplateId).toBeTruthy();

      await page.goto(`/${DEFAULT_LOCALE}/personal/tasks/templates`, {
        waitUntil: 'domcontentloaded',
      });
      await page.getByRole('tab', { name: /board templates/i }).click();
      const boardTemplateLink = page.getByRole('link', {
        name: boardTemplateName,
      });
      await expect(boardTemplateLink).toBeVisible();
      await boardTemplateLink.click();
      await expect(page).toHaveURL(
        new RegExp(`/personal/tasks/templates/${boardTemplateId}$`)
      );
      await expect(
        page.getByRole('heading', { level: 1, name: boardTemplateName })
      ).toBeVisible();
    } finally {
      for (const taskId of createdTaskIds) {
        await request.delete(`/api/v1/workspaces/personal/tasks/${taskId}`, {
          failOnStatusCode: false,
          headers,
          timeout: 10_000,
        });
      }

      for (const slug of createdTemplateSlugs) {
        await request.delete(
          `/api/v1/workspaces/personal/task-templates/${slug}`,
          {
            failOnStatusCode: false,
            headers,
            params: { permanent: 'true' },
            timeout: 10_000,
          }
        );
      }

      if (boardTemplateId) {
        await request.delete(
          `/api/v1/workspaces/personal/templates/${boardTemplateId}`,
          { failOnStatusCode: false, headers, timeout: 10_000 }
        );
        await request.delete(
          `${SUPABASE_URL}/rest/v1/board_templates?id=eq.${boardTemplateId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders('return=minimal'),
            timeout: 10_000,
          }
        );
      }

      if (createdList && board && list) {
        await request.delete(
          `/api/v1/workspaces/personal/task-boards/${board.id}/lists/${list.id}`,
          { failOnStatusCode: false, headers, timeout: 10_000 }
        );
      }

      if (createdBoard && board) {
        await request.delete(
          `/api/v1/workspaces/personal/task-boards/${board.id}`,
          { failOnStatusCode: false, headers, timeout: 10_000 }
        );
      }
    }
  });
});
