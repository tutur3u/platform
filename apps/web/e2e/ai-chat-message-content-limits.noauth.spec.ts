import { expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

const USER_ID = '00000000-0000-0000-0000-000000000010';
const CHAT_ID = '00000000-0000-0000-0000-000000000011';

function publicRpcHeaders() {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'content-type': 'application/json',
  };
}

function serviceHeaders() {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    prefer: 'resolution=merge-duplicates',
  };
}

test.describe('AI chat message content limits', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test.beforeEach(async ({ request }) => {
    await request.post(`${SUPABASE_URL}/rest/v1/users`, {
      data: { id: USER_ID },
      failOnStatusCode: false,
      headers: serviceHeaders(),
    });

    await request.post(`${SUPABASE_URL}/rest/v1/ai_chats`, {
      data: {
        creator_id: USER_ID,
        id: CHAT_ID,
        title: 'e2e content limit probe',
      },
      failOnStatusCode: false,
      headers: serviceHeaders(),
    });
  });

  test.afterEach(async ({ request }) => {
    await request.delete(
      `${SUPABASE_URL}/rest/v1/ai_chat_messages?chat_id=eq.${CHAT_ID}`,
      {
        failOnStatusCode: false,
        headers: serviceHeaders(),
      }
    );

    await request.delete(`${SUPABASE_URL}/rest/v1/ai_chats?id=eq.${CHAT_ID}`, {
      failOnStatusCode: false,
      headers: serviceHeaders(),
    });

    await request.delete(`${SUPABASE_URL}/rest/v1/users?id=eq.${USER_ID}`, {
      failOnStatusCode: false,
      headers: serviceHeaders(),
    });
  });

  test('rejects oversized public chat message RPC payloads', async ({
    request,
  }) => {
    const boundaryResponse = await request.post(
      `${SUPABASE_URL}/rest/v1/rpc/insert_ai_chat_message`,
      {
        data: {
          chat_id: CHAT_ID,
          message: 'a'.repeat(10000),
          source: 'e2e',
        },
        failOnStatusCode: false,
        headers: publicRpcHeaders(),
      }
    );

    expect(boundaryResponse.status()).toBe(204);

    const oversizedResponse = await request.post(
      `${SUPABASE_URL}/rest/v1/rpc/insert_ai_chat_message`,
      {
        data: {
          chat_id: CHAT_ID,
          message: 'b'.repeat(10001),
          source: 'e2e',
        },
        failOnStatusCode: false,
        headers: publicRpcHeaders(),
      }
    );

    expect(oversizedResponse.status()).toBe(400);
    await expect(oversizedResponse.json()).resolves.toEqual(
      expect.objectContaining({
        code: '22023',
        message: 'ai_chat_message_content_too_large',
      })
    );

    const persistedResponse = await request.get(
      `${SUPABASE_URL}/rest/v1/ai_chat_messages?chat_id=eq.${CHAT_ID}&select=content`,
      {
        failOnStatusCode: false,
        headers: serviceHeaders(),
      }
    );

    expect(persistedResponse.status()).toBe(200);
    const rows = (await persistedResponse.json()) as Array<{
      content?: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toHaveLength(10000);
  });
});
