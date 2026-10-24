// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assistantAiRow,
  assistantMessage,
  conversation,
  createRequest,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

describe('native AI interrupted stream persistence', () => {
  beforeEach(resetMessageRouteMocks);

  function prepare() {
    let saved = false;
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent')
        return { message: userMessage, replayed: false };
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages')
        return saved ? [userMessage, assistantMessage] : [userMessage];
      if (name === 'chat_persist_ai_message_batch_idempotent') {
        saved = true;
        return { messages: [assistantMessage], replayed: false };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
  }

  async function send() {
    const { POST } = await import('./route');
    const request = createRequest({ miraMode: true });
    request.headers.set('accept', 'application/x-ndjson');
    return POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });
  }

  it.each([true, false])(
    'SSE error with saved shadow=%s uses durable readback',
    async (savedShadow) => {
      prepare();
      mocks.createAiChatPost.mockReturnValue(async (request: Request) => {
        mocks.aiRouteBodies.push(await request.json());
        if (!savedShadow) assistantAiRow.metadata = { requestId: 'other-turn' };
        return new Response(
          'data: {"type":"text-delta","delta":"hi there"}\n\n' +
            'data: {"type":"error","errorText":"provider failed"}\n\n' +
            'data: [DONE]\n\n'
        );
      });
      const events = (await (await send()).text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(events.some((event) => event.type === 'messages')).toBe(
        savedShadow
      );
      expect(events.some((event) => event.type === 'error')).toBe(!savedShadow);
      expect(events.at(-1)).toEqual({ type: 'done' });
      const writes = mocks.callPrivateChatRpc.mock.calls.filter(
        ([name]) => name === 'chat_persist_ai_message_batch_idempotent'
      );
      expect(writes).toHaveLength(savedShadow ? 1 : 0);
      if (savedShadow) {
        expect(writes[0]?.[1]).toMatchObject({
          p_actor_user_id: 'user-1',
          p_ws_id: 'workspace-1',
          p_request_id: 'message-1',
        });
        const replay = await (await send()).text();
        expect(replay).toContain('message-2');
        expect(mocks.aiRouteBodies).toHaveLength(1);
      }
    }
  );

  it('reader cancellation during a reply does not cancel the authoritative write', async () => {
    prepare();
    const release = Promise.withResolvers<void>();
    const written = Promise.withResolvers<void>();
    const original = mocks.callPrivateChatRpc.getMockImplementation();
    mocks.callPrivateChatRpc.mockImplementation(
      async (name: string, args: unknown) => {
        const result = await original?.(name, args);
        if (name === 'chat_persist_ai_message_batch_idempotent')
          written.resolve();
        return result;
      }
    );
    mocks.createAiChatPost.mockReturnValue(async (request: Request) => {
      mocks.aiRouteBodies.push(await request.json());
      return new Response(
        new ReadableStream({
          async start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"text-delta","delta":"hi"}\n\n'
              )
            );
            await release.promise;
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        })
      );
    });
    const response = await send();
    const reader = response.body!.getReader();
    await reader.read();
    await reader.read();
    await reader.cancel();
    release.resolve();
    await written.promise;
    // Wait for the full start callback to settle, including cleanup/close.
    await vi.waitFor(() =>
      expect(mocks.publishChatRealtimeEvent).toHaveBeenCalled()
    );
    expect(await (await send()).text()).toContain('message-2');
    expect(mocks.aiRouteBodies).toHaveLength(1);
  });
});
