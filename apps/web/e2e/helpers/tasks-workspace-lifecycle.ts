import { expect, type Page } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './environment';

export const TASKS_E2E_ORIGIN =
  process.env.TASKS_BASE_URL ?? 'http://localhost:7809';
export const WEB_E2E_ORIGIN = process.env.BASE_URL ?? 'http://localhost:7803';

function isSafeLocalTasksOrigin(url: URL): boolean {
  const isDirectLocalhost =
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    url.port === '7809';
  const isPortlessLocalhost =
    url.protocol === 'https:' &&
    url.hostname === 'tasks.tuturuuu.localhost' &&
    url.port === '1355';

  return isDirectLocalhost || isPortlessLocalhost;
}

type LifecycleFixtures = {
  userEmails?: string[];
  userIds?: string[];
  workspaceId?: string;
};

type CreatedTask = {
  id: string;
  list_id: string;
};

type AuthUser = {
  email?: string;
  id: string;
};

function serviceHeaders(prefer?: string): Record<string, string> {
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function expectFetchSuccess(
  response: Response,
  operation: string
): Promise<void> {
  if (response.ok) return;

  throw new Error(
    `${operation} failed (${response.status}): ${await response.text()}`
  );
}

export function assertSafeTasksLifecycleEnvironment(): void {
  assertSafeE2EEnvironment();

  const tasksUrl = new URL(TASKS_E2E_ORIGIN);
  if (!isSafeLocalTasksOrigin(tasksUrl)) {
    throw new Error(
      `Refusing to run Tasks lifecycle E2E against non-local Tasks origin: ${tasksUrl.origin}`
    );
  }
}

/**
 * Opens Tasks through the same Apps picker controls a user operates. Selecting
 * the current-tab preference keeps Playwright on the page that performs the
 * normal cross-app handoff.
 */
export async function launchTasksFromAppsPicker(page: Page): Promise<string> {
  await page
    .getByRole('button', { name: 'Apps', exact: true })
    .click({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Apps' });
  await expect(dialog).toBeVisible();
  const currentTab = dialog.getByRole('radio', {
    name: 'This tab',
    exact: true,
  });
  await currentTab.click({ timeout: 30_000 });
  await expect(currentTab).toHaveAttribute('data-state', 'on');

  const tasksLink = dialog.getByRole('link', { name: 'Tasks', exact: true });
  await expect(tasksLink).not.toHaveAttribute('target', '_blank');
  const tasksHref = await tasksLink.getAttribute('href');
  expect(
    tasksHref,
    'expected the Apps picker to expose a Tasks URL'
  ).toBeTruthy();
  const tasksUrl = new URL(tasksHref!, WEB_E2E_ORIGIN);
  expect(
    isSafeLocalTasksOrigin(tasksUrl),
    `refusing to launch Tasks lifecycle E2E at ${tasksUrl.origin}`
  ).toBe(true);
  expect(
    tasksUrl.origin,
    'expected the Apps picker to target the running Tasks test server'
  ).toBe(new URL(TASKS_E2E_ORIGIN).origin);
  // The cross-origin handoff can keep Playwright's implicit navigation waiter
  // alive while the Tasks satellite finishes bootstrapping. The caller already
  // waits for the destination UI (or login), so avoid double-waiting here.
  await tasksLink.click({ noWaitAfter: true, timeout: 30_000 });
  return tasksUrl.origin;
}

export async function createBoardFromSwitcher(
  page: Page,
  workspaceId: string,
  boardName: string
): Promise<string> {
  const boardSwitcher = page.getByRole('combobox').first();
  await expect(boardSwitcher).toBeVisible({ timeout: 60_000 });
  await boardSwitcher.click();

  const search = page.getByPlaceholder(/search boards/i);
  await expect(search).toBeVisible();
  await search.fill(boardName);

  const createOption = page.getByRole('option').filter({
    hasText: new RegExp(`Create board.*${escapeRegExp(boardName)}`, 'i'),
  });
  await expect(createOption).toBeVisible();
  const responsePromise = page.waitForResponse(
    (response) => {
      const request = response.request();
      return (
        request.method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/v1/workspaces/${workspaceId}/task-boards`
      );
    },
    { timeout: 30_000 }
  );
  await search.press('Enter');

  const response = await responsePromise;
  const responseText = await response.text();
  expect(response.status(), responseText).toBe(201);
  const payload = JSON.parse(responseText) as { board?: { id?: string } };
  expect(
    payload.board?.id,
    'expected the board UI to return an id'
  ).toBeTruthy();
  await expect(page).toHaveURL(
    new RegExp(`/${workspaceId}/boards/${payload.board!.id}$`),
    { timeout: 60_000 }
  );
  return payload.board!.id!;
}

/**
 * Selects an existing board through the board switcher instead of navigating
 * straight to its route. This keeps collaboration scenarios aligned with how
 * a user moves between boards after joining a workspace.
 */
export async function selectBoardFromSwitcher(
  page: Page,
  workspaceId: string,
  boardId: string,
  boardName: string
): Promise<void> {
  const boardSwitcher = page.getByRole('combobox').first();
  await expect(boardSwitcher).toBeVisible({ timeout: 60_000 });
  await boardSwitcher.click();

  const search = page.getByPlaceholder(/search boards/i);
  await expect(search).toBeVisible();
  await search.fill(boardName);

  const boardOption = page
    .getByRole('option')
    .filter({ hasText: new RegExp(`^${escapeRegExp(boardName)}(?:\\s|$)`) })
    .first();
  await expect(boardOption).toBeVisible({ timeout: 30_000 });
  await boardOption.click();
  await expect(page).toHaveURL(
    new RegExp(`/${workspaceId}/boards/${boardId}$`),
    { timeout: 60_000 }
  );
}

export async function createTaskFromBoard(
  page: Page,
  workspaceId: string,
  listId: string,
  taskName: string
): Promise<CreatedTask> {
  const targetList = page.locator(`#task-list-${listId}`);
  await expect(targetList).toHaveAttribute('data-kanban-real-column', 'true', {
    timeout: 60_000,
  });
  const addTaskButton = targetList.getByRole('button', {
    name: /add task/i,
  });
  await expect(addTaskButton).toBeVisible({ timeout: 60_000 });
  await addTaskButton.click();

  const aiSwitch = page.getByRole('switch', { name: /generate with ai/i });
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

  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === 'POST' &&
      new URL(response.url()).pathname ===
        `/api/v1/workspaces/${workspaceId}/tasks`
    );
  });

  const createButton = page.getByRole('button', { name: /create task/i });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const response = await responsePromise;
  const responseText = await response.text();
  expect(response.status(), responseText).toBe(201);
  const body = JSON.parse(responseText) as { task?: Partial<CreatedTask> };
  expect(body.task?.id, `expected an id for task ${taskName}`).toBeTruthy();
  expect(
    body.task?.list_id,
    `expected task ${taskName} to be created in the selected Kanban list`
  ).toBe(listId);
  await expect(page.getByText(taskName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  return body.task as CreatedTask;
}

export async function openTaskFromBoard(
  page: Page,
  taskName: string
): Promise<void> {
  await page.getByText(taskName, { exact: true }).first().click();
  await expect(page.locator('[data-task-name-input]')).toHaveValue(taskName, {
    timeout: 30_000,
  });
}

export async function readServiceRows<T>(
  table: string,
  query: string
): Promise<T[]> {
  const response = await fetch(
    `${LOCAL_E2E_SUPABASE_URL}/rest/v1/${table}?${query}`,
    { headers: serviceHeaders() }
  );
  await expectFetchSuccess(response, `Read ${table}`);
  return (await response.json()) as T[];
}

export async function findLocalUserId(email: string): Promise<string> {
  const response = await fetch(
    `${LOCAL_E2E_SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,
    { headers: serviceHeaders() }
  );
  await expectFetchSuccess(response, 'List local auth users');
  const payload = (await response.json()) as { users?: AuthUser[] };
  const user = payload.users?.find(
    (candidate) => candidate.email?.toLowerCase() === email.toLowerCase()
  );
  if (!user) throw new Error(`Could not find local auth user ${email}`);
  return user.id;
}

export async function cleanupTasksLifecycleFixtures({
  userEmails = [],
  userIds = [],
  workspaceId,
}: LifecycleFixtures): Promise<void> {
  if (workspaceId) {
    const workspaceResponse = await fetch(
      `${LOCAL_E2E_SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
      {
        headers: serviceHeaders('return=minimal'),
        method: 'DELETE',
      }
    );
    await expectFetchSuccess(workspaceResponse, 'Delete lifecycle workspace');
  }

  const ids = new Set(userIds);
  if (userEmails.length > 0) {
    const response = await fetch(
      `${LOCAL_E2E_SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,
      { headers: serviceHeaders() }
    );
    await expectFetchSuccess(response, 'List local auth users for cleanup');
    const payload = (await response.json()) as { users?: AuthUser[] };
    const normalizedEmails = new Set(
      userEmails.map((email) => email.toLowerCase())
    );
    for (const user of payload.users ?? []) {
      if (user.email && normalizedEmails.has(user.email.toLowerCase())) {
        ids.add(user.id);
      }
    }
  }

  for (const userId of ids) {
    const userResponse = await fetch(
      `${LOCAL_E2E_SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        headers: serviceHeaders(),
        method: 'DELETE',
      }
    );
    await expectFetchSuccess(userResponse, `Delete lifecycle user ${userId}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
