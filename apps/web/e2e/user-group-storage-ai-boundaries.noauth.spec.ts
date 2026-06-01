import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
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

async function deleteWorkspaceDefaults(
  request: APIRequestContext,
  workspaceId: string
) {
  const response = await request.delete(
    `${SUPABASE_URL}/rest/v1/workspace_default_permissions?ws_id=eq.${workspaceId}`,
    {
      failOnStatusCode: false,
      headers: serviceHeaders('return=minimal'),
    }
  );
  expect(response.status()).toBe(204);
}

test.describe('User-group storage AI boundaries', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('requires group view permission before course generation can read group files', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 264));
    const groupId = randomUUID();
    const roleId = randomUUID();
    const workspaceId = randomUUID();
    const lowPrivEmail = `e2e-group-storage-ai-${Date.now()}@tuturuuu.com`;
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
            handle: `e2e-group-ai-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Group AI Storage Boundary',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(workspaceResponse.status()).toBe(201);
      await deleteWorkspaceDefaults(request, workspaceId);

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

      const roleResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_roles`,
        {
          data: {
            id: roleId,
            name: 'Group editor without viewer',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(roleResponse.status()).toBe(201);

      const permissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions`,
        {
          data: {
            enabled: true,
            permission: 'update_user_groups',
            role_id: roleId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
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
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(roleMemberResponse.status()).toBe(201);

      const groupResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups`,
        {
          data: {
            creator_id: TEST_USER.id,
            id: groupId,
            name: 'Private Course Source Group',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(groupResponse.status()).toBe(201);

      const uploadUrlResponse = await lowPrivPage.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/storage`,
        {
          data: {
            contentType: 'application/pdf',
            filename: 'empty-syllabus.pdf',
            size: 0,
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(uploadUrlResponse.status()).toBe(400);
      await expect(uploadUrlResponse.json()).resolves.toEqual({
        message: 'File is empty',
      });

      const courseResponse = await lowPrivPage.request.post(
        `${origin}/api/ai/course`,
        {
          data: {
            fileName: 'private-syllabus.pdf',
            groupId,
            storagePath: `${workspaceId}/user-groups/${groupId}/private-syllabus.pdf`,
            wsId: workspaceId,
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(courseResponse.status()).toBe(403);
      await expect(courseResponse.json()).resolves.toEqual({
        message: 'Insufficient permissions',
      });
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups?id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      if (lowPrivUserId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_role_members?role_id=eq.${roleId}&user_id=eq.${lowPrivUserId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders(),
          }
        );

        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_members?user_id=eq.${lowPrivUserId}&ws_id=eq.${workspaceId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders(),
          }
        );
      }

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
