import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetAppRateLimitStateForTests,
  resetDbRateLimits,
} from './helpers/rate-limits';

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
  boardId: string,
  headers: Record<string, string>
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
      headers,
    }
  );

  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as { list: TaskList };
  return { created: true, list: createBody.list };
}

async function createPersonalTask(
  request: APIRequestContext,
  listId: string,
  name: string,
  headers: Record<string, string>
) {
  const response = await request.post('/api/v1/workspaces/personal/tasks', {
    data: {
      listId,
      name,
    },
    headers,
  });

  expect(response.status()).toBe(201);
  const body = (await response.json()) as { task?: { id?: string } };
  expect(body.task?.id, 'expected created task id').toBeTruthy();

  return body.task!.id!;
}

async function waitForTaskDescriptionEditor(
  targetPage: Page,
  taskName: string
) {
  await expect(targetPage.locator('[data-task-name-input]')).toHaveValue(
    taskName,
    { timeout: 30_000 }
  );

  const editor = targetPage
    .locator('.ProseMirror[contenteditable="true"]')
    .first();
  const editorAlreadyVisible = await editor
    .isVisible({ timeout: 1_000 })
    .catch(() => false);

  if (!editorAlreadyVisible) {
    const fullscreenButton = targetPage.getByRole('button', {
      name: 'Open fullscreen',
    });
    const canOpenFullscreen = await fullscreenButton
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (canOpenFullscreen) {
      await fullscreenButton.click();
    }
  }

  await expect(editor).toBeVisible({ timeout: 30_000 });
  await expect(editor).toHaveAttribute('contenteditable', 'true', {
    timeout: 30_000,
  });
  await expect(
    targetPage.getByText('Syncing collaboration state...')
  ).toBeHidden({
    timeout: 30_000,
  });

  return editor;
}

async function typeTwoParagraphDescription(
  targetPage: Page,
  editor: Locator,
  firstLine: string,
  secondLine: string
) {
  await targetPage.bringToFront();
  await editor.click();
  await expect(editor).toBeFocused();
  await targetPage.keyboard.type(firstLine, { delay: 10 });
  await expect(editor).toContainText(firstLine, { timeout: 10_000 });

  await targetPage.keyboard.press('Enter');
  await expect(editor.locator('p')).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(editor.locator('p').nth(0)).toContainText(firstLine);
  await expect(editor.locator('p').nth(1)).toHaveText('');

  await targetPage.keyboard.type(secondLine, { delay: 10 });
  await expect(editor.locator('p')).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(editor.locator('p').nth(0)).toContainText(firstLine);
  await expect(editor.locator('p').nth(1)).toContainText(secondLine);
}

function splitStringIntoChunks(value: string, chunkLength = 45_000) {
  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += chunkLength) {
    chunks.push(value.slice(index, index + chunkLength));
  }

  return chunks;
}

async function persistDescriptionWithChunks({
  description,
  headers,
  request,
  taskId,
}: {
  description: string;
  headers: Record<string, string>;
  request: APIRequestContext;
  taskId: string;
}) {
  const chunks = splitStringIntoChunks(description);
  const beginResponse = await request.patch(
    `/api/v1/workspaces/personal/tasks/${taskId}/description`,
    {
      data: {
        action: 'begin',
        fields: {
          description: {
            chunk_count: chunks.length,
            total_length: description.length,
          },
        },
      },
      headers,
    }
  );

  expect(beginResponse.ok()).toBeTruthy();
  const { session_id: sessionId } = (await beginResponse.json()) as {
    session_id: string;
  };

  for (let index = 0; index < chunks.length; index += 1) {
    const appendResponse = await request.patch(
      `/api/v1/workspaces/personal/tasks/${taskId}/description`,
      {
        data: {
          action: 'append',
          chunk: chunks[index],
          chunk_index: index,
          field: 'description',
          session_id: sessionId,
        },
        headers,
      }
    );

    expect(appendResponse.ok()).toBeTruthy();
  }

  const commitResponse = await request.patch(
    `/api/v1/workspaces/personal/tasks/${taskId}/description`,
    {
      data: {
        action: 'commit',
        session_id: sessionId,
      },
      headers,
    }
  );

  expect(commitResponse.ok()).toBeTruthy();
  await expect(commitResponse.json()).resolves.toMatchObject({
    description,
  });
}

test.describe('Task board realtime and task mutations', () => {
  test('created task appears in another open board tab without losing board state', async ({
    context,
    page,
    request,
  }, testInfo) => {
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 213));

    await resetDbRateLimits();
    await resetAppRateLimitStateForTests(request, {
      completeOnboarding: true,
      email: TEST_USER.email,
      headers,
      locale: DEFAULT_LOCALE,
    });
    await context.setExtraHTTPHeaders(headers);

    const board = await getPersonalBoard(request);
    const { created: createdList, list } = await getOrCreatePersonalBoardList(
      request,
      board.id,
      headers
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
      if (
        (await aiSwitch.isVisible().catch(() => false)) &&
        (await aiSwitch.isChecked())
      ) {
        await aiSwitch.click();
        await expect(aiSwitch).not.toBeChecked();
      }

      const taskInput = page
        .getByPlaceholder(/add a new task|what needs to be done/i)
        .first();
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
          headers,
        });
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

  test('task description insertions and deletions sync between open clients', async ({
    context,
    page,
    request,
  }, testInfo) => {
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 213));

    await resetDbRateLimits();
    await resetAppRateLimitStateForTests(request, {
      completeOnboarding: true,
      email: TEST_USER.email,
      headers,
      locale: DEFAULT_LOCALE,
    });
    await context.setExtraHTTPHeaders(headers);

    const board = await getPersonalBoard(request);
    const { created: createdList, list } = await getOrCreatePersonalBoardList(
      request,
      board.id,
      headers
    );
    const taskName = `E2E realtime description ${Date.now()}`;
    const taskId = await createPersonalTask(
      request,
      list.id,
      taskName,
      headers
    );
    const taskPath = `/${DEFAULT_LOCALE}/personal/tasks/${taskId}`;
    const secondPage = await context.newPage();
    const firstLine = `Inserted realtime line one ${Date.now()}`;
    const secondLine = `Inserted realtime line two ${Date.now()}`;

    try {
      await page.goto(taskPath, { waitUntil: 'domcontentloaded' });
      const firstEditor = await waitForTaskDescriptionEditor(page, taskName);

      await secondPage.goto(taskPath, { waitUntil: 'domcontentloaded' });
      const secondEditor = await waitForTaskDescriptionEditor(
        secondPage,
        taskName
      );

      // Opening the second client can briefly re-sync Yjs on the first editor.
      await expect(page.getByText('Syncing collaboration state...')).toBeHidden(
        {
          timeout: 30_000,
        }
      );

      await typeTwoParagraphDescription(
        page,
        firstEditor,
        firstLine,
        secondLine
      );

      await expect(secondEditor.locator('p')).toHaveCount(2, {
        timeout: 30_000,
      });
      await expect(secondEditor.locator('p').nth(0)).toContainText(firstLine, {
        timeout: 30_000,
      });
      await expect(secondEditor.locator('p').nth(1)).toContainText(secondLine, {
        timeout: 30_000,
      });

      await page.bringToFront();
      await firstEditor.click();
      await expect(firstEditor).toBeFocused();
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
        headers,
      });

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

  test('chunked task description update persists large pasted content', async ({
    context,
    page,
    request,
  }, testInfo) => {
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 214));

    await resetDbRateLimits();
    await resetAppRateLimitStateForTests(request, {
      completeOnboarding: true,
      email: TEST_USER.email,
      headers,
      locale: DEFAULT_LOCALE,
    });
    await context.setExtraHTTPHeaders(headers);

    const board = await getPersonalBoard(request);
    const { created: createdList, list } = await getOrCreatePersonalBoardList(
      request,
      board.id,
      headers
    );
    const marker = `Chunked paste marker ${Date.now()}`;
    const taskName = `E2E chunked description ${Date.now()}`;
    const taskId = await createPersonalTask(
      request,
      list.id,
      taskName,
      headers
    );
    const taskPath = `/${DEFAULT_LOCALE}/personal/tasks/${taskId}`;
    const largeText = `${marker}\n${'Large pasted content '.repeat(4_000)}`;
    const description = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: largeText }],
        },
      ],
    });

    try {
      await persistDescriptionWithChunks({
        description,
        headers,
        request,
        taskId,
      });

      await page.goto(taskPath, { waitUntil: 'domcontentloaded' });
      const editor = await waitForTaskDescriptionEditor(page, taskName);
      await expect(editor).toContainText(marker, { timeout: 30_000 });
    } finally {
      await request.delete(`/api/v1/workspaces/personal/tasks/${taskId}`, {
        failOnStatusCode: false,
        headers,
      });

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
