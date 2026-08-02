import { beforeEach, describe, expect, it } from 'vitest';
import {
  conversation,
  createRequest,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

describe('chat message delivery and pagination route', () => {
  beforeEach(resetMessageRouteMocks);

  it('does not persist when an externally bound reply fails delivery', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockResolvedValue({
      configurationRevision: 3,
      delivered: false,
      deliveryId: 'delivery-1',
      idempotencyKey: 'idempotency-1',
      messageId: null,
      threadId: 'thread-1',
    });
    mocks.deliverExternalChatReplyIfBound.mockRejectedValue(
      new Error('bridge unavailable')
    );

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: 'external_delivery_failed',
    });
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
    expect(mocks.cancelExternalChatReply).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      wsId: 'workspace-1',
    });
  });

  it('preserves local reservation validation errors instead of returning 502', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockRejectedValue({ code: '22023' });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(400);
    expect(mocks.deliverExternalChatReplyIfBound).not.toHaveBeenCalled();
    expect(mocks.cancelExternalChatReply).not.toHaveBeenCalled();
  });

  it('delivers first and atomically finalizes an externally bound reply', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    const reservation = {
      configurationRevision: 3,
      delivered: false,
      deliveryId: 'delivery-1',
      idempotencyKey: 'idempotency-1',
      messageId: null,
      threadId: 'thread-1',
    };
    mocks.reserveExternalChatReply.mockResolvedValue(reservation);
    mocks.deliverExternalChatReplyIfBound.mockResolvedValue({
      deliveryId: reservation.deliveryId,
      idempotencyKey: reservation.idempotencyKey,
      thread: {},
    });
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_get_conversation') {
        return { ...conversation, type: 'channel' };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    expect(mocks.deliverExternalChatReplyIfBound).toHaveBeenCalledBefore(
      mocks.markExternalChatReplyDelivered
    );
    expect(mocks.markExternalChatReplyDelivered).toHaveBeenCalledBefore(
      mocks.finalizeExternalChatReply
    );
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
    expect(mocks.reserveExternalChatReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'hello' })
    );
    expect(mocks.deliverExternalChatReplyIfBound).toHaveBeenCalledWith(
      expect.objectContaining({ configurationRevision: 3 })
    );
  });

  it('replays realtime without repeating notifications for a finalized reply', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockResolvedValue({
      configurationRevision: 3,
      delivered: true,
      deliveryId: 'delivery-1',
      idempotencyKey: 'idempotency-1',
      messageId: 'message-1',
      threadId: 'thread-1',
    });
    mocks.finalizeExternalChatReply.mockResolvedValue({
      message: userMessage,
      replayed: true,
    });
    mocks.callPrivateChatRpc.mockResolvedValue({
      ...conversation,
      type: 'channel',
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.deliverExternalChatReplyIfBound).not.toHaveBeenCalled();
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ message: userMessage })
    );
    expect(mocks.notifyChatMessageRecipients).not.toHaveBeenCalled();
  });

  it('fails closed when an external reservation unexpectedly returns null', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockResolvedValue(null);

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(502);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
  });

  it('rejects non-user kinds for external conversations', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    const request = new Request(createRequest().url, {
      body: JSON.stringify({ content: 'system note', kind: 'system' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    const { POST } = await import('./route');
    const response = await POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'external_message_kind_unsupported',
    });
    expect(mocks.reserveExternalChatReply).not.toHaveBeenCalled();
  });

  it('preserves non-user message kinds for ordinary native conversations', async () => {
    const systemMessage = { ...userMessage, kind: 'system' };
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_message') return systemMessage;
      if (name === 'chat_get_conversation') return conversation;
      throw new Error(`Unexpected RPC ${name}`);
    });
    const request = new Request(createRequest().url, {
      body: JSON.stringify({ content: 'system note', kind: 'system' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    const { POST } = await import('./route');
    const response = await POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_send_message',
      expect.objectContaining({ p_kind: 'system' })
    );
    expect(mocks.notifyChatMessageRecipients).not.toHaveBeenCalled();
  });

  it('fails closed without reporting a remote rejection when binding lookup fails', async () => {
    mocks.isExternalChatConversation.mockRejectedValue(
      new Error('database unavailable')
    );

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Failed to resolve chat delivery route',
    });
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
  });

  it('returns a persisted message when the post-save conversation lookup fails', async () => {
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') {
        throw new Error('database unavailable');
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      message: userMessage,
      messages: [userMessage],
    });
  });

  it('clamps message page limits before calling the database', async () => {
    mocks.callPrivateChatRpc.mockResolvedValue([]);
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/conversation-1/messages?limit=999.5'
      ) as never,
      {
        params: Promise.resolve({
          conversationId: 'conversation-1',
          wsId: 'workspace-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_list_messages',
      expect.objectContaining({ p_limit: 100 })
    );
  });

  it('rejects attachments before connected-site delivery', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockResolvedValue({
      configurationRevision: 3,
      delivered: false,
      deliveryId: 'delivery-1',
      idempotencyKey: 'idempotency-1',
      messageId: null,
      threadId: 'thread-1',
    });
    const request = new Request(createRequest().url, {
      body: JSON.stringify({
        attachments: [{ filename: 'scan.pdf', path: 'chat/scan.pdf' }],
        content: '',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    const { POST } = await import('./route');
    const response = await POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(400);
    expect(mocks.deliverExternalChatReplyIfBound).not.toHaveBeenCalled();
    expect(mocks.finalizeExternalChatReply).not.toHaveBeenCalled();
  });
});
