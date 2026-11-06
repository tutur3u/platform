import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  conversation,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

const first = vi.hoisted(() => ({ admit: vi.fn(), stream: vi.fn() }));
vi.mock('@/lib/chat/initial-ai-settings', async (original) => ({
  ...(await original<typeof import('@/lib/chat/initial-ai-settings')>()),
  admitInitialAiSettings: (...args: unknown[]) => first.admit(...args),
}));
vi.mock('./native-ai-message', () => ({
  streamNativeAiConversationResponse: (...args: unknown[]) =>
    first.stream(...args),
  sendNativeAiConversationMessages: vi.fn(),
}));

import { POST } from './route';

const actor = 'a6742000-0000-4000-8000-000000000001';
const ws = 'a6742000-0000-4000-8000-000000000011';
const id = 'a6742000-0000-4000-8000-000000000021';
const key = 'a6742000-0000-4000-8000-000000000031';
const settings = {
  modelId: 'google/test',
  creditSource: 'workspace',
  creditWsId: null,
  thinkingMode: 'fast',
};
function result() {
  return {
    conversation: { ...conversation, id, wsId: ws, createdBy: actor },
    creationReceipt: {
      id,
      wsId: ws,
      createdBy: actor,
      type: 'ai',
      createdAt: '2026-10-25T14:00:00.000Z',
      creationRequestId: key,
      initialAiSettings: {
        ...settings,
        actorUserId: actor,
        wsId: ws,
        conversationId: id,
      },
    },
    message: {
      ...userMessage,
      conversationId: id,
      senderId: actor,
      metadata: { clientRequestId: key },
    },
    replayed: false,
  };
}
function post(
  extra: Record<string, unknown> = {},
  accept = 'application/x-ndjson'
) {
  return POST(
    new Request(
      `http://localhost/api/v1/workspaces/${ws}/chat/conversations/${id}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept },
        body: JSON.stringify({
          content: 'hello',
          clientRequestId: key,
          initialConversation: settings,
          ...extra,
        }),
      }
    ) as NextRequest,
    { params: Promise.resolve({ wsId: ws, conversationId: id }) }
  );
}
beforeEach(() => {
  resetMessageRouteMocks();
  mocks.auth.user.id = actor;
  mocks.resolveChatRouteContext.mockResolvedValue({
    ok: true,
    context: { normalizedWsId: ws },
  });
  first.admit.mockResolvedValue({ ok: true, settings });
  first.stream.mockImplementation(
    () =>
      new Response('{"type":"done"}\n', {
        headers: { 'content-type': 'application/x-ndjson' },
      })
  );
  mocks.callPrivateChatRpc.mockResolvedValue(result());
  mocks.publishChatRealtimeEvent.mockResolvedValue(undefined);
});
describe('atomic native first-message route', () => {
  it('creates and persists once, bound to server actor/workspace, before streaming', async () => {
    const response = await post({ actorUserId: 'attacker', wsId: 'attacker' });
    expect(response.status).toBe(200);
    expect(mocks.resolveChatRouteContext).toHaveBeenCalledWith(
      expect.objectContaining({ auth: mocks.auth, wsId: ws })
    );
    expect(first.admit).toHaveBeenCalledWith({
      actorUserId: actor,
      input: settings,
      wsId: ws,
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledExactlyOnceWith(
      'chat_create_ai_first_message',
      {
        p_ws_id: ws,
        p_actor_user_id: actor,
        p_content: 'hello',
        p_input: {
          id,
          creationRequestId: key,
          type: 'ai',
          title: 'hello',
          modelId: settings.modelId,
          initialAiSettings: settings,
        },
      }
    );
    const header = response.headers.get('x-mira-chat-creation');
    expect(header).not.toBeNull();
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      conversation: result().creationReceipt,
      creationRequestId: key,
    });
    expect(first.stream).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        userMessage: result().message,
        initialSettings: {
          model_id: 'google/test',
          credit_source: 'workspace',
          credit_ws_id: null,
          thinking_mode: 'fast',
          system_prompt: null,
        },
      })
    );
  });
  it('rejects missing workspace membership before any model read or write', async () => {
    mocks.resolveChatRouteContext.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 403 }),
    });
    expect((await post()).status).toBe(403);
    expect(first.admit).not.toHaveBeenCalled();
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    expect(first.stream).not.toHaveBeenCalled();
  });
  it.each([403, 422])(
    'preserves credit/model admission denial %s before creation',
    async (status) => {
      first.admit.mockResolvedValue({ ok: false, status, message: 'Denied' });
      expect((await post()).status).toBe(status);
      expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
      expect(first.stream).not.toHaveBeenCalled();
    }
  );
  it.each(['foreign actor', 'other workspace'])(
    'fails closed on %s collision and never starts AI',
    async () => {
      mocks.callPrivateChatRpc.mockRejectedValue({
        code: '42501',
        message: 'chat_creation_forbidden',
      });
      expect((await post()).status).toBe(403);
      expect(first.stream).not.toHaveBeenCalled();
      expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['key', 'settings', 'text'])(
    'rejects a mismatched %s retry',
    async () => {
      mocks.callPrivateChatRpc.mockRejectedValue({ code: '22023' });
      expect((await post()).status).toBe(400);
      expect(first.stream).not.toHaveBeenCalled();
    }
  );
  it('returns the same creation/user receipt for duplicate concurrent requests', async () => {
    mocks.callPrivateChatRpc.mockResolvedValue({ ...result(), replayed: true });
    const responses = await Promise.all([post(), post()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses[0]?.headers.get('x-mira-chat-creation')).toEqual(
      responses[1]?.headers.get('x-mira-chat-creation')
    );
    expect(
      mocks.callPrivateChatRpc.mock.calls.every(
        (call) => call[1].p_input.creationRequestId === key
      )
    ).toBe(true);
  });
  it.each(['actor', 'workspace', 'id', 'settings', 'user'])(
    'refuses a malformed %s receipt',
    async (field) => {
      const saved = result();
      if (field === 'actor') saved.creationReceipt.createdBy = ws;
      if (field === 'workspace') saved.creationReceipt.wsId = actor;
      if (field === 'id') saved.creationReceipt.id = key;
      if (field === 'settings')
        saved.creationReceipt.initialAiSettings.modelId = 'foreign/model';
      if (field === 'user') saved.message.senderId = ws;
      mocks.callPrivateChatRpc.mockResolvedValue(saved);
      expect((await post()).status).toBe(500);
      expect(first.stream).not.toHaveBeenCalled();
    }
  );
  it.each([
    { kind: 'assistant' },
    { content: '' },
    { clientRequestId: null },
    { replyToMessageId: key },
    { attachments: [{ path: 'file', filename: 'file' }] },
  ])('rejects unsupported first-message payload %j', async (extra) => {
    expect((await post(extra)).status).toBe(400);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    expect(first.stream).not.toHaveBeenCalled();
  });
  it('requires the acknowledged stream transport', async () => {
    expect((await post({}, 'application/json')).status).toBe(400);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });
  it('publishes creation and USER receipts with normal recipient notification', async () => {
    await post();
    const publish = first.stream.mock.calls[0]?.[0].publishInitialMessages;
    expect(publish).toBeTypeOf('function');
    await publish();
    expect(
      mocks.publishChatRealtimeEvent.mock.calls.map(([event]) => event.type)
    ).toEqual(['conversation.created', 'message.created']);
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: actor,
        wsId: ws,
        conversationId: id,
        message: result().message,
        type: 'message.created',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(mocks.notifyChatMessageRecipients).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        actorUserId: actor,
        wsId: ws,
        message: result().message,
      })
    );
  });
  it('a replay does not duplicate creation announcements or notifications', async () => {
    mocks.callPrivateChatRpc.mockResolvedValue({ ...result(), replayed: true });
    await post();
    const publish = first.stream.mock.calls[0]?.[0].publishInitialMessages;
    expect(publish).toBeTypeOf('function');
    await publish();
    expect(
      mocks.publishChatRealtimeEvent.mock.calls.map(([event]) => event.type)
    ).toEqual(['message.created']);
    expect(mocks.notifyChatMessageRecipients).not.toHaveBeenCalled();
  });
  it('supplemental publication failure cannot invalidate a committed creation ACK', async () => {
    mocks.publishChatRealtimeEvent.mockRejectedValue(
      new Error('Synthetic realtime failure')
    );
    const response = await post();
    const publish = first.stream.mock.calls[0]?.[0].publishInitialMessages;
    expect(publish).toBeTypeOf('function');
    await expect(publish()).resolves.toBeUndefined();
    expect(response.status).toBe(200);
    expect(response.headers.get('x-mira-chat-creation')).not.toBeNull();
  });

  it('fails closed when migration is unavailable', async () => {
    mocks.callPrivateChatRpc.mockRejectedValue({ code: 'PGRST202' });
    expect((await post()).status).toBe(500);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
    expect(first.stream).not.toHaveBeenCalled();
  });
});
