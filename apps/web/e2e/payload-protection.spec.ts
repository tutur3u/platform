import { expect, test } from '@playwright/test';
import { resetDbRateLimits } from './helpers/rate-limits';

/**
 * E2E tests for payload size protection on API endpoints.
 *
 * Tests that API routes correctly reject:
 *   1. Oversized payloads (exceeding byte limit)
 *   2. Emoji-heavy payloads (multi-byte character abuse)
 *   3. Zod schema violations (string fields exceeding .max())
 *
 * Uses PUT /api/v1/users/me/configs/{configId} as the test endpoint
 * since it accepts a JSON body with a `value` string field and is
 * accessible to authenticated users.
 */

/** Config endpoint — accepts { value: string } body on PUT. */
const CONFIG_URL = '/api/v1/users/me/configs/PAYLOAD_SIZE_E2E_TEST';

/**
 * Generate a unique IP per test × retry to isolate from rate limiting.
 */
function ip(testSlot: number, retry: number): string {
  return `10.200.${testSlot}.${retry + 1}`;
}

function clientHeaders(addr: string) {
  return {
    'CF-Connecting-IP': addr,
    'True-Client-IP': addr,
    'X-Forwarded-For': '203.0.113.200, 10.0.0.1',
  };
}

test.describe('Payload size protection', () => {
  test.beforeEach(async () => {
    await resetDbRateLimits();
  });

  test('reject body exceeding byte size limit', async ({
    context,
  }, testInfo) => {
    // Create a payload ~600KB (exceeds 512KB MAX_PAYLOAD_SIZE)
    const largeValue = 'x'.repeat(600 * 1024);

    const res = await context.request.put(CONFIG_URL, {
      headers: clientHeaders(ip(1, testInfo.retry)),
      data: { value: largeValue },
    });

    // Should be rejected with 413 Payload Too Large
    expect(res.status()).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('Payload Too Large');
  });

  test('rejects emoji-heavy payload exceeding byte limit', async ({
    context,
  }, testInfo) => {
    // 150000 emojis × 4 bytes each = 600000 bytes (~585KB) > 512KB limit
    const emojiPayload = '🎉'.repeat(150000);

    const res = await context.request.put(CONFIG_URL, {
      headers: clientHeaders(ip(2, testInfo.retry)),
      data: { value: emojiPayload },
    });

    // Should be rejected — total byte size exceeds limit
    expect(res.status()).toBe(413);
  });

  test('accepts normal-sized payload', async ({ context }, testInfo) => {
    const res = await context.request.put(CONFIG_URL, {
      headers: clientHeaders(ip(3, testInfo.retry)),
      data: { value: 'normal-test-value' },
    });

    // Should succeed
    expect(res.status()).toBe(200);
  });

  test('accepts small emoji payload within limits', async ({
    context,
  }, testInfo) => {
    // 10 emojis × 4 bytes = 40 bytes — well within limits
    const smallEmojiPayload = '🎉'.repeat(10);

    const res = await context.request.put(CONFIG_URL, {
      headers: clientHeaders(ip(4, testInfo.retry)),
      data: { value: smallEmojiPayload },
    });

    expect(res.status()).toBe(200);
  });

  test('rejects string field exceeding Zod .max() constraint', async ({
    context,
  }, testInfo) => {
    // The config value field has .max(MAX_MEDIUM_TEXT_LENGTH = 1000)
    // Send 1500 chars in the value field — within body byte limit but
    // exceeds Zod .max()
    const longValue = 'a'.repeat(1500);

    const res = await context.request.put(CONFIG_URL, {
      headers: clientHeaders(ip(5, testInfo.retry)),
      data: { value: longValue },
    });

    // Should be rejected with 400 Bad Request (Zod validation failure)
    expect(res.status()).toBe(400);
  });

  test('rejects invalid JSON body', async ({ context }, testInfo) => {
    const res = await context.request.fetch(CONFIG_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...clientHeaders(ip(6, testInfo.retry)),
      },
      data: '{invalid json!!!}',
    });

    // Should be rejected with 400 or 500 depending on parsing layer
    expect([400, 500]).toContain(res.status());
  });
});
