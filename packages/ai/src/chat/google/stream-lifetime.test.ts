import { streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  deductAiCredits: vi.fn(),
}));

vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  deductAiCredits: (...args: Parameters<typeof mocks.deductAiCredits>) =>
    mocks.deductAiCredits(...args),
}));

import { persistAssistantResponse } from './stream-finish-persistence';
import { createPersistingSseStreamConsumer } from './stream-lifetime';

type LanguageModelV3StreamPart =
  Awaited<
    ReturnType<MockLanguageModelV3['doStream']>
  >['stream'] extends ReadableStream<infer Part>
    ? Part
    : never;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function modelStream(parts: LanguageModelV3StreamPart[], close = true) {
  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      if (close) controller.close();
    },
  });
}

function mockModel(parts: LanguageModelV3StreamPart[], close = true) {
  return new MockLanguageModelV3({
    doStream: async () => ({ stream: modelStream(parts, close) }),
  });
}

const completedParts: LanguageModelV3StreamPart[] = [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'Answer' },
  { type: 'text-end', id: 't1' },
  {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
  },
];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function registeredWork(register: ReturnType<typeof vi.fn>) {
  const work = register.mock.calls[0]?.[0];
  if (!(work instanceof Promise)) throw new Error('No work was registered.');
  return work as Promise<void>;
}

function fakeAdmin() {
  const insert = vi.fn().mockReturnValue({
    select: () => ({
      single: async () => ({ data: { id: 'assistant-message' }, error: null }),
    }),
  });
  return { insert, sbAdmin: { from: vi.fn().mockReturnValue({ insert }) } };
}

describe('createPersistingSseStreamConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deductAiCredits.mockResolvedValue({
      creditsDeducted: 1,
      remainingCredits: 99,
      success: true,
    });
  });

  it('registers stream consumption with next/server after() by default', async () => {
    const consume = createPersistingSseStreamConsumer();
    const work = consume({ stream: modelStream([]) });

    expect(mocks.after).toHaveBeenCalledWith(work);
    await work;
  });

  it('writes one assistant message and one credit deduction when the client disconnects mid-stream', async () => {
    const register = vi.fn();
    const { insert, sbAdmin } = fakeAdmin();
    const result = streamText({
      model: mockModel(completedParts),
      prompt: 'Hello',
      onFinish: (response) =>
        persistAssistantResponse({
          chatId: 'chat',
          effectiveSource: 'Rewise',
          model: 'google/gemini-3-flash',
          response,
          sbAdmin,
          userId: 'user',
          wsId: 'workspace',
        }).then(() => undefined),
    });

    const response = result.toUIMessageStreamResponse({
      consumeSseStream: createPersistingSseStreamConsumer(register),
    });
    await response.body?.cancel();

    expect(register).toHaveBeenCalledTimes(1);
    await registeredWork(register);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(mocks.deductAiCredits).toHaveBeenCalledTimes(1);
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: 'workspace' })
    );
  });

  it('keeps the registered work pending until onFinish persistence settles', async () => {
    const register = vi.fn();
    const gate = deferred();
    const persist = vi.fn(() => gate.promise);
    const result = streamText({
      model: mockModel(completedParts),
      prompt: 'Hello',
      onFinish: persist,
    });

    result.toUIMessageStreamResponse({
      consumeSseStream: createPersistingSseStreamConsumer(register),
    });
    let settled = false;
    const work = registeredWork(register).then(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    gate.resolve();
    await work;
    expect(settled).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('awaits onAbort persistence when the request aborts mid-stream', async () => {
    const register = vi.fn();
    const abort = new AbortController();
    const gate = deferred();
    const onAbort = vi.fn(() => gate.promise);
    const onFinish = vi.fn();
    const result = streamText({
      abortSignal: abort.signal,
      model: mockModel(completedParts.slice(0, 3), false),
      prompt: 'Hello',
      onAbort,
      onFinish,
    });

    const response = result.toUIMessageStreamResponse({
      consumeSseStream: createPersistingSseStreamConsumer(register),
    });
    const reader = response.body?.getReader();
    await reader?.read();
    abort.abort();
    await reader?.cancel();

    let settled = false;
    const work = registeredWork(register).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(onAbort).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    gate.resolve();
    await work;
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('still consumes the stream when no request scope can register it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const persist = vi.fn();
    const result = streamText({
      model: mockModel(completedParts),
      prompt: 'Hello',
      onFinish: persist,
    });
    let work: Promise<void> | undefined;
    const consume = createPersistingSseStreamConsumer(() => {
      throw new Error('outside request scope');
    });

    result.toUIMessageStreamResponse({
      consumeSseStream: (options) => {
        work = consume(options);
      },
    });
    await work;

    expect(persist).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
