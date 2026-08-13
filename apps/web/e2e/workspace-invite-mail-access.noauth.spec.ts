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
const MAIL_BASE_URL = process.env.MAIL_BASE_URL;
const APP_SECRET =
  process.env.TUTURUUU_APP_COORDINATION_SECRET ??
  LOCAL_E2E_APP_COORDINATION_SECRET;

function mailAppToken() {
  return createAppSessionToken(
    {
      email: TEST_USER.email,
      originApp: 'web',
      targetApp: 'mail',
      userId: TEST_USER.id,
    },
    { secret: APP_SECRET }
  ).token;
}

async function seedPendingInvitation({
  request,
  suffix,
}: {
  request: import('@playwright/test').APIRequestContext;
  suffix: string;
}) {
  const workspaceId = randomUUID();
  const roleId = randomUUID();
  const workspaceName = `E2E Mail invite ${suffix}`;

  await postRestRow({
    request,
    table: 'workspaces',
    data: {
      creator_id: WORKSPACE_CREATOR_ID,
      handle: `e2e-mail-invite-${suffix}`,
      id: workspaceId,
      name: workspaceName,
      personal: false,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_roles',
    data: { id: roleId, name: 'Mail member', ws_id: workspaceId },
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

  return { workspaceId, workspaceName };
}

async function addMailCookies(
  context: import('@playwright/test').BrowserContext,
  token: string
) {
  await context.addCookies(
    [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME].map((name) => ({
      httpOnly: true,
      name,
      sameSite: 'Lax' as const,
      url: MAIL_BASE_URL!,
      value: token,
    }))
  );
}

test.describe('accepted workspace invitation Mail access', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    expect(
      MAIL_BASE_URL,
      'MAIL_BASE_URL must be provided by the E2E runner'
    ).toBeTruthy();
  });

  test('enforces membership before acceptance and returns workspace mail afterward', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    let seededWorkspaceId: string | null = null;
    const token = mailAppToken();
    const headers = { authorization: `Bearer ${token}` };

    try {
      const invitation = await seedPendingInvitation({ request, suffix });
      seededWorkspaceId = invitation.workspaceId;
      const mailUrl = `${MAIL_BASE_URL}/api/v1/workspaces/${invitation.workspaceId}/mail`;

      const beforeAcceptance = await request.get(mailUrl, {
        failOnStatusCode: false,
        headers,
      });
      expect(beforeAcceptance.status(), await beforeAcceptance.text()).toBe(
        403
      );

      const acceptance = await request.post(
        `${WEB_BASE_URL}/api/workspaces/${invitation.workspaceId}/accept-invite`,
        { failOnStatusCode: false, headers }
      );
      expect(acceptance.status(), await acceptance.text()).toBe(200);

      const afterAcceptance = await request.get(mailUrl, {
        failOnStatusCode: false,
        headers,
      });
      expect(afterAcceptance.status(), await afterAcceptance.text()).toBe(200);
      await expect(afterAcceptance.json()).resolves.toEqual({ emails: [] });
    } finally {
      if (seededWorkspaceId) {
        await deleteRestRows({
          request,
          table: 'workspaces',
          filter: `id=eq.${seededWorkspaceId}`,
        });
      }
    }
  });

  test('accepts from the Mail UI and keeps mailbox navigation and notifications available', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);

    const workspaceId = randomUUID();
    const notificationId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    const notificationTitle = `Mail invite access restored ${suffix}`;
    let context: import('@playwright/test').BrowserContext | null = null;
    let seededWorkspaceId: string | null = null;

    try {
      const invitation = await seedPendingInvitation({ request, suffix });
      seededWorkspaceId = invitation.workspaceId;
      const token = mailAppToken();
      const headers = { authorization: `Bearer ${token}` };

      context = await browser.newContext({
        extraHTTPHeaders: headers,
        ignoreHTTPSErrors: true,
      });
      await addMailCookies(context, token);
      const page = await context.newPage();
      const invitationNavigation = await page.goto(
        `${MAIL_BASE_URL}/${invitation.workspaceId}`
      );
      expect(invitationNavigation?.status()).toBeLessThan(400);
      await expect(page.getByText(invitation.workspaceName)).toBeVisible();

      await page.getByRole('button', { name: /accept invitation/i }).click();
      await expect(page).toHaveURL(
        new RegExp(`/${invitation.workspaceId}/inbox(?:\\?|$)`, 'u')
      );
      await expect(page).not.toHaveURL(/\/404(?:\?|$)/u);
      await expect(
        page.getByRole('button', { name: 'Notifications' })
      ).toBeVisible();

      await postRestRow({
        request,
        table: 'notifications',
        data: {
          description: 'Visible after accepting the invitation in Mail',
          id: notificationId,
          title: notificationTitle,
          type: 'system_announcement',
          user_id: TEST_USER.id,
          ws_id: invitation.workspaceId,
        },
      });

      await page.reload();
      await expect(
        page.getByRole('button', { name: 'Notifications' })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Notifications' }).click();
      await expect(page.getByText(notificationTitle)).toBeVisible();

      const mailResponse = await request.get(
        `${MAIL_BASE_URL}/api/v1/workspaces/${invitation.workspaceId}/mail`,
        { failOnStatusCode: false, headers }
      );
      expect(mailResponse.status(), await mailResponse.text()).toBe(200);
    } finally {
      await context?.close();
      if (seededWorkspaceId) {
        await deleteRestRows({
          request,
          table: 'workspaces',
          filter: `id=eq.${seededWorkspaceId}`,
        });
      }
    }
  });
});
