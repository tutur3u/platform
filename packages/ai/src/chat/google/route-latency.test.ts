import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { smoothStream } from 'ai';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const CHAT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE = 'Synthetic latency probe';

const mocks = vi.hoisted(() => ({
  authorizeAiWorkspace: vi.fn(),
  beginPersistence: vi.fn(),
  creditPreflight: vi.fn(),
  moveTempFilesToThread: vi.fn(),
  persistUserMessage: vi.fn(),
  prepareMiraRuntime: vi.fn(),
  resolveChatIdForUser: vi.fn(),
  resolvePlanModel: vi.fn(),
  streamText: vi.fn(),
  withAiMemory: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('../../memory', () => ({ withAiMemory: mocks.withAiMemory }));
vi.mock('../../credits/resolve-plan-model', () => ({
  resolvePlanModel: mocks.resolvePlanModel,
  PlanModelResolutionError: class PlanModelResolutionError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'PlanModelResolutionError';
      this.code = code;
    }
  },
}));
vi.mock('./route-credits', () => ({
  performCreditPreflight: mocks.creditPreflight,
}));
vi.mock('./route-auth', () => ({
  authorizeAiWorkspace: mocks.authorizeAiWorkspace,
  resolveAiRouteAuth: vi.fn(),
  isInternalTuturuuuAiUser: vi.fn(),
}));
vi.mock('./route-chat-resolution', () => ({
  resolveChatIdForUser: mocks.resolveChatIdForUser,
  moveTempFilesToThread: mocks.moveTempFilesToThread,
}));
vi.mock('./route-message-preparation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./route-message-preparation')>()),
  prepareProcessedMessages: async () => ({
    processedMessages: [{ role: 'user', content: MESSAGE }],
  }),
  persistLatestUserMessage: mocks.persistUserMessage,
  extractLatestUserMessageContent: () => MESSAGE,
}));
vi.mock('./route-mira-runtime', () => ({
  prepareMiraRuntime: mocks.prepareMiraRuntime,
}));
vi.mock('./request-persistence-lease', () => ({
  beginAiPersistenceRequest: mocks.beginPersistence,
  createAiPersistenceFinisher: () => vi.fn(),
  releaseAiPersistenceRequest: vi.fn(),
}));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: mocks.streamText,
}));

import { PlanModelResolutionError } from '../../credits/resolve-plan-model';
import { createPOST } from './route';

function fundedRequest(
  resolveAuth: (
    request: NextRequest
  ) => Promise<
    | { ok: true; supabase: object; user: { id: string } }
    | { ok: false; response: Response }
  > = async () => ({
    ok: true,
    supabase: {},
    user: { id: USER_ID },
  })
) {
  const handler = createPOST({ resolveAuth: resolveAuth as never });
  return handler(
    new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        id: CHAT_ID,
        model: 'gemini-2.5-flash',
        wsId: WS_ID,
        messages: [{ role: 'user', parts: [{ type: 'text', text: MESSAGE }] }],
      }),
    }) as NextRequest
  );
}

async function readChunkWithin(
  stream: TransformStream<unknown, { text?: string; type?: string }>,
  text: string,
  timeoutMs: number
) {
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();
  const pending = reader.read();
  await writer.write({ type: 'text-delta', id: 'text-1', text });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending.then((chunk) => ({ timedOut: false as const, chunk })),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => undefined);
    await writer.abort().catch(() => undefined);
  }
}

describe('mira server first-byte route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAiWorkspace.mockResolvedValue({ ok: true, wsId: WS_ID });
    mocks.resolveChatIdForUser.mockResolvedValue({ chatId: CHAT_ID });
    mocks.resolvePlanModel.mockResolvedValue({
      modelId: 'google/gemini-2.5-flash',
    });
    mocks.moveTempFilesToThread.mockResolvedValue(null);
    mocks.persistUserMessage.mockResolvedValue(null);
    mocks.creditPreflight.mockResolvedValue({ cappedMaxOutput: 64 });
    mocks.prepareMiraRuntime.mockResolvedValue({ miraTools: undefined });
    mocks.withAiMemory.mockResolvedValue({ modelId: 'memory-model' });
    mocks.beginPersistence.mockResolvedValue({ lease: null, response: null });
    mocks.streamText.mockReturnValue({
      toUIMessageStreamResponse: () => new Response('stream'),
    });
  });

  it('resolves the owned chat and the plan together, then keeps the same stream inputs', async () => {
    let releasePlan: ((value: { modelId: string }) => void) | undefined;
    let releaseChat: ((value: { chatId: string }) => void) | undefined;
    mocks.resolvePlanModel.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePlan = resolve;
        })
    );
    mocks.resolveChatIdForUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseChat = resolve;
        })
    );

    const pending = fundedRequest();
    await vi.waitFor(() => {
      expect(releasePlan).toEqual(expect.any(Function));
      expect(releaseChat).toEqual(expect.any(Function));
    });
    expect(mocks.creditPreflight).not.toHaveBeenCalled();
    expect(mocks.moveTempFilesToThread).not.toHaveBeenCalled();
    expect(mocks.persistUserMessage).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();

    releasePlan?.({ modelId: 'google/gemini-2.5-flash' });
    releaseChat?.({ chatId: CHAT_ID });
    const response = await pending;

    expect(response.status).toBe(200);
    expect(mocks.resolvePlanModel).toHaveBeenCalledWith({
      capability: 'language',
      requestedModel: 'gemini-2.5-flash',
      wsId: WS_ID,
    });
    expect(mocks.resolveChatIdForUser).toHaveBeenCalledWith(
      CHAT_ID,
      expect.any(Function),
      expect.any(Function)
    );
    expect(mocks.withAiMemory).toHaveBeenCalledWith(
      expect.objectContaining({ customId: CHAT_ID, userId: USER_ID })
    );
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 64,
        messages: [{ role: 'user', content: MESSAGE }],
      })
    );
  });

  it('still prefers a plan failure over a foreign chat', async () => {
    mocks.resolvePlanModel.mockRejectedValue(
      new PlanModelResolutionError('NO_ALLOCATION', 'No allocation')
    );
    mocks.resolveChatIdForUser.mockResolvedValue({
      error: new Response('Chat not found', { status: 404 }),
    });

    const response = await fundedRequest();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'NO_ALLOCATION' });
    expect(mocks.creditPreflight).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.moveTempFilesToThread).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request before scope or credits', async () => {
    const response = await fundedRequest(async () => ({
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    }));
    expect(response.status).toBe(401);
    expect(mocks.authorizeAiWorkspace).not.toHaveBeenCalled();
    expect(mocks.resolveChatIdForUser).not.toHaveBeenCalled();
    expect(mocks.resolvePlanModel).not.toHaveBeenCalled();
    expect(mocks.creditPreflight).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rejects a non-member before plan, chat, or credit reads', async () => {
    mocks.authorizeAiWorkspace.mockResolvedValue({
      ok: false,
      response: Response.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });

    const response = await fundedRequest();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Workspace access denied' });
    expect(mocks.resolvePlanModel).not.toHaveBeenCalled();
    expect(mocks.resolveChatIdForUser).not.toHaveBeenCalled();
    expect(mocks.creditPreflight).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rejects a request with no credits before the model starts', async () => {
    mocks.creditPreflight.mockResolvedValue({
      error: Response.json(
        { error: 'AI credits insufficient', code: 'INSUFFICIENT_CREDITS' },
        { status: 403 }
      ),
    });

    const response = await fundedRequest();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
    });
    expect(mocks.prepareMiraRuntime).not.toHaveBeenCalled();
    expect(mocks.withAiMemory).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rejects a foreign chat before writes or the model', async () => {
    mocks.resolveChatIdForUser.mockResolvedValue({
      error: new Response('Chat not found', { status: 404 }),
    });

    const response = await fundedRequest();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Chat not found');
    expect(mocks.moveTempFilesToThread).not.toHaveBeenCalled();
    expect(mocks.persistUserMessage).not.toHaveBeenCalled();
    expect(mocks.creditPreflight).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('puts only stage durations on the streamed response', async () => {
    const response = await fundedRequest();
    const timing = response.headers.get('Server-Timing');

    expect(response.status).toBe(200);
    expect(timing).toMatch(
      /^auth;dur=\d+\.\d, scope;dur=\d+\.\d, credits;dur=\d+\.\d, history;dur=\d+\.\d, context;dur=\d+\.\d, model-start;dur=\d+\.\d$/
    );
    expect(timing).not.toContain(USER_ID);
    expect(timing).not.toContain(WS_ID);
    expect(timing).not.toContain(CHAT_ID);
    expect(timing).not.toContain(MESSAGE);
    expect(timing).not.toContain('gemini');
    expect(await response.text()).toBe('stream');
  });

  it('emits the first text chunk without waiting on a word or delay buffer', async () => {
    await fundedRequest();
    const transform =
      mocks.streamText.mock.calls[0]?.[0].experimental_transform;
    expect(typeof transform).toBe('function');

    const buffered = await readChunkWithin(
      smoothStream({ delayInMs: null })({ tools: {} }),
      'Hel',
      40
    );
    expect(buffered.timedOut).toBe(true);

    const immediate = await readChunkWithin(
      transform({ tools: {} }),
      'Hel',
      40
    );
    expect(immediate.timedOut).toBe(false);
    if (!immediate.timedOut) {
      expect(immediate.chunk.value).toMatchObject({
        type: 'text-delta',
        text: 'Hel',
      });
    }
  });
});
