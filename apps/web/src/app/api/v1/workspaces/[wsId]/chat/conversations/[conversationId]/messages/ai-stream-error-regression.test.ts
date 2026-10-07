// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  assistantMessage,
  createRequest,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

const requestId = '11111111-1111-4111-8111-111111111111';
const safeError = 'AI response unavailable';

function sse() {
  return new Response(
    `${[
      { type: 'text-delta', delta: 'Synthetic partial response' },
      { type: 'error', errorText: safeError },
    ]
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
      .join('')}data: [DONE]\n\n`,
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
}

function message(kind: 'user' | 'assistant') {
  return {
    ...(kind === 'user' ? userMessage : assistantMessage),
    metadata: { metadata: { requestId }, source: 'ai-chat' },
  };
}

function prepareAiConversation() {
  mocks.isAiChatConversationId.mockReturnValue(true);
  mocks.getAiChatId.mockReturnValue('ai-chat-1');
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: { id: 'ai-chat-1', model: 'gemini-3-flash', title: 'Existing' },
      error: null,
    })),
    select: vi.fn(() => query),
  };
  mocks.auth.supabase = { from: vi.fn(() => query) };
  mocks.createAiChatPost.mockReturnValue(async (request: Request) => {
    mocks.aiRouteBodies.push(await request.json());
    return sse();
  });
}

async function send(stream = true) {
  const { POST } = await import('./route');
  const request = createRequest({ miraMode: true });
  if (stream) request.headers.set('Accept', 'application/x-ndjson');
  const response = await POST(request as never, {
    params: Promise.resolve({
      conversationId: 'conversation-1',
      wsId: 'workspace-1',
    }),
  });
  const events = (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { response, events };
}

describe('AI stream error and canonical persistence receipts', () => {
  beforeEach(() => {
    resetMessageRouteMocks();
    prepareAiConversation();
  });

  it('does not discard a valid upstream error after real text deltas', async () => {
    const { consumeAiResponseTextDeltas } = await import('./ai-message-shared');
    const deltas: string[] = [];
    await expect(
      consumeAiResponseTextDeltas(sse(), (delta) => deltas.push(delta))
    ).rejects.toThrow(safeError);
    expect(deltas).toEqual(['Synthetic partial response']);
  });

  it('reports the upstream failure instead of claiming a save failure when no assistant was saved', async () => {
    mocks.listAiChatMessages.mockImplementation(async () =>
      mocks.aiRouteBodies.length > 0 ? [message('user')] : []
    );
    const { response, events } = await send();
    expect(response.status).toBe(201);
    expect(events).toContainEqual({ type: 'error', message: safeError });
    expect(events).not.toContainEqual({
      type: 'error',
      message: 'AI response was not saved',
    });
    expect(events.filter((event) => event.type === 'assistant_delta')).toEqual([
      { type: 'assistant_delta', delta: 'Synthetic partial response' },
    ]);
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(mocks.createAiChatPost).toHaveBeenCalledTimes(1);
    expect(mocks.aiRouteBodies).toHaveLength(1);
    expect(mocks.aiRouteBodies[0]).toMatchObject({
      persistenceRequestId: requestId,
    });
  });

  it('returns an authoritative persisted partial reply without retrying generation', async () => {
    mocks.listAiChatMessages.mockImplementation(async () =>
      mocks.aiRouteBodies.length > 0
        ? [message('user'), message('assistant')]
        : []
    );
    const { events } = await send();
    expect(events).toContainEqual({
      type: 'messages',
      messages: [message('user'), message('assistant')],
    });
    expect(events.some((event) => event.type === 'error')).toBe(false);
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(mocks.createAiChatPost).toHaveBeenCalledTimes(1);
    expect(mocks.aiRouteBodies).toHaveLength(1);
  });

  it('keeps failed readback distinct from a missing assistant and never regenerates', async () => {
    mocks.listAiChatMessages.mockImplementation(async () => {
      if (mocks.aiRouteBodies.length > 0)
        throw new Error('Synthetic readback failure');
      return [];
    });
    const { events } = await send();
    expect(events).toContainEqual({
      type: 'error',
      message: 'Failed to send AI chat message',
    });
    expect(events).not.toContainEqual({
      type: 'error',
      message: 'AI response was not saved',
    });
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(mocks.createAiChatPost).toHaveBeenCalledTimes(1);
    expect(mocks.aiRouteBodies).toHaveLength(1);
  });

  it('replays the saved request without calling generation again', async () => {
    mocks.listAiChatMessages.mockResolvedValue([
      message('user'),
      message('assistant'),
    ]);
    const { response, events } = await send();
    expect(response.status).toBe(200);
    expect(events).toEqual([
      { type: 'messages', messages: [message('user'), message('assistant')] },
      { type: 'done' },
    ]);
    expect(mocks.createAiChatPost).not.toHaveBeenCalled();
    expect(mocks.aiRouteBodies).toHaveLength(0);
    expect(mocks.listAiChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({ requestId })
    );
  });

  it.each([
    'Synthetic credential=fixture-token https://provider.invalid/private model=fixture-model',
    { nested: 'Synthetic private diagnostic' },
    null,
    42,
  ])('sanitizes an untrusted SSE error payload %j', async (errorText) => {
    const { consumeAiResponseTextDeltas } = await import('./ai-message-shared');
    const { AiStreamError } = await import('./ai-stream-error');
    const response = new Response(
      `data: ${JSON.stringify({ type: 'error', errorText })}\n\n`
    );
    await expect(consumeAiResponseTextDeltas(response)).rejects.toMatchObject({
      name: 'AiStreamError',
      code: 'ai_response_unavailable',
      message: safeError,
    });
    expect(new AiStreamError().message).toBe(safeError);
  });

  it('drains fragmented chunks and ignores malformed records before reporting a sanitized error', async () => {
    const { consumeAiResponseTextDeltas } = await import('./ai-message-shared');
    let drained = false;
    const encoder = new TextEncoder();
    const chunks = [
      'data: {broken}\n\ndata: null\n\ndata: []\n\n',
      'data: {"type":"err',
      'or","errorText":"Synthetic diagnostic"}\r\n\r\n',
      'data: {"type":"text-delta","delta":"saved tail"}\n\n',
      'data: [DONE]\n\n',
    ];
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          const chunk = chunks.shift();
          if (chunk !== undefined) controller.enqueue(encoder.encode(chunk));
          else {
            drained = true;
            controller.close();
          }
        },
      })
    );
    const deltas: string[] = [];
    await expect(
      consumeAiResponseTextDeltas(response, (delta) => deltas.push(delta))
    ).rejects.toThrow(safeError);
    expect(deltas).toEqual(['saved tail']);
    expect(drained).toBe(true);
    expect(response.body?.locked).toBe(false);
  });

  it('never returns or logs upstream diagnostics through the canonical adapter', async () => {
    const privateText =
      'Synthetic credential=fixture-token https://provider.invalid/private model=fixture-model';
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.createAiChatPost.mockReturnValue(async (request: Request) => {
        mocks.aiRouteBodies.push(await request.json());
        return new Response(
          `data: ${JSON.stringify({ type: 'error', errorText: privateText })}\n\n`
        );
      });
      mocks.listAiChatMessages.mockResolvedValue([]);
      const { events } = await send();
      expect(events).toContainEqual({ type: 'error', message: safeError });
      expect(JSON.stringify(events)).not.toContain(privateText);
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
      expect(mocks.aiRouteBodies).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  it('sanitizes a non-success upstream body without returning diagnostics', async () => {
    mocks.createAiChatPost.mockReturnValue(
      async () =>
        new Response('Synthetic private provider diagnostic', { status: 502 })
    );
    const { response, events } = await send();
    expect(response.status).toBe(502);
    expect(events).toEqual([{ message: safeError }]);
    expect(mocks.createAiChatPost).toHaveBeenCalledTimes(1);
  });

  it('retains the missing-save warning when no upstream error occurred', async () => {
    mocks.createAiChatPost.mockReturnValue(
      async () => new Response('data: [DONE]\n\n')
    );
    mocks.listAiChatMessages.mockResolvedValue([]);
    const { events } = await send();
    expect(events).toContainEqual({
      type: 'error',
      message: 'AI response was not saved',
    });
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('reports the same sanitized failure for a non-streaming request', async () => {
    mocks.listAiChatMessages.mockResolvedValue([]);
    const { response, events } = await send(false);
    expect(response.status).toBe(500);
    expect(events).toEqual([{ message: safeError }]);
    expect(mocks.aiRouteBodies).toHaveLength(1);
  });

  it('keeps a persisted partial reply authoritative for a non-streaming request', async () => {
    mocks.listAiChatMessages.mockImplementation(async () =>
      mocks.aiRouteBodies.length ? [message('user'), message('assistant')] : []
    );
    const { response, events } = await send(false);
    expect(response.status).toBe(201);
    expect(events).toEqual([
      {
        message: message('assistant'),
        messages: [message('user'), message('assistant')],
      },
    ]);
    expect(mocks.aiRouteBodies).toHaveLength(1);
  });
});
