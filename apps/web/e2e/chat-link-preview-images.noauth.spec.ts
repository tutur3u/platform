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

function eqFilterValue(value: string) {
  return encodeURIComponent(value);
}

test.describe('chat link preview images', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('returns cached link previews without browser-loadable images', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 276));
    const chatId = randomUUID();
    const previewUrl = `https://example.com/e2e-link-preview-${randomUUID()}`;
    const context = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const page = await context.newPage();

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: TEST_USER.email,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await page.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: TEST_USER.email,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(sessionResponse.status()).toBe(200);

      const chatResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/ai_chats`,
        {
          data: {
            creator_id: TEST_USER.id,
            id: chatId,
            title: 'E2E text-only link previews',
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(chatResponse.status()).toBe(201);

      const cacheResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/chat_link_previews`,
        {
          data: {
            description: 'Cached preview description',
            image_url: null,
            normalized_url: previewUrl,
            site_name: 'Example',
            title: 'Cached preview title',
            url: previewUrl,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(cacheResponse.status()).toBe(201);

      const previewResponse = await page.request.post(
        `${origin}/api/v1/workspaces/personal/chat/conversations/ai-chat-${chatId}/link-previews`,
        {
          data: { urls: [`${previewUrl}#viewer-fragment`] },
          failOnStatusCode: false,
          headers,
        }
      );

      expect(previewResponse.status()).toBe(200);
      await expect(previewResponse.json()).resolves.toEqual({
        previews: [
          {
            description: 'Cached preview description',
            error: null,
            imageUrl: null,
            siteName: 'Example',
            title: 'Cached preview title',
            url: previewUrl,
          },
        ],
      });
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/chat_link_previews?normalized_url=eq.${eqFilterValue(previewUrl)}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      await request.delete(`${SUPABASE_URL}/rest/v1/ai_chats?id=eq.${chatId}`, {
        failOnStatusCode: false,
        headers: serviceHeaders(),
      });

      await context.close();
    }
  });
});
