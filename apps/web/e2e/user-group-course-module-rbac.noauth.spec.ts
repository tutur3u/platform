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

test.describe('User-group course module RBAC', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('binds module create, order, update, and delete operations to the route workspace', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 263));
    const attackerRoleId = randomUUID();
    const attackerWorkspaceId = randomUUID();
    const moduleGroupId = randomUUID();
    const moduleId = randomUUID();
    const victimGroupId = randomUUID();
    const victimWorkspaceId = randomUUID();
    const lowPrivEmail = `e2e-course-module-${Date.now()}@tuturuuu.com`;
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

      for (const [workspaceId, handle] of [
        [attackerWorkspaceId, 'attacker'],
        [victimWorkspaceId, 'victim'],
      ]) {
        const workspaceResponse = await request.post(
          `${SUPABASE_URL}/rest/v1/workspaces`,
          {
            data: {
              creator_id: TEST_USER.id,
              handle: `e2e-course-${handle}-${workspaceId.slice(0, 8)}`,
              id: workspaceId,
              name: `E2E Course ${handle} Workspace`,
              personal: false,
            },
            failOnStatusCode: false,
            headers: serviceHeaders('return=minimal'),
          }
        );
        expect(workspaceResponse.status()).toBe(201);
        await deleteWorkspaceDefaults(request, workspaceId);
      }

      const membershipResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_members`,
        {
          data: {
            type: 'MEMBER',
            user_id: lowPrivUserId,
            ws_id: attackerWorkspaceId,
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
            id: attackerRoleId,
            name: 'Attacker user manager',
            ws_id: attackerWorkspaceId,
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
            permission: 'manage_users',
            role_id: attackerRoleId,
            ws_id: attackerWorkspaceId,
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
            role_id: attackerRoleId,
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
            id: victimGroupId,
            name: 'Victim Course Group',
            ws_id: victimWorkspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(groupResponse.status()).toBe(201);

      const moduleGroupResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_course_module_groups`,
        {
          data: {
            group_id: victimGroupId,
            id: moduleGroupId,
            sort_key: 1,
            title: 'Victim Module Group',
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(moduleGroupResponse.status()).toBe(201);

      const moduleResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_course_modules`,
        {
          data: {
            group_id: victimGroupId,
            id: moduleId,
            module_group_id: moduleGroupId,
            name: 'Victim Module',
            sort_key: 1,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(moduleResponse.status()).toBe(201);

      const createResponse = await lowPrivPage.request.post(
        `${origin}/api/v1/workspaces/${attackerWorkspaceId}/user-groups/${victimGroupId}/modules`,
        {
          data: {
            module_group_id: moduleGroupId,
            name: 'Injected Module',
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(createResponse.status()).toBe(404);

      const reorderResponse = await lowPrivPage.request.patch(
        `${origin}/api/v1/workspaces/${attackerWorkspaceId}/user-groups/${victimGroupId}/module-order`,
        {
          data: {
            moduleIds: [moduleId],
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(reorderResponse.status()).toBe(404);

      const updateResponse = await lowPrivPage.request.put(
        `${origin}/api/v1/workspaces/${attackerWorkspaceId}/course-modules/${moduleId}`,
        {
          data: {
            name: 'Cross-workspace rename',
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(updateResponse.status()).toBe(404);

      const deleteResponse = await lowPrivPage.request.delete(
        `${origin}/api/v1/workspaces/${attackerWorkspaceId}/course-modules/${moduleId}`,
        {
          failOnStatusCode: false,
          headers,
        }
      );
      expect(deleteResponse.status()).toBe(404);

      const moduleReadResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_course_modules?id=eq.${moduleId}&select=id,name,group_id,module_group_id`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(moduleReadResponse.status()).toBe(200);
      await expect(moduleReadResponse.json()).resolves.toEqual([
        expect.objectContaining({
          group_id: victimGroupId,
          id: moduleId,
          module_group_id: moduleGroupId,
          name: 'Victim Module',
        }),
      ]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_course_modules?id=eq.${moduleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_course_module_groups?id=eq.${moduleGroupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups?id=eq.${victimGroupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_roles?id=eq.${attackerRoleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      if (lowPrivUserId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_members?user_id=eq.${lowPrivUserId}&ws_id=eq.${attackerWorkspaceId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders(),
          }
        );
      }

      for (const workspaceId of [attackerWorkspaceId, victimWorkspaceId]) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders(),
          }
        );
      }

      await lowPrivContext.close();
    }
  });
});
