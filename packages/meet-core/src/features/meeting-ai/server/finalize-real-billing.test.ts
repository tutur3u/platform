import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Runs the REAL billing wrapper, the REAL Gemini failure classification and the
 * REAL finalizer. Only the network edge (`generateText`), the credit check and
 * the AI Studio ledger RPCs are stand-ins. The ledger refuses a repeated
 * idempotency key exactly as `begin_ai_studio_run` does.
 */
const h = vi.hoisted(() => ({
  db: null as unknown,
  generateText: vi.fn(),
  begin: vi.fn(),
  settle: vi.fn(),
  keys: new Set<string>(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  isParleySession: async () => false,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => h.db,
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: async () => ({
    allowed: true,
    tier: 'FREE',
    maxOutputTokens: 2048,
  }),
}));
vi.mock('../../call/server/room-service', () => ({
  personalWorkspace: async () => 'personal-workspace',
}));
vi.mock('./provider-transport', () => ({
  meetingProviderTransport: async () => ({}),
}));
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  generateText: h.generateText,
}));
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginAiStudioRun: h.begin,
  settleAiStudioRun: h.settle,
  recordAiStudioRunStep: async () => undefined,
}));

import { APICallError } from 'ai';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { finalizeMeetAi } from './finalize';
import {
  bearer,
  buildTables,
  fakeDb,
  sessionId,
} from './finalize.fixtures';

function setup() {
  const tables = {
    ...buildTables(),
    ai_credit_plan_allocations: [
      { tier: 'FREE', is_active: true, markup_multiplier: 2 },
    ],
  };
  h.db = fakeDb(tables);
  return tables;
}
const call = () =>
  finalizeMeetAi(
    new Request('https://meet.example/api/meet-ai/finalize', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer()}` },
      body: '{}',
    })
  );
const providerCalls = () => h.generateText.mock.calls.length;

beforeEach(() => {
  h.keys.clear();
  h.generateText.mockReset();
  h.settle.mockReset();
  h.settle.mockResolvedValue(undefined);
  h.begin.mockReset();
  h.begin.mockImplementation(async (input: { idempotencyKey: string }) => {
    if (h.keys.has(input.idempotencyKey))
      throw new AiStudioError('This request is already running or completed.', {
        code: 'invalid_request_error',
        status: 409,
      });
    h.keys.add(input.idempotencyKey);
    return { runId: `run-${h.keys.size}`, reservationId: 'reservation' };
  });
  vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', 'finalize-test-secret');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-key');
});

describe('finalizer through the real billing wrapper', () => {
  it('a provider timeout is an unknown outcome: exactly one provider call, never retried unattended', async () => {
    const tables = setup();
    h.generateText.mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      })
    );
    expect(await call()).toEqual({ status: 'abandoned' });
    expect(await call()).toEqual({ status: 'abandoned' });
    expect(await call()).toEqual({ status: 'abandoned' });
    expect(providerCalls()).toBe(1);
    // One run under one identity; the reservation was released at zero credits.
    expect(h.keys).toEqual(new Set([`${sessionId}:g0`]));
    expect(h.settle).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', actualCredits: 0 })
    );
    expect(tables.meet_ai_sessions[0]).toMatchObject({
      notes_unpriced_attempts: 0,
    });
    expect(tables.meet_ai_sessions[0]?.notes_status).not.toBe('completed');
  });

  it('an output validation error after generation is an unknown outcome too', async () => {
    const tables = setup();
    h.generateText.mockResolvedValue({
      text: 'x',
      output: { summary: 42 },
      providerMetadata: { google: { usageMetadata: {} } },
    });
    expect(await call()).toEqual({ status: 'abandoned' });
    expect(await call()).toEqual({ status: 'abandoned' });
    expect(providerCalls()).toBe(1);
    expect(tables.meet_ai_sessions[0]).toMatchObject({
      notes_unpriced_attempts: 0,
    });
  });

  it('a network error after the request was sent is an unknown outcome', async () => {
    setup();
    h.generateText.mockRejectedValue(new Error('fetch failed'));
    expect(await call()).toEqual({ status: 'abandoned' });
    expect(await call()).toEqual({ status: 'abandoned' });
    expect(providerCalls()).toBe(1);
  });

  it('only an explicit provider rejection with no output rotates the identity', async () => {
    const tables = setup();
    h.generateText.mockRejectedValue(
      new APICallError({
        message: 'Quota exceeded',
        url: 'https://provider.invalid',
        requestBodyValues: {},
        statusCode: 429,
      })
    );
    await expect(call()).rejects.toMatchObject({ status: 502 });
    expect(tables.meet_ai_sessions[0]).toMatchObject({
      notes_unpriced_attempts: 1,
    });
    await expect(call()).rejects.toMatchObject({ status: 502 });
    // A definitive refusal is retried under a new identity, within the cap.
    expect(providerCalls()).toBe(2);
    expect(h.keys).toEqual(new Set([`${sessionId}:g0`, `${sessionId}:g1`]));
  });
});
