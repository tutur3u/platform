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

test.describe('Post approval RBAC', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('denies approval surfaces to members with only send-email permission', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 246));
    const workspaceId = randomUUID();
    const roleId = randomUUID();
    const senderOnlyEmail = `e2e-post-sender-${Date.now()}@tuturuuu.com`;
    const senderOnlyContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const senderOnlyPage = await senderOnlyContext.newPage();
    let senderOnlyUserId: string | null = null;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: senderOnlyEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await senderOnlyPage.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: senderOnlyEmail,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(sessionResponse.status()).toBe(200);

      const profileResponse = await senderOnlyPage.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(profileResponse.status()).toBe(200);
      const profile = (await profileResponse.json()) as { id?: string };
      expect(profile.id).toEqual(expect.any(String));
      senderOnlyUserId = profile.id ?? null;

      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-post-rbac-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Post Approval RBAC Workspace',
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
            user_id: senderOnlyUserId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(membershipResponse.status()).toBe(201);

      const roleResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_roles`,
        {
          data: {
            id: roleId,
            name: 'Send-only E2E role',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(roleResponse.status()).toBe(201);

      const rolePermissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions`,
        {
          data: {
            enabled: true,
            permission: 'send_user_group_post_emails',
            role_id: roleId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(rolePermissionResponse.status()).toBe(201);

      const roleMemberResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_members`,
        {
          data: {
            role_id: roleId,
            user_id: senderOnlyUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(roleMemberResponse.status()).toBe(201);

      const permissionResponse = await senderOnlyPage.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/posts/permissions`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(permissionResponse.status()).toBe(200);
      await expect(permissionResponse.json()).resolves.toMatchObject({
        canApprovePosts: false,
      });

      const listResponse = await senderOnlyPage.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/users/approvals?kind=posts`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(listResponse.status()).toBe(403);
      await expect(listResponse.json()).resolves.toEqual({
        message: 'Unauthorized',
      });

      const mutationResponse = await senderOnlyPage.request.put(
        `${origin}/api/v1/workspaces/${workspaceId}/users/approvals`,
        {
          data: {
            action: 'approve',
            itemId: `${randomUUID()}:${randomUUID()}`,
            kind: 'posts',
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(mutationResponse.status()).toBe(403);
      await expect(mutationResponse.json()).resolves.toEqual({
        message: 'Unauthorized',
      });
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_role_members?role_id=eq.${roleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions?role_id=eq.${roleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_roles?id=eq.${roleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      if (senderOnlyUserId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_members?user_id=eq.${senderOnlyUserId}&ws_id=eq.${workspaceId}`,
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

      await senderOnlyContext.close();
    }
  });
});
