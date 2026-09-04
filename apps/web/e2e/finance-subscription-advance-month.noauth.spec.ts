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

function formatMonthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function formatDateValue(date: Date) {
  return `${formatMonthValue(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

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

test.describe('subscription invoice advance billing', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    expect(
      FINANCE_BASE_URL,
      'FINANCE_BASE_URL must be provided by the E2E runner'
    ).toBeTruthy();
  });

  test('keeps future months selectable after the configured group end', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);

    const workspaceId = randomUUID();
    const roleId = randomUUID();
    const customerId = randomUUID();
    const groupId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    const currentMonth = new Date();
    currentMonth.setDate(1);
    const previousMonth = addMonths(currentMonth, -1);
    const advanceMonth = addMonths(currentMonth, 1);
    const followingMonth = addMonths(currentMonth, 2);
    const groupEnd = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      0
    );
    let context: import('@playwright/test').BrowserContext | null = null;

    try {
      await postRestRow({
        request,
        table: 'workspaces',
        data: {
          creator_id: WORKSPACE_CREATOR_ID,
          handle: `e2e-finance-advance-${suffix}`,
          id: workspaceId,
          name: `E2E Finance Advance ${suffix}`,
          personal: false,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_roles',
        data: { id: roleId, name: 'Invoice creator', ws_id: workspaceId },
      });
      await postRestRow({
        request,
        table: 'workspace_role_permissions',
        data: {
          enabled: true,
          permission: 'create_invoices',
          role_id: roleId,
          ws_id: workspaceId,
        },
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

      context = await browser.newContext({
        extraHTTPHeaders: headers,
        ignoreHTTPSErrors: true,
      });
      await context.addCookies([
        ...[APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME].map(
          (name) => ({
            httpOnly: true,
            name,
            sameSite: 'Lax' as const,
            url: FINANCE_BASE_URL!,
            value: token,
          })
        ),
        {
          name: 'NEXT_LOCALE',
          sameSite: 'Lax',
          url: FINANCE_BASE_URL!,
          value: 'en',
        },
      ]);

      const page = await context.newPage();
      await page.route(
        `**/api/v1/workspaces/${workspaceId}/**`,
        async (route) => {
          const url = new URL(route.request().url());
          const path = url.pathname;

          if (path.endsWith(`/users/${customerId}/user-groups`)) {
            await route.fulfill({
              contentType: 'application/json',
              json: [
                {
                  workspace_user_groups: {
                    ending_date: formatDateValue(groupEnd),
                    id: groupId,
                    name: 'Advance Billing Group',
                    sessions: [
                      `${formatMonthValue(previousMonth)}-05`,
                      `${formatMonthValue(currentMonth)}-05`,
                      `${formatMonthValue(advanceMonth)}-05`,
                      `${formatMonthValue(followingMonth)}-05`,
                    ],
                    starting_date: `${formatMonthValue(previousMonth)}-01`,
                  },
                },
              ],
            });
            return;
          }

          if (path.endsWith('/finance/invoices/subscription/context')) {
            await route.fulfill({
              contentType: 'application/json',
              json: { attendance: [], latestInvoices: [] },
            });
            return;
          }

          if (path.includes('/user-groups/linked-products')) {
            await route.fulfill({
              contentType: 'application/json',
              json: { items: [] },
            });
            return;
          }

          if (path.endsWith('/inventory/products')) {
            await route.fulfill({
              contentType: 'application/json',
              json: { count: 0, data: [] },
            });
            return;
          }

          if (path.endsWith(`/users/${customerId}`)) {
            await route.fulfill({
              contentType: 'application/json',
              json: {
                display_name: 'Advance Billing Customer',
                email: 'advance-billing@example.test',
                full_name: 'Advance Billing Customer',
                id: customerId,
                ws_id: workspaceId,
              },
            });
            return;
          }

          if (path.endsWith('/users')) {
            await route.fulfill({
              contentType: 'application/json',
              json: {
                count: 1,
                data: [
                  {
                    display_name: 'Advance Billing Customer',
                    email: 'advance-billing@example.test',
                    full_name: 'Advance Billing Customer',
                    id: customerId,
                    ws_id: workspaceId,
                  },
                ],
              },
            });
            return;
          }

          await route.fulfill({ contentType: 'application/json', json: {} });
        }
      );

      const currentMonthLabel = formatMonthLabel(currentMonth);
      const advanceMonthLabel = formatMonthLabel(advanceMonth);
      const followingMonthLabel = formatMonthLabel(followingMonth);
      const navigation = await page.goto(
        `${FINANCE_BASE_URL}/${workspaceId}/invoices/new?type=subscription`,
        { waitUntil: 'domcontentloaded' }
      );
      expect(navigation?.status()).toBeLessThan(400);
      await page.getByRole('combobox', { name: 'Customer' }).click();
      await page
        .getByRole('option', { name: /Advance Billing Customer/u })
        .click();
      await expect(page.getByText('Advance Billing Group').first()).toBeVisible(
        {
          timeout: 60_000,
        }
      );

      await expect(
        page.getByRole('combobox').filter({ hasText: currentMonthLabel })
      ).toBeVisible({ timeout: 60_000 });
      const nextMonthButton = page.getByRole('button', { name: 'Next month' });
      await expect(nextMonthButton).toBeEnabled();
      await nextMonthButton.click();
      await expect(page).toHaveURL(
        new RegExp(`month=${formatMonthValue(advanceMonth)}`)
      );

      const monthSelect = page
        .getByRole('combobox')
        .filter({ hasText: advanceMonthLabel });
      await expect(monthSelect).toBeVisible({ timeout: 60_000 });
      await monthSelect.click();
      await expect(
        page.getByRole('option', { name: followingMonthLabel })
      ).toBeVisible();
      await page.getByRole('option', { name: followingMonthLabel }).click();
      await expect(page).toHaveURL(
        new RegExp(`month=${formatMonthValue(followingMonth)}`)
      );
      await expect(
        page.getByRole('combobox').filter({ hasText: followingMonthLabel })
      ).toBeVisible();
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
