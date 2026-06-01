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

function serviceHeaders(prefer?: string) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

test.describe('Task board management RBAC', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('denies trash, restore, and permanent delete to members without manage_projects', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 245));
    const boardId = randomUUID();
    const workspaceId = randomUUID();
    const lowPrivEmail = `e2e-board-member-${Date.now()}@tuturuuu.com`;
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
            handle: `e2e-board-rbac-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Board RBAC Workspace',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const defaultsResponse = await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_default_permissions?ws_id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
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
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(membershipResponse.status()).toBe(201);

      const boardResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_boards`,
        {
          data: {
            id: boardId,
            name: `E2E RBAC Board ${Date.now()}`,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(boardResponse.status()).toBe(201);

      for (const mutation of [
        {
          method: 'put' as const,
          options: {},
        },
        {
          method: 'patch' as const,
          options: {
            data: {
              restore: true,
            },
          },
        },
        {
          method: 'delete' as const,
          options: {},
        },
      ]) {
        const response = await lowPrivPage.request[mutation.method](
          `${origin}/api/v1/workspaces/${workspaceId}/boards/${boardId}`,
          {
            failOnStatusCode: false,
            headers,
            ...mutation.options,
          }
        );

        expect(response.status()).toBe(403);
        await expect(response.json()).resolves.toEqual({
          error: "You don't have permission to perform this operation",
        });
      }

      const boardReadResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_boards?id=eq.${boardId}&select=id,deleted_at`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(boardReadResponse.status()).toBe(200);
      await expect(boardReadResponse.json()).resolves.toEqual([
        expect.objectContaining({
          deleted_at: null,
          id: boardId,
        }),
      ]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_boards?id=eq.${boardId}`,
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
