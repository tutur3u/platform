import { randomUUID } from 'node:crypto';
import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test,
} from '@playwright/test';
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { AUTH_STATE_PATH, TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
  LOCAL_E2E_BASE_URL,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const EXTERNAL_PROJECT_ENABLED_SECRET = 'EXTERNAL_PROJECT_ENABLED';
const EXTERNAL_PROJECT_CANONICAL_ID_SECRET = 'EXTERNAL_PROJECT_CANONICAL_ID';
const BASE_URL = process.env.BASE_URL ?? LOCAL_E2E_BASE_URL;
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

function getAppCoordinationSecret() {
  const value =
    process.env.TUTURUUU_APP_COORDINATION_SECRET ??
    LOCAL_E2E_APP_COORDINATION_SECRET;
  const trimmed = value.trim();
  const quote = trimmed[0];

  if (
    (quote === '"' || quote === "'") &&
    trimmed.endsWith(quote) &&
    trimmed.length >= 2
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function createAppRequestContext(storageState?: string) {
  return playwrightRequest.newContext({
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    ...(storageState ? { storageState } : {}),
  });
}

test.describe('Workspace members enhanced API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('loads enhanced members for workspace settings', async () => {
    const appRequest = await createAppRequestContext(AUTH_STATE_PATH);

    try {
      const response = await appRequest.get(
        `/api/workspaces/${ROOT_WORKSPACE_ID}/members/enhanced`,
        {
          failOnStatusCode: false,
        }
      );

      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(expect.any(Array));
    } finally {
      await appRequest.dispose();
    }
  });

  test('does not reveal existing workspace handles to unauthenticated probes', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const handle = `e2e-members-private-${workspaceId.slice(0, 8)}`;
    const appRequest = await createAppRequestContext();

    try {
      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle,
            id: workspaceId,
            name: 'E2E Private Members Handle Workspace',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      for (const workspaceHandle of [handle, `${handle}-missing`]) {
        const response = await appRequest.get(
          `/api/workspaces/${workspaceHandle}/members/enhanced`,
          { failOnStatusCode: false }
        );

        expect(response.status()).toBe(404);
        await expect(response.json()).resolves.toEqual({
          error: 'Workspace not found',
        });
      }
    } finally {
      await appRequest.dispose();
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
    }
  });

  test('loads enhanced members through the CMS app-session route', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const canonicalProjectId = `e2e-members-${workspaceId}`;
    let appRequest: APIRequestContext | null = null;
    const { token } = createAppSessionToken(
      {
        email: TEST_USER.email,
        originApp: 'web',
        targetApp: 'cms',
        userId: TEST_USER.id,
      },
      {
        secret: getAppCoordinationSecret(),
      }
    );

    try {
      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-members-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Members CMS Workspace',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const memberResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_members`,
        {
          data: {
            type: 'MEMBER',
            user_id: TEST_USER.id,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(memberResponse.status()).toBe(201);

      const canonicalProjectResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/canonical_external_projects`,
        {
          data: {
            adapter: 'junly',
            allowed_collections: [],
            allowed_features: ['sync'],
            created_by: TEST_USER.id,
            delivery_profile: {},
            display_name: 'E2E Members CMS Project',
            id: canonicalProjectId,
            is_active: true,
            metadata: { e2e: true },
            updated_by: TEST_USER.id,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(canonicalProjectResponse.status()).toBe(201);

      const secretsResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_secrets`,
        {
          data: [
            {
              name: EXTERNAL_PROJECT_ENABLED_SECRET,
              value: 'true',
              ws_id: workspaceId,
            },
            {
              name: EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
              value: canonicalProjectId,
              ws_id: workspaceId,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(secretsResponse.status()).toBe(201);

      appRequest = await createAppRequestContext();
      const response = await appRequest.get(
        `/api/v1/workspaces/${workspaceId}/external-projects/members/enhanced`,
        {
          failOnStatusCode: false,
          headers: {
            authorization: `Bearer ${token}`,
          },
        }
      );

      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(expect.any(Array));
    } finally {
      await appRequest?.dispose();
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_secrets?ws_id=eq.${workspaceId}&name=in.(${EXTERNAL_PROJECT_ENABLED_SECRET},${EXTERNAL_PROJECT_CANONICAL_ID_SECRET})`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_members?ws_id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/canonical_external_projects?id=eq.${canonicalProjectId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
    }
  });
});
