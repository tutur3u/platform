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

test.describe('Workspace quiz answer privacy', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test.skip('stores dynamic answers privately while teacher API can still render them', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    // TODO(#4956): Re-home this coverage in the Teach satellite E2E suite.
    // The endpoint is covered at the route level in apps/teach for now.
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 344));
    const context = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const page = await context.newPage();
    const roleId = randomUUID();
    const workspaceId = randomUUID();
    const teacherEmail = `e2e-quiz-answer-${Date.now()}@tuturuuu.com`;
    let teacherUserId: string | null = null;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: teacherEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await page.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: teacherEmail,
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
      teacherUserId = profile.id ?? null;

      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-quiz-answer-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Quiz Answer Privacy Workspace',
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
            user_id: teacherUserId,
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
            name: 'Quiz answer teacher',
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
            permission: 'update_user_groups',
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
            user_id: teacherUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(roleMemberResponse.status()).toBe(201);

      const createResponse = await page.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/quizzes`,
        {
          data: {
            quizzes: [
              {
                answer: { correct: true },
                question: 'Should this answer stay private?',
                type: 'true_false',
              },
            ],
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(createResponse.status()).toBe(200);

      const publicQuizResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_quizzes?ws_id=eq.${workspaceId}&select=id,answer`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(publicQuizResponse.status()).toBe(200);
      const publicQuizzes = (await publicQuizResponse.json()) as Array<{
        answer: unknown;
        id: string;
      }>;
      expect(publicQuizzes).toHaveLength(1);
      expect(publicQuizzes[0]?.answer).toBeNull();
      const quizId = publicQuizzes[0]?.id;
      expect(quizId).toEqual(expect.any(String));

      const privateAnswerResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_quiz_answers?quiz_id=eq.${quizId}&select=answer`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(privateAnswerResponse.status()).toBe(200);
      await expect(privateAnswerResponse.json()).resolves.toEqual([
        { answer: { correct: true } },
      ]);

      const appListResponse = await page.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/quizzes?page=1&pageSize=20`,
        { failOnStatusCode: false, headers }
      );
      expect(appListResponse.status()).toBe(200);
      const appPayload = (await appListResponse.json()) as {
        data: Array<{ answer: unknown; id: string; question: string }>;
      };
      expect(appPayload.data).toEqual([
        expect.objectContaining({
          answer: { correct: true },
          id: quizId,
          question: 'Should this answer stay private?',
        }),
      ]);
    } finally {
      await context.close();
    }
  });
});
