import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionToken,
  WEB_APP_SESSION_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
} from './helpers/environment';
import { deleteRestRows, postRestRow } from './helpers/supabase-rest';

const WORKSPACE_CREATOR_ID = '00000000-0000-0000-0000-000000000002';
const WEB_BASE_URL = process.env.BASE_URL ?? 'https://tuturuuu.localhost:1355';
const TASKS_BASE_URL = process.env.TASKS_BASE_URL;
const APP_SECRET =
  process.env.TUTURUUU_APP_COORDINATION_SECRET ??
  LOCAL_E2E_APP_COORDINATION_SECRET;

function tasksToken() {
  return createAppSessionToken(
    {
      email: TEST_USER.email,
      originApp: 'web',
      targetApp: 'tasks',
      userId: TEST_USER.id,
    },
    { secret: APP_SECRET }
  ).token;
}

function taskCookies(token: string) {
  return [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME]
    .map((name) => `${name}=${token}`)
    .join('; ');
}

test.describe('accepted workspace invitation Tasks access', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    expect(
      TASKS_BASE_URL,
      'TASKS_BASE_URL must be provided by the E2E runner'
    ).toBeTruthy();
  });

  test('discovers the invited workspace, serves owned pages, and preserves fallback routes', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const workspaceId = randomUUID();
    const roleId = randomUUID();
    const notificationId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    const workspaceName = `E2E Tasks invite ${suffix}`;
    const notificationTitle = `Tasks invite access restored ${suffix}`;
    const token = tasksToken();
    const headers = {
      authorization: `Bearer ${token}`,
      cookie: taskCookies(token),
    };
    let context: import('@playwright/test').BrowserContext | null = null;

    try {
      await postRestRow({
        request,
        table: 'workspaces',
        data: {
          creator_id: WORKSPACE_CREATOR_ID,
          handle: `e2e-tasks-invite-${suffix}`,
          id: workspaceId,
          name: workspaceName,
          personal: false,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_roles',
        data: { id: roleId, name: 'Tasks member', ws_id: workspaceId },
      });
      await postRestRow({
        request,
        table: 'workspace_invites',
        data: {
          role_id: roleId,
          type: 'MEMBER',
          user_id: TEST_USER.id,
          ws_id: workspaceId,
        },
      });

      const acceptance = await request.post(
        `${WEB_BASE_URL}/api/workspaces/${workspaceId}/accept-invite`,
        { failOnStatusCode: false, headers }
      );
      expect(acceptance.status(), await acceptance.text()).toBe(200);

      await postRestRow({
        request,
        table: 'notifications',
        data: {
          description: 'Visible after accepting the invitation in Tasks',
          id: notificationId,
          title: notificationTitle,
          type: 'system_announcement',
          user_id: TEST_USER.id,
          ws_id: workspaceId,
        },
      });

      const workspaces = await request.get(
        `${WEB_BASE_URL}/api/v1/workspaces?q=${encodeURIComponent(workspaceName)}`,
        { failOnStatusCode: false, headers }
      );
      expect(workspaces.status(), await workspaces.text()).toBe(200);
      await expect(workspaces.json()).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: workspaceId })])
      );

      context = await browser.newContext({
        extraHTTPHeaders: { authorization: `Bearer ${token}` },
        ignoreHTTPSErrors: true,
      });
      await context.addCookies(
        [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME].map((name) => ({
          httpOnly: true,
          name,
          sameSite: 'Lax' as const,
          url: TASKS_BASE_URL!,
          value: token,
        }))
      );
      const page = await context.newPage();
      const ownedNavigation = await page.goto(
        `${TASKS_BASE_URL}/${workspaceId}/boards`,
        { waitUntil: 'domcontentloaded' }
      );
      expect(ownedNavigation?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/404(?:\?|$)/u);
      const notificationButton = page.getByRole('button', {
        name: 'Notifications',
      });
      await expect(notificationButton).toBeVisible();
      await notificationButton.click();
      await expect(page.getByText(notificationTitle)).toBeVisible();

      const fallback = await request.get(
        `${TASKS_BASE_URL}/${workspaceId}/time-tracker/timer?taskSelect=invite-regression`,
        { failOnStatusCode: false, headers, maxRedirects: 0 }
      );
      expect(fallback.status()).toBe(307);
      const redirect = new URL(fallback.headers().location ?? '');
      const webOrigin = new URL(WEB_BASE_URL);
      expect(redirect.protocol).toBe(webOrigin.protocol);
      expect(redirect.hostname).toBe(webOrigin.hostname);
      expect(redirect.pathname).toBe(`/${workspaceId}/time-tracker/timer`);
      expect(redirect.searchParams.get('taskSelect')).toBe('invite-regression');
    } finally {
      await context?.close();
      await deleteRestRows({
        request,
        table: 'workspaces',
        filter: `id=eq.${workspaceId}`,
      });
    }
  });
});
