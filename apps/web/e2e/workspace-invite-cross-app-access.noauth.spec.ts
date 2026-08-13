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
import {
  deleteRestRows,
  postRestRow,
  SUPABASE_URL,
  serviceHeaders,
} from './helpers/supabase-rest';

const WORKSPACE_CREATOR_ID = '00000000-0000-0000-0000-000000000002';
const WEB_BASE_URL = process.env.BASE_URL ?? 'https://tuturuuu.localhost:1355';
const CONTACTS_BASE_URL = process.env.CONTACTS_BASE_URL;
const FINANCE_BASE_URL = process.env.FINANCE_BASE_URL;
const APP_SECRET =
  process.env.TUTURUUU_APP_COORDINATION_SECRET ??
  LOCAL_E2E_APP_COORDINATION_SECRET;

function appToken(targetApp: 'contacts' | 'finance') {
  return createAppSessionToken(
    {
      email: TEST_USER.email,
      originApp: 'web',
      targetApp,
      userId: TEST_USER.id,
    },
    { secret: APP_SECRET }
  ).token;
}

async function addAppCookies(
  context: import('@playwright/test').BrowserContext,
  url: string,
  token: string
) {
  await context.addCookies(
    [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME].map((name) => ({
      httpOnly: true,
      name,
      sameSite: 'Lax' as const,
      url,
      value: token,
    }))
  );
}

test.describe('accepted workspace invitation cross-app access', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    expect(
      CONTACTS_BASE_URL,
      'CONTACTS_BASE_URL must be provided by the E2E runner'
    ).toBeTruthy();
    expect(
      FINANCE_BASE_URL,
      'FINANCE_BASE_URL must be provided by the E2E runner'
    ).toBeTruthy();
  });

  test('keeps linked profile, Finance data, Contacts reports, and notifications available', async ({
    browser,
    request,
  }) => {
    // This scenario intentionally cold-starts two satellite apps and walks four
    // Finance routes. Keep it stable when it runs after another satellite E2E
    // in the same shard and both dev servers need to recompile.
    test.setTimeout(180_000);

    const workspaceId = randomUUID();
    const roleId = randomUUID();
    const walletId = randomUUID();
    const categoryId = randomUUID();
    const transactionId = randomUUID();
    const groupId = randomUUID();
    const notificationId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    const reportTitle = `Invitation regression report ${suffix}`;
    const notificationTitle = `Cross-app access restored ${suffix}`;
    const permissions = [
      'manage_users',
      'view_user_groups',
      'view_user_groups_reports',
      'create_user_groups_reports',
      'view_transactions',
      'view_finance_stats',
    ];
    let contactsContext: import('@playwright/test').BrowserContext | null =
      null;
    let financeContext: import('@playwright/test').BrowserContext | null = null;

    try {
      await postRestRow({
        request,
        table: 'workspaces',
        data: {
          creator_id: WORKSPACE_CREATOR_ID,
          handle: `e2e-cross-app-${suffix}`,
          id: workspaceId,
          name: `E2E Cross-app ${suffix}`,
          personal: false,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_roles',
        data: { id: roleId, name: 'Cross-app member', ws_id: workspaceId },
      });
      await postRestRow({
        request,
        table: 'workspace_role_permissions',
        data: permissions.map((permission) => ({
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

      const acceptResponse = await request.post(
        `${WEB_BASE_URL}/api/workspaces/${workspaceId}/accept-invite`,
        {
          failOnStatusCode: false,
          headers: { authorization: `Bearer ${appToken('contacts')}` },
        }
      );
      expect(acceptResponse.status(), await acceptResponse.text()).toBe(200);

      const linkedProfileResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_linked_users?ws_id=eq.${workspaceId}&platform_user_id=eq.${TEST_USER.id}&select=virtual_user_id,workspace_users!inner(id,email)`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(linkedProfileResponse.status()).toBe(200);
      const linkedProfiles = (await linkedProfileResponse.json()) as Array<{
        virtual_user_id: string;
        workspace_users: { email: string | null; id: string };
      }>;
      expect(linkedProfiles).toHaveLength(1);
      expect(linkedProfiles[0]?.workspace_users).toEqual(
        expect.objectContaining({
          email: TEST_USER.email,
          id: linkedProfiles[0]?.virtual_user_id,
        })
      );
      const virtualUserId = linkedProfiles[0]!.virtual_user_id;

      await postRestRow({
        request,
        table: 'workspace_user_groups',
        data: {
          id: groupId,
          name: `Assigned group ${suffix}`,
          ws_id: workspaceId,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_user_groups_users',
        data: { group_id: groupId, role: 'STUDENT', user_id: virtualUserId },
      });
      await postRestRow({
        request,
        schema: 'private',
        table: 'workspace_wallets',
        data: {
          currency: 'VND',
          id: walletId,
          name: `Visible wallet ${suffix}`,
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
          name: `Visible expense ${suffix}`,
          ws_id: workspaceId,
        },
      });
      await postRestRow({
        request,
        table: 'wallet_transactions',
        data: {
          amount: -125_000,
          category_id: categoryId,
          description: 'Cross-app E2E expense',
          id: transactionId,
          platform_creator_id: TEST_USER.id,
          wallet_id: walletId,
        },
      });
      await postRestRow({
        request,
        table: 'notifications',
        data: {
          description: 'Visible from every registered satellite',
          id: notificationId,
          title: notificationTitle,
          type: 'system_announcement',
          user_id: TEST_USER.id,
          ws_id: workspaceId,
        },
      });

      const contactsToken = appToken('contacts');
      const contactsHeaders = { authorization: `Bearer ${contactsToken}` };
      const createReportResponse = await request.post(
        `${CONTACTS_BASE_URL}/api/v1/workspaces/${workspaceId}/users/reports`,
        {
          data: {
            cadence: 'monthly',
            content: 'The invited member can read data-backed reports.',
            feedback: 'Continue the current cross-app workflow.',
            generation_mode: 'manual',
            group_id: groupId,
            period_end: '2026-07-31',
            period_start: '2026-07-01',
            title: reportTitle,
            user_id: virtualUserId,
          },
          failOnStatusCode: false,
          headers: contactsHeaders,
        }
      );
      expect(
        createReportResponse.status(),
        await createReportResponse.text()
      ).toBe(200);

      const reportsResponse = await request.get(
        `${CONTACTS_BASE_URL}/api/v1/workspaces/${workspaceId}/users/reports?cadence=monthly&q=${encodeURIComponent(reportTitle)}`,
        { failOnStatusCode: false, headers: contactsHeaders }
      );
      expect(reportsResponse.status()).toBe(200);
      await expect(reportsResponse.json()).resolves.toEqual(
        expect.objectContaining({
          counts: expect.objectContaining({ total: 1 }),
          data: expect.arrayContaining([
            expect.objectContaining({ title: reportTitle }),
          ]),
        })
      );

      contactsContext = await browser.newContext({
        extraHTTPHeaders: contactsHeaders,
        ignoreHTTPSErrors: true,
      });
      await addAppCookies(contactsContext, CONTACTS_BASE_URL!, contactsToken);
      const contactsPage = await contactsContext.newPage();
      const contactsNavigation = await contactsPage.goto(
        `${CONTACTS_BASE_URL}/${workspaceId}/reports?view=periodic`
      );
      expect(contactsNavigation?.status()).toBeLessThan(400);
      await expect(contactsPage).toHaveURL(/\/reports\?view=periodic/u);
      await expect(contactsPage.getByText(reportTitle)).toBeVisible();
      await expect(
        contactsPage.getByRole('button', { name: 'Notifications' })
      ).toBeVisible();
      await contactsPage.getByRole('button', { name: 'Notifications' }).click();
      await expect(contactsPage.getByText(notificationTitle)).toBeVisible();

      const financeToken = appToken('finance');
      const financeHeaders = { authorization: `Bearer ${financeToken}` };
      for (const apiPath of [
        `/api/workspaces/${workspaceId}/wallets`,
        `/api/workspaces/${workspaceId}/transactions/category-breakdown?type=expense&timezone=Asia%2FHo_Chi_Minh`,
      ]) {
        const response = await request.get(`${FINANCE_BASE_URL}${apiPath}`, {
          failOnStatusCode: false,
          headers: financeHeaders,
        });
        expect(response.status(), `${apiPath}: ${await response.text()}`).toBe(
          200
        );
        const body = (await response.json()) as Array<Record<string, unknown>>;
        expect(body.length).toBeGreaterThan(0);
      }

      financeContext = await browser.newContext({
        extraHTTPHeaders: financeHeaders,
        ignoreHTTPSErrors: true,
      });
      await addAppCookies(financeContext, FINANCE_BASE_URL!, financeToken);
      const financePage = await financeContext.newPage();
      for (const route of ['', '/transactions', '/wallets', '/analytics']) {
        const navigation = await financePage.goto(
          `${FINANCE_BASE_URL}/${workspaceId}${route}`
        );
        expect(navigation?.status(), route || '/').toBeLessThan(400);
        await expect(financePage).not.toHaveURL(/\/404(?:\?|$)/u);
        await expect(
          financePage.getByRole('button', { name: 'Notifications' })
        ).toBeVisible();
      }
      await financePage.getByRole('button', { name: 'Notifications' }).click();
      await expect(financePage.getByText(notificationTitle)).toBeVisible();
    } finally {
      await contactsContext?.close();
      await financeContext?.close();
      await deleteRestRows({
        request,
        schema: 'private',
        table: 'external_user_monthly_reports',
        filter: `ws_id=eq.${workspaceId}`,
      });
      await deleteRestRows({
        request,
        table: 'workspaces',
        filter: `id=eq.${workspaceId}`,
      });
    }
  });
});
