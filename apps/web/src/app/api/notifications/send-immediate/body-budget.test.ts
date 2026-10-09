import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_IMMEDIATE_REQUEST_BYTES,
  MAX_IMMEDIATE_REQUEST_DURATION_MS,
} from '@/lib/notifications/immediate-request-body';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(() => {
    throw new Error('Database must not be reached');
  }),
  sendSystemEmail: vi.fn(),
  sendPushNotificationBatch: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/email-service', () => ({
  sendSystemEmail: mocks.sendSystemEmail,
}));
vi.mock('@/lib/notifications/push-delivery', () => ({
  sendPushNotificationBatch: mocks.sendPushNotificationBatch,
}));

import { POST } from './route';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function req(body: string, authorized = true) {
  vi.stubEnv('CRON_SECRET', 'disposable-body-budget-token');
  return new Request('http://localhost/api/notifications/send-immediate', {
    method: 'POST',
    headers: authorized
      ? { authorization: 'Bearer disposable-body-budget-token' }
      : {},
    body,
  });
}
function assertNoDeliveryWork() {
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
  expect(mocks.sendSystemEmail).not.toHaveBeenCalled();
  expect(mocks.sendPushNotificationBatch).not.toHaveBeenCalled();
}

describe('immediate route body and ID boundaries', () => {
  it('rejects oversized authenticated bodies before JSON or database work', async () => {
    const response = await POST(
      req('x'.repeat(MAX_IMMEDIATE_REQUEST_BYTES + 1)) as Parameters<
        typeof POST
      >[0]
    );
    expect(response.status).toBe(413);
    assertNoDeliveryWork();
  });

  it('authenticates before reading even an oversized body', async () => {
    const request = req('x'.repeat(MAX_IMMEDIATE_REQUEST_BYTES + 1), false);
    expect((await POST(request as Parameters<typeof POST>[0])).status).toBe(
      401
    );
    expect(request.bodyUsed).toBe(false);
    assertNoDeliveryWork();
  });

  it('retains malformed JSON rejection before database work', async () => {
    expect(
      (await POST(req('{broken') as Parameters<typeof POST>[0])).status
    ).toBe(400);
    assertNoDeliveryWork();
  });

  it('rejects too many IDs before database or provider work', async () => {
    const request = req(
      JSON.stringify({ batch_ids: Array(101).fill('batch') })
    );
    expect((await POST(request as Parameters<typeof POST>[0])).status).toBe(
      400
    );
    assertNoDeliveryWork();
  });
});

it('returns408 for a stalled authenticated body before any delivery work', async () => {
  vi.useFakeTimers();
  vi.stubEnv('CRON_SECRET', 'disposable-body-budget-token');
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const request = new Request(
    'http://localhost/api/notifications/send-immediate',
    {
      method: 'POST',
      headers: { authorization: 'Bearer disposable-body-budget-token' },
      body: new ReadableStream({
        pull: () => new Promise<void>(() => {}),
        cancel,
      }),
      duplex: 'half',
    } as RequestInit
  );
  const pending = POST(request as Parameters<typeof POST>[0]);
  await vi.advanceTimersByTimeAsync(MAX_IMMEDIATE_REQUEST_DURATION_MS);
  expect((await pending).status).toBe(408);
  expect(cancel).toHaveBeenCalledTimes(1);
  assertNoDeliveryWork();
});
