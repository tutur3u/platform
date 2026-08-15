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
const FINANCE_BASE_URL = process.env.FINANCE_BASE_URL;
const APP_SECRET =
  process.env.TUTURUUU_APP_COORDINATION_SECRET ??
  LOCAL_E2E_APP_COORDINATION_SECRET;

function financeToken() {
  return createAppSessionToken(
    {
      email: TEST_USER.email,
      originApp: 'web',
      targetApp: 'finance',
      userId: TEST_USER.id,
    },
    { secret: APP_SECRET }
  ).token;
}

async function addAppCookies(
  context: import('@playwright/test').BrowserContext,
  token: string
) {
  await context.addCookies(
    [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME].map((name) => ({
      httpOnly: true,
      name,
      sameSite: 'Lax' as const,
      url: FINANCE_BASE_URL!,
      value: token,
    }))
  );
}

test.describe('accepted workspace invitation Finance access', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    expect(
      FINANCE_BASE_URL,
      'FINANCE_BASE_URL must be provided by the E2E runner'
    ).toBeTruthy();
  });

  test('shows seeded finance data and notifications to the invited member', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);

    const workspaceId = randomUUID();
    const roleId = randomUUID();
    const walletId = randomUUID();
    const categoryId = randomUUID();
    const transactionId = randomUUID();
    const notificationId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    const walletName = `Visible wallet ${suffix}`;
    const categoryName = `Visible expense ${suffix}`;
    const notificationTitle = `Finance access restored ${suffix}`;
    let context: import('@playwright/test').BrowserContext | null = null;

    try {
      await postRestRow({
        request,
        table: 'workspaces',
        data: {
          creator_id: WORKSPACE_CREATOR_ID,
          handle: `e2e-finance-invite-${suffix}`,
          id: workspaceId,
          name: `E2E Finance Invite ${suffix}`,
          personal: false,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_roles',
        data: { id: roleId, name: 'Finance member', ws_id: workspaceId },
      });
      await postRestRow({
        request,
        table: 'workspace_role_permissions',
        data: ['view_transactions', 'view_finance_stats'].map((permission) => ({
          enabled: true,
          permission,
          role_id: roleId,
          ws_id: workspaceId,
        })),
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

      const token = financeToken();
      const headers = { authorization: `Bearer ${token}` };
      const acceptResponse = await request.post(
        `${WEB_BASE_URL}/api/workspaces/${workspaceId}/accept-invite`,
        { failOnStatusCode: false, headers }
      );
      expect(acceptResponse.status(), await acceptResponse.text()).toBe(200);

      await postRestRow({
        request,
        schema: 'private',
        table: 'workspace_wallets',
        data: {
          currency: 'VND',
          id: walletId,
          name: walletName,
          type: 'STANDARD',
          ws_id: workspaceId,
        },
      });
      await postRestRow({
        request,
        table: 'transaction_categories',
        data: {
          id: categoryId,
          is_expense: true,
          name: categoryName,
          ws_id: workspaceId,
        },
      });
      await postRestRow({
        request,
        table: 'wallet_transactions',
        data: {
          amount: -125_000,
          category_id: categoryId,
          description: 'Finance invitation E2E expense',
          id: transactionId,
          platform_creator_id: TEST_USER.id,
          wallet_id: walletId,
        },
      });
      await postRestRow({
        request,
        table: 'notifications',
        data: {
          description: 'Visible to an invited Finance member',
          id: notificationId,
          title: notificationTitle,
          type: 'system_announcement',
          user_id: TEST_USER.id,
          ws_id: workspaceId,
        },
      });

      for (const apiPath of [
        `/api/workspaces/${workspaceId}/wallets`,
        `/api/workspaces/${workspaceId}/transactions/category-breakdown?type=expense&timezone=Asia%2FHo_Chi_Minh`,
      ]) {
        const response = await request.get(`${FINANCE_BASE_URL}${apiPath}`, {
          failOnStatusCode: false,
          headers,
        });
        expect(response.status(), `${apiPath}: ${await response.text()}`).toBe(
          200
        );
        const body = (await response.json()) as Array<Record<string, unknown>>;
        expect(body.length).toBeGreaterThan(0);
      }

      context = await browser.newContext({
        extraHTTPHeaders: headers,
        ignoreHTTPSErrors: true,
      });
      await addAppCookies(context, token);
      const page = await context.newPage();
      const navigation = await page.goto(
        `${FINANCE_BASE_URL}/${workspaceId}/analytics`,
        { waitUntil: 'domcontentloaded' }
      );
      expect(navigation?.status(), '/analytics').toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/404(?:\?|$)/u);

      const notificationTrigger = page.getByRole('button', {
        name: 'Notifications',
      });
      await expect(notificationTrigger).toBeEnabled({ timeout: 60_000 });
      await notificationTrigger.click();
      await expect(notificationTrigger).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await expect(page.getByText(notificationTitle)).toBeVisible({
        timeout: 30_000,
      });
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
