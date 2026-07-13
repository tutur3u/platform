import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { assertSafeContactsE2EEnvironment } from './helpers/environment';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const TEST_USER = {
  email: 'local@tuturuuu.com',
  id: '00000000-0000-0000-0000-000000000001',
} as const;
const APP_COORDINATION_SECRET =
  process.env.TUTURUUU_APP_COORDINATION_SECRET ??
  'local-e2e-app-coordination-secret';

function getSupabaseSecretKey() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error(
      'SUPABASE_SECRET_KEY is required for Contacts E2E fixtures'
    );
  }
  return secret;
}

function serviceHeaders(schema: 'private' | 'public' = 'public') {
  const supabaseSecretKey = getSupabaseSecretKey();
  return {
    apikey: supabaseSecretKey,
    authorization: `Bearer ${supabaseSecretKey}`,
    'content-profile': schema,
    'content-type': 'application/json',
    prefer: 'return=minimal',
  };
}

test.describe('Contacts group posts API', () => {
  const { supabaseUrl } = assertSafeContactsE2EEnvironment();

  test('rejects an unauthenticated daily report creation', async ({
    request,
  }) => {
    const response = await request.post(
      `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/user-groups/${randomUUID()}/posts`,
      {
        data: { title: 'Unauthorized E2E report' },
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  test('creates, lists, updates, reads status, and deletes a daily report', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const groupId = randomUUID();
    const virtualUserId = randomUUID();
    const title = `Contacts E2E daily report ${groupId}`;
    const { token } = createAppSessionToken(
      {
        email: TEST_USER.email,
        originApp: 'web',
        targetApp: 'contacts',
        userId: TEST_USER.id,
      },
      { secret: APP_COORDINATION_SECRET }
    );
    const appHeaders = { authorization: `Bearer ${token}` };
    let postId: string | null = null;

    try {
      const workspaceResponse = await request.post(
        `${supabaseUrl}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `contacts-e2e-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'Contacts group posts E2E',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const memberResponse = await request.post(
        `${supabaseUrl}/rest/v1/workspace_members`,
        {
          data: { type: 'MEMBER', user_id: TEST_USER.id, ws_id: workspaceId },
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(memberResponse.status()).toBe(201);

      const virtualUserResponse = await request.post(
        `${supabaseUrl}/rest/v1/workspace_users`,
        {
          data: {
            email: TEST_USER.email,
            full_name: 'Contacts E2E Actor',
            id: virtualUserId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(virtualUserResponse.status()).toBe(201);

      const fixtureResponse = await request.post(
        `${supabaseUrl}/rest/v1/workspace_user_groups`,
        {
          data: { id: groupId, name: title, ws_id: workspaceId },
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(fixtureResponse.status()).toBe(201);

      const createResponse = await request.post(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts`,
        {
          data: {
            content: 'Lesson completed',
            notes: 'Created by Contacts E2E',
            title,
          },
          failOnStatusCode: false,
          headers: appHeaders,
        }
      );
      const createBody = (await createResponse.json()) as unknown;
      expect(createResponse.status(), JSON.stringify(createBody)).toBe(200);

      const listResponse = await request.get(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts?limit=10`,
        { failOnStatusCode: false, headers: appHeaders }
      );
      expect(listResponse.status()).toBe(200);
      const list = (await listResponse.json()) as {
        data: Array<{ id: string; title: string | null }>;
      };
      postId = list.data.find((post) => post.title === title)?.id ?? null;
      expect(postId).toBeTruthy();

      const updateResponse = await request.put(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts/${postId}`,
        {
          data: { notes: 'Updated by Contacts E2E' },
          failOnStatusCode: false,
          headers: appHeaders,
        }
      );
      expect(updateResponse.status()).toBe(200);

      const statusResponse = await request.get(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts/${postId}/status`,
        { failOnStatusCode: false, headers: appHeaders }
      );
      expect(statusResponse.status()).toBe(200);
      await expect(statusResponse.json()).resolves.toEqual(
        expect.objectContaining({
          count: expect.any(Number),
          queue: expect.any(Object),
        })
      );

      const deleteResponse = await request.delete(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts/${postId}`,
        { failOnStatusCode: false, headers: appHeaders }
      );
      expect(deleteResponse.status()).toBe(200);
      postId = null;
    } finally {
      if (postId) {
        await request.delete(
          `${supabaseUrl}/rest/v1/user_group_posts?id=eq.${postId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders('private'),
          }
        );
      }
      await request.delete(
        `${supabaseUrl}/rest/v1/workspace_user_groups?id=eq.${groupId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await request.delete(
        `${supabaseUrl}/rest/v1/workspace_user_linked_users?ws_id=eq.${workspaceId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await request.delete(
        `${supabaseUrl}/rest/v1/workspace_users?id=eq.${virtualUserId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await request.delete(
        `${supabaseUrl}/rest/v1/workspace_members?ws_id=eq.${workspaceId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await request.delete(
        `${supabaseUrl}/rest/v1/workspaces?id=eq.${workspaceId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
    }
  });
});
