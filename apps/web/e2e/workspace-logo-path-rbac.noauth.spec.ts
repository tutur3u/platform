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

test.describe('Workspace logo path isolation', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('rejects traversal logo paths and refuses to sign unsafe legacy paths', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 247));
    const workspaceId = randomUUID();
    const victimWorkspaceId = randomUUID();
    const roleId = randomUUID();
    const managerEmail = `e2e-logo-manager-${Date.now()}@tuturuuu.com`;
    const managerContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const managerPage = await managerContext.newPage();
    let managerUserId: string | null = null;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: managerEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await managerPage.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: managerEmail,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(sessionResponse.status()).toBe(200);

      const profileResponse = await managerPage.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(profileResponse.status()).toBe(200);
      const profile = (await profileResponse.json()) as { id?: string };
      expect(profile.id).toEqual(expect.any(String));
      managerUserId = profile.id ?? null;

      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-logo-rbac-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Logo RBAC Workspace',
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
            user_id: managerUserId,
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
            name: 'Workspace settings E2E role',
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
            permission: 'manage_workspace_settings',
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
            user_id: managerUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(roleMemberResponse.status()).toBe(201);

      const safePath = `${workspaceId}/logos/logo-${Date.now()}.png`;
      const safePatchResponse = await managerPage.request.patch(
        `${origin}/api/v1/workspaces/${workspaceId}/logo`,
        {
          data: {
            filePath: safePath,
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(safePatchResponse.status()).toBe(200);
      await expect(safePatchResponse.json()).resolves.toEqual({
        success: true,
      });

      const maliciousPath = `${workspaceId}/../${victimWorkspaceId}/logos/logo-1.png`;
      const maliciousPatchResponse = await managerPage.request.patch(
        `${origin}/api/v1/workspaces/${workspaceId}/logo`,
        {
          data: {
            filePath: maliciousPath,
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(maliciousPatchResponse.status()).toBe(400);
      await expect(maliciousPatchResponse.json()).resolves.toEqual({
        message: 'Invalid file path',
      });

      const safeReadResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}&select=logo_url`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(safeReadResponse.status()).toBe(200);
      await expect(safeReadResponse.json()).resolves.toEqual([
        {
          logo_url: safePath,
        },
      ]);

      const legacyWriteResponse = await request.patch(
        `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
        {
          data: {
            logo_url: maliciousPath,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(legacyWriteResponse.status()).toBe(204);

      const unsafeReadResponse = await managerPage.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/logo`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(unsafeReadResponse.status()).toBe(200);
      await expect(unsafeReadResponse.json()).resolves.toEqual({
        url: null,
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

      if (managerUserId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_members?user_id=eq.${managerUserId}&ws_id=eq.${workspaceId}`,
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

      await managerContext.close();
    }
  });
});
