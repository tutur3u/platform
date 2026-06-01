import { expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_CRON_SECRET,
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
const CRON_SECRET =
  process.env.CRON_SECRET ??
  process.env.VERCEL_CRON_SECRET ??
  LOCAL_E2E_CRON_SECRET;

function publicRpcHeaders() {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'content-type': 'application/json',
  };
}

function privateServiceRpcHeaders() {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'accept-profile': 'private',
    'content-profile': 'private',
    'content-type': 'application/json',
  };
}

test.describe('Post email queue RPC exposure', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('keeps queue summary private while the cron app surface still works', async ({
    request,
  }) => {
    const publicRpcResponse = await request.post(
      `${SUPABASE_URL}/rest/v1/rpc/get_post_email_queue_status_summary`,
      {
        data: {
          p_ws_id: null,
        },
        failOnStatusCode: false,
        headers: publicRpcHeaders(),
      }
    );

    expect(publicRpcResponse.status()).not.toBe(200);

    const privateRpcResponse = await request.post(
      `${SUPABASE_URL}/rest/v1/rpc/get_post_email_queue_status_summary`,
      {
        data: {
          p_ws_id: null,
        },
        failOnStatusCode: false,
        headers: privateServiceRpcHeaders(),
      }
    );

    expect(privateRpcResponse.status()).toBe(200);
    const privateRpcBody = await privateRpcResponse.json();
    const summary = Array.isArray(privateRpcBody)
      ? privateRpcBody[0]
      : privateRpcBody;
    expect(summary).toEqual(
      expect.objectContaining({
        blocked: expect.any(Number),
        cancelled: expect.any(Number),
        failed: expect.any(Number),
        processing: expect.any(Number),
        queued: expect.any(Number),
        sent: expect.any(Number),
        skipped: expect.any(Number),
        total: expect.any(Number),
      })
    );

    const rejectedCronResponse = await request.get(
      '/api/cron/process-post-email-queue?debug=1&limit=1&sendLimit=1',
      {
        failOnStatusCode: false,
        headers: {
          Authorization: 'Bearer wrong-cron-secret',
        },
      }
    );

    expect(rejectedCronResponse.status()).toBe(401);

    const cronResponse = await request.get(
      '/api/cron/process-post-email-queue?debug=1&limit=1&sendLimit=1',
      {
        failOnStatusCode: false,
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      }
    );

    expect(cronResponse.status()).toBe(200);
    await expect(cronResponse.json()).resolves.toEqual(
      expect.objectContaining({
        diagnostics: expect.objectContaining({
          queueAfter: expect.objectContaining({
            total: expect.any(Number),
          }),
          queueBefore: expect.objectContaining({
            total: expect.any(Number),
          }),
        }),
        ok: true,
      })
    );
  });
});
