import { DefaultChatTransport, type UIMessageChunk } from '@tuturuuu/ai/core';
import { describe, expect, it, vi } from 'vitest';
import { MAX_RESPONSE_LENGTH } from './review';
import { createWorkspaceReview } from './workspace-review';

const request = { text: 'teh', subject: 'writing' as const, locale: 'en' };
const response = JSON.stringify([
  {
    start: 0,
    end: 3,
    original: 'teh',
    replacement: 'the',
    explanation: 'Spelling',
  },
]);

function fixture(
  text: string,
  tail: UIMessageChunk[] = [{ type: 'finish', finishReason: 'stop' }]
) {
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'response' },
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: text },
    { type: 'text-end', id: 'text' },
    ...tail,
  ];
  const cancel = vi.fn();
  const sendMessages = vi.fn(
    async () =>
      new ReadableStream<UIMessageChunk>({
        pull(controller) {
          const chunk = chunks.shift();
          if (chunk) controller.enqueue(chunk);
          else controller.close();
        },
        cancel,
      })
  );
  const provider = createWorkspaceReview({
    workspaceId: 'workspace',
    chatId: 'owned-chat',
    transport: { sendMessages },
  });
  return { provider, sendMessages, cancel };
}

describe('existing workspace AI transport', () => {
  it('uses the approved path, workspace credits and server-selected model', async () => {
    const spy = vi
      .spyOn(DefaultChatTransport.prototype, 'sendMessages')
      .mockRejectedValue(new Error('fixture'));
    try {
      const provider = createWorkspaceReview({
        workspaceId: 'workspace',
        chatId: 'owned-chat',
      });
      await expect(
        provider(request, new AbortController().signal, vi.fn())
      ).rejects.toThrow();
      const transport = spy.mock.instances[0];
      expect(transport).toMatchObject({
        api: '/api/ai/chat',
        body: { wsId: 'workspace', creditSource: 'workspace' },
        credentials: 'include',
      });
      expect(transport).not.toHaveProperty('body.model');
    } finally {
      spy.mockRestore();
    }
  });

  it('streams preview and returns validated edits on completion', async () => {
    const { provider, sendMessages } = fixture(response);
    const preview = vi.fn();
    const controller = new AbortController();
    expect(await provider(request, controller.signal, preview)).toHaveLength(1);
    expect(preview).toHaveBeenCalledWith(response);
    expect(sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'owned-chat',
        abortSignal: controller.signal,
        trigger: 'submit-message',
      })
    );
  });

  it.each([
    ['truncated', []],
    ['token limit', [{ type: 'finish', finishReason: 'length' }]],
    ['abort', [{ type: 'abort' }]],
    ['provider error', [{ type: 'error', errorText: 'private diagnostic' }]],
  ] as const)('rejects %s even after valid-looking JSON', async (_, tail) => {
    const { provider } = fixture(response, [...tail]);
    await expect(
      provider(request, new AbortController().signal, vi.fn())
    ).rejects.toThrow();
  });

  it('rejects malformed and oversized output and cancels the upstream reader', async () => {
    for (const raw of ['[', 'x'.repeat(MAX_RESPONSE_LENGTH + 1)]) {
      const { provider } = fixture(raw);
      await expect(
        provider(request, new AbortController().signal, vi.fn())
      ).rejects.toThrow();
    }
  });

  it('never accepts results after cancellation', async () => {
    const { provider } = fixture(response);
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider(request, controller.signal, vi.fn())
    ).rejects.toThrow();
  });
});
