import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
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

function privateServiceHeaders(prefer?: string) {
  return {
    ...serviceHeaders(prefer),
    'accept-profile': 'private',
    'content-profile': 'private',
  };
}

test.describe('User group posts private schema APIs', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('serves lesson migration data through the app while posts live in private', async ({
    request,
  }) => {
    const groupId = randomUUID();
    const postId = randomUUID();
    const title = `Private E2E Post ${Date.now()}`;

    try {
      const groupResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups`,
        {
          data: {
            id: groupId,
            name: 'Private E2E Group',
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(groupResponse.status()).toBe(201);

      const postResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/user_group_posts`,
        {
          data: {
            content: 'Private E2E content',
            group_id: groupId,
            id: postId,
            title,
          },
          failOnStatusCode: false,
          headers: privateServiceHeaders('return=minimal'),
        }
      );
      expect(postResponse.status()).toBe(201);

      const response = await request.get(
        `/api/v1/infrastructure/lessons?ws_id=${ROOT_WORKSPACE_ID}&limit=25`,
        { failOnStatusCode: false }
      );
      expect(response.status()).toBe(200);

      const body = (await response.json()) as {
        data?: Array<{ id?: string; title?: string }>;
      };
      expect(body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: postId,
            title,
          }),
        ])
      );

      const summaryResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/rpc/get_workspace_post_review_summary`,
        {
          data: {
            p_ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: privateServiceHeaders(),
        }
      );
      expect(summaryResponse.status()).toBe(200);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/user_group_posts?id=eq.${postId}`,
        {
          failOnStatusCode: false,
          headers: privateServiceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups?id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});
