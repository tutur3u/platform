import { expect, test } from '@playwright/test';
import { assertSafeE2EEnvironment } from './helpers/environment';

function zaloTextPayload(messageId: string) {
  return {
    event_name: 'message.text.received',
    message: {
      chat: {
        chat_type: 'PRIVATE',
        id: `chat-${messageId}`,
      },
      date: Date.now(),
      from: {
        display_name: 'E2E External User',
        id: `external-${messageId}`,
        is_bot: false,
      },
      message_id: messageId,
      text: 'Hello agent',
    },
  };
}

test.describe('AI agent webhook public surface', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('rejects unsupported adapters before resolving channel runtime', async ({
    baseURL,
    request,
  }) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const response = await request.post(
      `${origin}/api/v1/webhooks/ai-agents/email/missing-channel`,
      {
        data: zaloTextPayload('unsupported-adapter-message'),
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Unknown AI agent adapter',
    });
  });

  test('rejects unknown channels before creating an adapter runtime', async ({
    baseURL,
    request,
  }) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const response = await request.post(
      `${origin}/api/v1/webhooks/ai-agents/zalo/e2e-missing-channel`,
      {
        data: zaloTextPayload('missing-channel-message'),
        failOnStatusCode: false,
        headers: {
          'x-bot-api-secret-token': 'irrelevant-before-runtime',
        },
      }
    );

    expect(response.status()).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'AI agent channel not found',
    });
  });
});
