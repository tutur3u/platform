// @vitest-environment node
import { DefaultChatTransport } from '@tuturuuu/ai/core';
import { AI_TEMP_AUTH_HEADER } from '@tuturuuu/utils/ai-temp-auth-constants';
import { describe, expect, it, vi } from 'vitest';
import { createMiraRequestPreparer } from '../mira-chat-transport';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('real SDK transport request identity', () => {
  it.each([true, false])(
    'keeps endpoint and auth bound to a deferred request snapshot: subscription=%s',
    async (subscription) => {
      const original = {
        model: subscription
          ? 'chatgpt/oaiapp_synthetic/account-model'
          : 'google/model',
        wsId: 'original-workspace',
        creditWsId: 'original-credit-workspace',
        creditSource: 'workspace' as const,
      };
      let composer = original;
      const bodyGate = deferred();
      const headersGate = deferred();
      const headersEntered = deferred();
      const resolveAuth = vi.fn(async () => ({
        [AI_TEMP_AUTH_HEADER]: 'synthetic-scoped-header',
      }));
      const fetchMock = vi.fn(
        async () =>
          new Response(
            'data: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
            { headers: { 'content-type': 'text/event-stream' } }
          )
      );
      const transport = new DefaultChatTransport({
        body: async () => {
          const snapshot = { ...composer };
          await bodyGate.promise;
          return snapshot;
        },
        headers: async () => {
          headersEntered.release();
          await headersGate.promise;
          return { [AI_TEMP_AUTH_HEADER]: 'synthetic-stale-header' };
        },
        prepareSendMessagesRequest: createMiraRequestPreparer(resolveAuth),
        fetch: fetchMock,
      });
      const sending = transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'synthetic-chat',
        messageId: undefined,
        abortSignal: undefined,
        messages: [
          {
            id: 'message',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello' }],
          },
        ],
        body: { ...original },
      });
      composer = {
        ...original,
        model: subscription
          ? 'google/model'
          : 'chatgpt/oaiapp_other/other-model',
        wsId: 'changed-workspace',
      };
      bodyGate.release();
      await headersEntered.promise;
      headersGate.release();
      const stream = await sending;
      for await (const _chunk of stream) {
        /* Consume the real decoder too. */
      }
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(subscription ? '/api/ai/chatgpt' : '/api/ai/chat');
      expect(JSON.parse(String(init.body))).toMatchObject(original);
      const headers = new Headers(init.headers);
      if (subscription) {
        expect(resolveAuth).not.toHaveBeenCalled();
        expect(headers.has(AI_TEMP_AUTH_HEADER)).toBe(false);
      } else {
        expect(resolveAuth).toHaveBeenCalledWith({
          wsId: original.wsId,
          creditWsId: original.creditWsId,
          creditSource: original.creditSource,
        });
        expect(headers.get(AI_TEMP_AUTH_HEADER)).toBe(
          'synthetic-scoped-header'
        );
      }
    }
  );
});
