import { type APIRequestContext, expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';

type TaskBoard = {
  archived_at?: string | null;
  deleted_at?: string | null;
  id: string;
  name?: string | null;
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
  const board = body.boards?.find(
    (candidate) => !candidate.archived_at && !candidate.deleted_at
  );

  expect(
    board,
    'expected a personal task board for the e2e account'
  ).toBeTruthy();
  return board as TaskBoard;
}

async function getOrCreatePersonalBoardList(
  request: APIRequestContext,
  boardId: string
) {
  const listsResponse = await request.get(
    `/api/v1/workspaces/personal/task-boards/${boardId}/lists`
  );

  expect(listsResponse.ok()).toBeTruthy();
  const listsBody = (await listsResponse.json()) as { lists?: TaskList[] };
  const existingList = listsBody.lists?.find((list) => !list.deleted);

  if (existingList) {
    return { created: false, list: existingList };
  }

  const createResponse = await request.post(
    `/api/v1/workspaces/personal/task-boards/${boardId}/lists`,
    {
      data: {
        color: 'BLUE',
        name: `E2E Realtime ${Date.now()}`,
        status: 'not_started',
      },
    }
  );

  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as { list: TaskList };
  return { created: true, list: createBody.list };
}

async function createPersonalTask(
  request: APIRequestContext,
  listId: string,
  name: string
) {
  const response = await request.post('/api/v1/workspaces/personal/tasks', {
    data: {
      listId,
      name,
    },
  });

  expect(response.status()).toBe(201);
  const body = (await response.json()) as { task?: { id?: string } };
  expect(body.task?.id, 'expected created task id').toBeTruthy();

  return body.task!.id!;
}

test.describe('Task board realtime and task mutations', () => {
  test('created task appears in another open board tab without losing board state', async ({
    context,
    page,
    request,
  }) => {
    const board = await getPersonalBoard(request);
    const { created: createdList, list } = await getOrCreatePersonalBoardList(
      request,
      board.id
    );
    const boardPath = `/${DEFAULT_LOCALE}/personal/tasks/boards/${board.id}`;
    const secondPage = await context.newPage();
    const taskName = `E2E realtime task ${Date.now()}`;
    const createdTaskIds: string[] = [];

    try {
      await Promise.all([
        page.goto(boardPath, { waitUntil: 'domcontentloaded' }),
        secondPage.goto(boardPath, { waitUntil: 'domcontentloaded' }),
      ]);

      await expect(page.locator('body')).not.toContainText('Board not found');
      await expect(secondPage.locator('body')).not.toContainText(
        'Board not found'
      );

      await page
        .getByRole('button', { name: /add task/i })
        .last()
        .click();

      const aiSwitch = page.getByRole('switch', {
        name: /generate with ai/i,
      });
      await expect(aiSwitch).toBeVisible();
      if (await aiSwitch.isChecked()) {
        await aiSwitch.click();
        await expect(aiSwitch).not.toBeChecked();
      }

      const taskInput = page.getByPlaceholder('Add a new task...');
      await expect(taskInput).toBeVisible();

      await taskInput.fill(taskName);

      const createButton = page.getByRole('button', {
        name: /create task/i,
      });
      await expect(createButton).toBeEnabled();

      const createResponsePromise = page.waitForResponse((response) => {
        const request = response.request();
        return (
          request.method() === 'POST' &&
          new URL(response.url()).pathname ===
            '/api/v1/workspaces/personal/tasks'
        );
      });

      await createButton.click();

      const createResponse = await createResponsePromise;
      expect(createResponse.status()).toBe(201);
      const createBody = (await createResponse.json()) as {
        task?: { id?: string };
      };
      if (createBody.task?.id) {
        createdTaskIds.push(createBody.task.id);
      }

      await expect(
        page.getByText(taskName, { exact: true }).first()
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        secondPage.getByText(taskName, { exact: true }).first()
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('body')).not.toContainText('Board not found');
      await expect(secondPage.locator('body')).not.toContainText(
        'Board not found'
      );
    } finally {
      await secondPage.close();

      for (const taskId of createdTaskIds) {
        await request.delete(`/api/v1/workspaces/personal/tasks/${taskId}`, {
          failOnStatusCode: false,
        });
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

  test('task description insertions and deletions sync between open clients', async ({
    context,
    page,
    request,
  }) => {
    const board = await getPersonalBoard(request);
    const { created: createdList, list } = await getOrCreatePersonalBoardList(
      request,
      board.id
    );
    const taskName = `E2E realtime description ${Date.now()}`;
    const taskId = await createPersonalTask(request, list.id, taskName);
    const taskPath = `/${DEFAULT_LOCALE}/personal/tasks/${taskId}`;
    const secondPage = await context.newPage();
    const firstLine = `Inserted realtime line one ${Date.now()}`;
    const secondLine = `Inserted realtime line two ${Date.now()}`;

    try {
      await page.goto(taskPath, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-task-name-input]')).toHaveValue(
        taskName,
        { timeout: 30_000 }
      );

      const firstEditor = page.locator('.ProseMirror').first();
      await expect(firstEditor).toBeVisible({ timeout: 30_000 });
      await expect(firstEditor).toHaveAttribute('contenteditable', 'true', {
        timeout: 30_000,
      });

      await secondPage.goto(taskPath, { waitUntil: 'domcontentloaded' });
      await expect(secondPage.locator('[data-task-name-input]')).toHaveValue(
        taskName,
        { timeout: 30_000 }
      );

      const secondEditor = secondPage.locator('.ProseMirror').first();
      await expect(secondEditor).toBeVisible({ timeout: 30_000 });
      await expect(secondEditor).toHaveAttribute('contenteditable', 'true', {
        timeout: 30_000,
      });

      await firstEditor.click();
      await page.keyboard.type(firstLine, { delay: 10 });
      await page.keyboard.press('Enter');
      await page.keyboard.type(secondLine, { delay: 10 });

      await expect(firstEditor.locator('p')).toHaveCount(2, {
        timeout: 30_000,
      });
      await expect(firstEditor.locator('p').nth(0)).toContainText(firstLine);
      await expect(firstEditor.locator('p').nth(1)).toContainText(secondLine);

      await expect(secondEditor.locator('p')).toHaveCount(2, {
        timeout: 30_000,
      });
      await expect(secondEditor.locator('p').nth(0)).toContainText(firstLine, {
        timeout: 30_000,
      });
      await expect(secondEditor.locator('p').nth(1)).toContainText(secondLine, {
        timeout: 30_000,
      });

      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Backspace');

      await expect(secondEditor).not.toContainText(firstLine, {
        timeout: 30_000,
      });
      await expect(secondEditor).not.toContainText(secondLine, {
        timeout: 30_000,
      });
    } finally {
      await secondPage.close();

      await request.delete(`/api/v1/workspaces/personal/tasks/${taskId}`, {
        failOnStatusCode: false,
      });

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
