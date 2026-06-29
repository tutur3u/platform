import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
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

function appSessionBearer(targetApp: string) {
  const { token } = createAppSessionToken(
    {
      email: TEST_USER.email,
      originApp: 'web',
      targetApp,
      userId: TEST_USER.id,
    },
    { secret: getAppCoordinationSecret() }
  );

  return `Bearer ${token}`;
}

test.describe('Task template RBAC', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('enforces auth, membership, visibility, guest, mutation, and CLI app-session boundaries', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const workspaceId = randomUUID();
    const boardId = randomUUID();
    const listId = randomUUID();
    const ownerWorkspaceTemplateId = randomUUID();
    const ownerPrivateTemplateId = randomUUID();
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 247));
    const lowPrivEmail = `e2e-template-member-${Date.now()}@tuturuuu.com`;
    const guestEmail = `e2e-template-guest-${Date.now()}@tuturuuu.com`;
    const strangerEmail = `e2e-template-stranger-${Date.now()}@tuturuuu.com`;
    const lowPrivContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const guestContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const strangerContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const lowPrivPage = await lowPrivContext.newPage();
    const guestPage = await guestContext.newPage();
    const strangerPage = await strangerContext.newPage();
    let lowPrivUserId: string | null = null;
    let guestUserId: string | null = null;

    try {
      const unauthenticatedRoutes = [
        () =>
          request.get(
            `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
            { failOnStatusCode: false, headers }
          ),
        () =>
          request.post(
            `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
            {
              data: { name: 'Denied', task_name: 'Denied' },
              failOnStatusCode: false,
              headers,
            }
          ),
        () =>
          request.get(
            `${origin}/api/v1/workspaces/${workspaceId}/task-templates/missing`,
            { failOnStatusCode: false, headers }
          ),
        () =>
          request.patch(
            `${origin}/api/v1/workspaces/${workspaceId}/task-templates/missing`,
            {
              data: { name: 'Denied' },
              failOnStatusCode: false,
              headers,
            }
          ),
        () =>
          request.delete(
            `${origin}/api/v1/workspaces/${workspaceId}/task-templates/missing`,
            { failOnStatusCode: false, headers }
          ),
      ];

      for (const sendRequest of unauthenticatedRoutes) {
        const response = await sendRequest();
        expect(response.status()).toBe(401);
      }

      await resetDbRateLimits();

      for (const [email, page] of [
        [lowPrivEmail, lowPrivPage],
        [guestEmail, guestPage],
        [strangerEmail, strangerPage],
      ] as const) {
        await resetAppRateLimitStateForTests(request, {
          completeOnboarding: true,
          email,
          headers,
          locale: DEFAULT_LOCALE,
        });
        const sessionResponse = await page.request.post(
          `${origin}/api/auth/dev-session`,
          {
            data: {
              completeOnboarding: true,
              email,
              locale: DEFAULT_LOCALE,
            },
            headers,
          }
        );
        expect(sessionResponse.status()).toBe(200);
      }

      const lowPrivProfile = await lowPrivPage.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(lowPrivProfile.status()).toBe(200);
      lowPrivUserId = ((await lowPrivProfile.json()) as { id: string }).id;

      const guestProfile = await guestPage.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(guestProfile.status()).toBe(200);
      guestUserId = ((await guestProfile.json()) as { id: string }).id;

      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-templates-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Task Templates RBAC Workspace',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const membershipResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_members`,
        {
          data: [
            {
              type: 'MEMBER',
              user_id: TEST_USER.id,
              ws_id: workspaceId,
            },
            {
              type: 'MEMBER',
              user_id: lowPrivUserId,
              ws_id: workspaceId,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(membershipResponse.status()).toBe(201);

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_default_permissions?ws_id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      const boardResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_boards`,
        {
          data: {
            id: boardId,
            name: 'E2E Template Guest Board',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(boardResponse.status()).toBe(201);

      const listResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/task_lists`,
        {
          data: {
            board_id: boardId,
            id: listId,
            name: 'E2E Template Guest List',
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(listResponse.status()).toBe(201);

      const templateSeedResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/task_templates`,
        {
          data: [
            {
              created_by: TEST_USER.id,
              id: ownerWorkspaceTemplateId,
              name: 'Owner Workspace Template',
              slug: 'owner-workspace-template',
              task_name: 'Owner Workspace Task',
              visibility: 'workspace',
              ws_id: workspaceId,
            },
            {
              created_by: TEST_USER.id,
              id: ownerPrivateTemplateId,
              name: 'Owner Private Template',
              slug: 'owner-private-template',
              task_name: 'Owner Private Task',
              visibility: 'private',
              ws_id: workspaceId,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(templateSeedResponse.status()).toBe(201);

      const shareResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/task_board_shares`,
        {
          data: {
            board_id: boardId,
            permission: 'edit',
            shared_by_user_id: TEST_USER.id,
            shared_with_email: guestEmail,
            shared_with_user_id: guestUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(shareResponse.status()).toBe(201);

      const strangerListResponse = await strangerPage.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
        { failOnStatusCode: false, headers }
      );
      expect(strangerListResponse.status()).toBe(403);

      const guestListResponse = await guestPage.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
        { failOnStatusCode: false, headers }
      );
      expect(guestListResponse.status()).toBe(403);

      const guestCreateResponse = await guestPage.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
        {
          data: { name: 'Guest', task_name: 'Guest' },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(guestCreateResponse.status()).toBe(403);

      const lowPrivListResponse = await lowPrivPage.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
        { failOnStatusCode: false, headers }
      );
      expect(lowPrivListResponse.status()).toBe(200);
      const lowPrivList = (await lowPrivListResponse.json()) as {
        templates?: Array<{ slug: string }>;
      };
      expect(lowPrivList.templates?.map((template) => template.slug)).toContain(
        'owner-workspace-template'
      );
      expect(
        lowPrivList.templates?.map((template) => template.slug)
      ).not.toContain('owner-private-template');

      const privateReadResponse = await lowPrivPage.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates/owner-private-template`,
        { failOnStatusCode: false, headers }
      );
      expect(privateReadResponse.status()).toBe(404);

      const lowPrivWorkspaceCreate = await lowPrivPage.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
        {
          data: {
            name: 'Low Priv Workspace Template',
            task_name: 'Low Priv Workspace Task',
            visibility: 'workspace',
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(lowPrivWorkspaceCreate.status()).toBe(403);

      const lowPrivPrivateCreate = await lowPrivPage.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
        {
          data: {
            key: 'low-priv-private',
            name: 'Low Priv Private',
            task_name: 'Low Priv Private Task',
            visibility: 'private',
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(lowPrivPrivateCreate.status()).toBe(201);

      const lowPrivPromote = await lowPrivPage.request.patch(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates/low-priv-private`,
        {
          data: { visibility: 'workspace' },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(lowPrivPromote.status()).toBe(403);

      const validCliList = await request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
        {
          failOnStatusCode: false,
          headers: {
            authorization: appSessionBearer('tasks'),
            ...headers,
          },
        }
      );
      expect(validCliList.status()).toBe(200);
      expect(validCliList.headers()['set-cookie'] ?? '').not.toContain('sb-');

      const wrongTargetCliList = await request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
        {
          failOnStatusCode: false,
          headers: {
            authorization: appSessionBearer('nova'),
            ...headers,
          },
        }
      );
      expect(wrongTargetCliList.status()).toBe(401);
      expect(wrongTargetCliList.headers()['set-cookie'] ?? '').not.toContain(
        'sb-'
      );

      const malformedCliList = await request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/task-templates`,
        {
          failOnStatusCode: false,
          headers: {
            authorization: 'Bearer ttr_app_invalid',
            ...headers,
          },
        }
      );
      expect(malformedCliList.status()).toBe(401);
    } finally {
      await lowPrivContext.close();
      await guestContext.close();
      await strangerContext.close();

      await request.delete(
        `${SUPABASE_URL}/rest/v1/task_templates?ws_id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/task_board_shares?board_id=eq.${boardId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/task_lists?id=eq.${listId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_boards?id=eq.${boardId}`,
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
        `${SUPABASE_URL}/rest/v1/workspace_default_permissions?ws_id=eq.${workspaceId}`,
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
    }
  });
});
