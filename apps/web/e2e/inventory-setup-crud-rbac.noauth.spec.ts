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

test.describe
  .skip('Inventory setup CRUD RBAC', () => {
    test.beforeAll(() => {
      assertSafeE2EEnvironment();
    });

    test('does not let create-only inventory users update or delete setup records', async ({
      baseURL,
      browser,
      request,
    }, testInfo) => {
      const origin = baseURL ?? 'https://tuturuuu.localhost';
      const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 279));
      const roleId = randomUUID();
      const workspaceId = randomUUID();
      const createOnlyEmail = `e2e-inventory-setup-${Date.now()}@tuturuuu.com`;
      const context = await browser.newContext({
        extraHTTPHeaders: headers,
      });
      const page = await context.newPage();
      let createOnlyUserId: string | null = null;

      try {
        await resetDbRateLimits();
        await resetAppRateLimitStateForTests(request, {
          completeOnboarding: true,
          email: createOnlyEmail,
          headers,
          locale: DEFAULT_LOCALE,
        });

        const sessionResponse = await page.request.post(
          `${origin}/api/auth/dev-session`,
          {
            data: {
              completeOnboarding: true,
              email: createOnlyEmail,
              locale: DEFAULT_LOCALE,
            },
            headers,
          }
        );
        expect(sessionResponse.status()).toBe(200);

        const profileResponse = await page.request.get(
          `${origin}/api/v1/users/me/profile`,
          { headers }
        );
        expect(profileResponse.status()).toBe(200);
        const profile = (await profileResponse.json()) as { id?: string };
        expect(profile.id).toEqual(expect.any(String));
        createOnlyUserId = profile.id ?? null;

        const workspaceResponse = await request.post(
          `${SUPABASE_URL}/rest/v1/workspaces`,
          {
            data: {
              creator_id: TEST_USER.id,
              handle: `e2e-inventory-rbac-${workspaceId.slice(0, 8)}`,
              id: workspaceId,
              name: 'E2E Inventory Setup RBAC',
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
              user_id: createOnlyUserId,
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
              name: 'Inventory create only',
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
              permission: 'create_inventory',
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
              user_id: createOnlyUserId,
            },
            failOnStatusCode: false,
            headers: serviceHeaders({ prefer: 'return=minimal' }),
          }
        );
        expect(roleMemberResponse.status()).toBe(201);

        const manufacturerResponse = await page.request.post(
          `${origin}/api/v1/workspaces/${workspaceId}/inventory/manufacturers`,
          {
            data: { name: 'Create Only Manufacturer' },
            failOnStatusCode: false,
            headers,
          }
        );
        expect(manufacturerResponse.status()).toBe(200);
        const manufacturerBody = (await manufacturerResponse.json()) as {
          data?: { id?: string };
        };
        expect(manufacturerBody.data?.id).toEqual(expect.any(String));
        const manufacturerId = manufacturerBody.data?.id as string;

        const unitResponse = await page.request.post(
          `${origin}/api/v1/workspaces/${workspaceId}/product-units`,
          {
            data: { name: 'Create Only Unit' },
            failOnStatusCode: false,
            headers,
          }
        );
        expect(unitResponse.status()).toBe(200);
        const unitBody = (await unitResponse.json()) as {
          data?: { id?: string };
        };
        expect(unitBody.data?.id).toEqual(expect.any(String));
        const unitId = unitBody.data?.id as string;

        const manufacturerUpdateResponse = await page.request.patch(
          `${origin}/api/v1/workspaces/${workspaceId}/inventory/manufacturers/${manufacturerId}`,
          {
            data: { name: 'Updated Manufacturer' },
            failOnStatusCode: false,
            headers,
          }
        );
        expect(manufacturerUpdateResponse.status()).toBe(403);
        await expect(manufacturerUpdateResponse.json()).resolves.toEqual({
          message: 'Forbidden',
        });

        const manufacturerDeleteResponse = await page.request.delete(
          `${origin}/api/v1/workspaces/${workspaceId}/inventory/manufacturers/${manufacturerId}`,
          {
            failOnStatusCode: false,
            headers,
          }
        );
        expect(manufacturerDeleteResponse.status()).toBe(403);
        await expect(manufacturerDeleteResponse.json()).resolves.toEqual({
          message: 'Forbidden',
        });

        const unitUpdateResponse = await page.request.put(
          `${origin}/api/v1/workspaces/${workspaceId}/product-units/${unitId}`,
          {
            data: { name: 'Updated Unit' },
            failOnStatusCode: false,
            headers,
          }
        );
        expect(unitUpdateResponse.status()).toBe(403);
        await expect(unitUpdateResponse.json()).resolves.toEqual({
          message: 'Insufficient permissions to update units',
        });

        const unitDeleteResponse = await page.request.delete(
          `${origin}/api/v1/workspaces/${workspaceId}/product-units/${unitId}`,
          {
            failOnStatusCode: false,
            headers,
          }
        );
        expect(unitDeleteResponse.status()).toBe(403);
        await expect(unitDeleteResponse.json()).resolves.toEqual({
          message: 'Insufficient permissions to delete units',
        });

        const manufacturersReadResponse = await request.get(
          `${SUPABASE_URL}/rest/v1/inventory_manufacturers?id=eq.${manufacturerId}&select=name`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders({ schema: 'private' }),
          }
        );
        expect(manufacturersReadResponse.status()).toBe(200);
        await expect(manufacturersReadResponse.json()).resolves.toEqual([
          { name: 'Create Only Manufacturer' },
        ]);

        const unitsReadResponse = await request.get(
          `${SUPABASE_URL}/rest/v1/inventory_units?id=eq.${unitId}&select=name`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders({ schema: 'private' }),
          }
        );
        expect(unitsReadResponse.status()).toBe(200);
        await expect(unitsReadResponse.json()).resolves.toEqual([
          { name: 'Create Only Unit' },
        ]);
      } finally {
        await context.close();
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders({ prefer: 'return=minimal' }),
          }
        );
      }
    });
  });
