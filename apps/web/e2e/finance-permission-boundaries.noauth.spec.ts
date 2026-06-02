import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
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

function serviceHeaders({
  prefer,
  schema,
}: {
  prefer?: string;
  schema?: 'private' | 'public';
} = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
    ...(schema
      ? {
          'accept-profile': schema,
          'content-profile': schema,
        }
      : {}),
  };
}

function isoDateWithOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

test.describe('Finance permission boundaries', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('keeps invoice creators away from finance aggregates and confidential wallet amounts', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 262));
    const categoryId = randomUUID();
    const confidentialInterestTransactionId = randomUUID();
    const interestConfigId = randomUUID();
    const interestRateId = randomUUID();
    const roleId = randomUUID();
    const calculationDate = isoDateWithOffset(0);
    const interestTrackingStartDate = isoDateWithOffset(-3);
    const interestTransactionDate = isoDateWithOffset(-1);
    const visibleInterestTransactionId = randomUUID();
    const walletId = randomUUID();
    const workspaceId = randomUUID();
    const lowPrivEmail = `e2e-finance-invoice-${Date.now()}@tuturuuu.com`;
    const lowPrivContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const lowPrivPage = await lowPrivContext.newPage();
    let lowPrivUserId: string | null = null;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: lowPrivEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await lowPrivPage.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: lowPrivEmail,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(sessionResponse.status()).toBe(200);

      const profileResponse = await lowPrivPage.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(profileResponse.status()).toBe(200);
      const profile = (await profileResponse.json()) as { id?: string };
      expect(profile.id).toEqual(expect.any(String));
      lowPrivUserId = profile.id ?? null;

      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-finance-rbac-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Finance RBAC Workspace',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const defaultsResponse = await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_default_permissions?ws_id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(defaultsResponse.status()).toBe(204);

      const membershipResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_members`,
        {
          data: {
            type: 'MEMBER',
            user_id: lowPrivUserId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(membershipResponse.status()).toBe(201);

      const roleResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_roles`,
        {
          data: {
            id: roleId,
            name: 'Invoice creator only',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(roleResponse.status()).toBe(201);

      const permissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions`,
        {
          data: {
            enabled: true,
            permission: 'create_invoices',
            role_id: roleId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(permissionResponse.status()).toBe(201);

      const roleMemberResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_members`,
        {
          data: {
            role_id: roleId,
            user_id: lowPrivUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(roleMemberResponse.status()).toBe(201);

      const walletResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_wallets`,
        {
          data: {
            balance: 987_654,
            currency: 'USD',
            id: walletId,
            name: 'Confidential operating wallet',
            type: 'STANDARD',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(walletResponse.status()).toBe(201);

      const categoryResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/transaction_categories`,
        {
          data: {
            id: categoryId,
            is_expense: false,
            name: 'Invoice category',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(categoryResponse.status()).toBe(201);

      const walletsResponse = await lowPrivPage.request.get(
        `${origin}/api/workspaces/${workspaceId}/wallets`,
        { failOnStatusCode: false, headers }
      );
      expect(walletsResponse.status()).toBe(200);
      const wallets = (await walletsResponse.json()) as Array<
        Record<string, unknown>
      >;
      expect(wallets).toEqual([
        expect.objectContaining({
          currency: 'USD',
          id: walletId,
          name: 'Confidential operating wallet',
          type: 'STANDARD',
        }),
      ]);
      expect(wallets[0]).not.toHaveProperty('balance');
      expect(wallets[0]).not.toHaveProperty('limit');
      expect(wallets[0]).not.toHaveProperty('statement_date');
      expect(wallets[0]).not.toHaveProperty('payment_date');

      const categoriesResponse = await lowPrivPage.request.get(
        `${origin}/api/workspaces/${workspaceId}/transactions/categories`,
        { failOnStatusCode: false, headers }
      );
      expect(categoriesResponse.status()).toBe(200);
      const categories = (await categoriesResponse.json()) as Array<
        Record<string, unknown>
      >;
      expect(categories).toEqual([
        expect.objectContaining({
          id: categoryId,
          is_expense: false,
          name: 'Invoice category',
        }),
      ]);
      expect(categories[0]).not.toHaveProperty('amount');
      expect(categories[0]).not.toHaveProperty('transaction_count');

      for (const path of [
        `/api/workspaces/${workspaceId}/finance/overview`,
        `/api/workspaces/${workspaceId}/finance/charts/balance-trend?includeConfidential=true&maxPoints=60`,
        `/api/workspaces/${workspaceId}/finance/charts/income-expense-summary?includeConfidential=true&interval=daily`,
        `/api/workspaces/${workspaceId}/tags/stats`,
      ]) {
        const response = await lowPrivPage.request.get(`${origin}${path}`, {
          failOnStatusCode: false,
          headers,
        });

        expect(response.status()).toBe(403);
      }

      for (const path of [
        `/api/workspaces/${workspaceId}/finance/charts/balance-trend?includeConfidential=true&startDate=2000-01-01&endDate=2026-06-01`,
        `/api/workspaces/${workspaceId}/finance/charts/income-expense-summary?includeConfidential=true&interval=daily&startDate=2000-01-01&endDate=2026-06-01`,
        `/api/workspaces/${workspaceId}/finance/overview?view=date&startDate=2000-01-01&endDate=2026-06-01`,
      ]) {
        const response = await lowPrivPage.request.get(`${origin}${path}`, {
          failOnStatusCode: false,
          headers,
        });

        expect(response.status()).toBe(400);
        await expect(response.json()).resolves.toEqual({
          message: 'Date range cannot exceed 366 days',
        });
      }

      const statsPermissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions`,
        {
          data: {
            enabled: true,
            permission: 'view_finance_stats',
            role_id: roleId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(statsPermissionResponse.status()).toBe(201);

      const overviewResponse = await lowPrivPage.request.get(
        `${origin}/api/workspaces/${workspaceId}/finance/overview?includeConfidential=true`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(overviewResponse.status()).toBe(200);
      await expect(overviewResponse.json()).resolves.toEqual(
        expect.objectContaining({
          categoryCount: 1,
          invoiceCount: 0,
          transactionCount: 0,
          walletCount: 1,
        })
      );

      const balanceTrendResponse = await lowPrivPage.request.get(
        `${origin}/api/workspaces/${workspaceId}/finance/charts/balance-trend?includeConfidential=true&maxPoints=60`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(balanceTrendResponse.status()).toBe(200);
      await expect(balanceTrendResponse.json()).resolves.toEqual({
        data: expect.any(Array),
      });

      const incomeExpenseResponse = await lowPrivPage.request.get(
        `${origin}/api/workspaces/${workspaceId}/finance/charts/income-expense-summary?includeConfidential=true&interval=daily`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(incomeExpenseResponse.status()).toBe(200);
      await expect(incomeExpenseResponse.json()).resolves.toEqual(
        expect.objectContaining({
          data: expect.any(Array),
          total_expense: expect.any(Number),
          total_income: expect.any(Number),
        })
      );

      const transactionsPermissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions`,
        {
          data: {
            enabled: true,
            permission: 'view_transactions',
            role_id: roleId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(transactionsPermissionResponse.status()).toBe(201);

      const walletWhitelistResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_wallet_whitelist`,
        {
          data: {
            role_id: roleId,
            wallet_id: walletId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(walletWhitelistResponse.status()).toBe(201);

      const interestConfigResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/wallet_interest_configs`,
        {
          data: {
            enabled: true,
            id: interestConfigId,
            last_interest_amount: 333,
            provider: 'momo',
            total_interest_earned: 7777,
            tracking_start_date: interestTrackingStartDate,
            wallet_id: walletId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(interestConfigResponse.status()).toBe(201);

      const interestRateResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/wallet_interest_rates`,
        {
          data: {
            annual_rate: 36.5,
            config_id: interestConfigId,
            effective_from: interestTrackingStartDate,
            id: interestRateId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(interestRateResponse.status()).toBe(201);

      const interestTransactionsResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/wallet_transactions`,
        {
          data: [
            {
              amount: 1000,
              created_at: `${interestTransactionDate}T09:00:00+00:00`,
              description: 'daily interest visible',
              id: visibleInterestTransactionId,
              is_amount_confidential: false,
              is_description_confidential: false,
              wallet_id: walletId,
            },
            {
              amount: 9000,
              created_at: `${interestTransactionDate}T10:00:00+00:00`,
              description: 'daily interest confidential',
              id: confidentialInterestTransactionId,
              is_amount_confidential: true,
              is_description_confidential: true,
              wallet_id: walletId,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(interestTransactionsResponse.status()).toBe(201);

      const projectionResponse = await lowPrivPage.request.get(
        `${origin}/api/workspaces/${workspaceId}/wallets/${walletId}/interest/project?startDate=${calculationDate}&days=1`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(projectionResponse.status()).toBe(200);
      await expect(projectionResponse.json()).resolves.toEqual(
        expect.objectContaining({
          currentBalance: 1000,
          summary: expect.any(Object),
        })
      );

      const calculationResponse = await lowPrivPage.request.get(
        `${origin}/api/workspaces/${workspaceId}/wallets/${walletId}/interest/calculate?from=${calculationDate}&to=${calculationDate}`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(calculationResponse.status()).toBe(200);
      await expect(calculationResponse.json()).resolves.toEqual(
        expect.objectContaining({
          initialBalance: 1000,
          dailyResults: [
            expect.objectContaining({
              balance: 1000,
            }),
          ],
        })
      );

      const summaryResponse = await lowPrivPage.request.get(
        `${origin}/api/workspaces/${workspaceId}/wallets/${walletId}/interest`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(summaryResponse.status()).toBe(200);
      const summary = (await summaryResponse.json()) as {
        config?: { total_interest_earned?: number };
        estimatedMonthlyInterest?: number;
        estimatedYearlyInterest?: number;
        projections?: { week?: Array<Record<string, unknown>> };
        totalEarnedInterest?: number;
      };
      expect(summary.config?.total_interest_earned).toBe(0);
      expect(summary.totalEarnedInterest).not.toBe(7777);
      expect(summary.estimatedMonthlyInterest).toBe(22);
      expect(summary.estimatedYearlyInterest).toBe(260);
      expect(summary.projections?.week?.[0]).toEqual(
        expect.objectContaining({
          projectedBalance: expect.any(Number),
        })
      );
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/wallet_transactions?wallet_id=eq.${walletId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/wallet_interest_rates?config_id=eq.${interestConfigId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/wallet_interest_configs?id=eq.${interestConfigId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_role_wallet_whitelist?role_id=eq.${roleId}&wallet_id=eq.${walletId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/transaction_categories?id=eq.${categoryId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_wallets?id=eq.${walletId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_roles?id=eq.${roleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      if (lowPrivUserId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_members?user_id=eq.${lowPrivUserId}&ws_id=eq.${workspaceId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders(),
          }
        );
      }

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await lowPrivContext.close();
    }
  });
});
