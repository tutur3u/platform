import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  callPrivateChatRpc: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  select: vi.fn(),
  sessionAuth: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, context: { params: Promise<unknown> }) => {
      mocks.sessionAuth(request.method);
      return handler(
        request,
        { supabase: { from: mocks.from }, user: { id: 'authenticated-actor' } },
        await context.params
      );
    },
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: unknown[]) => mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: (error: { code?: string }, message: string) =>
    Response.json(
      { code: error.code, message },
      {
        status:
          error.code === '42501' ? 403 : error.code === '22023' ? 400 : 500,
      }
    ),
  resolveChatRouteContext: (...args: unknown[]) =>
    mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({ userIds: ['authenticated-actor'] }),
  publishChatRealtimeEvent: (...args: unknown[]) =>
    mocks.publishChatRealtimeEvent(...args),
}));

const messageId = 'b9287000-0000-4000-8000-000000000001';
const opId = 'b9287000-0000-4000-8000-000000000002';
const conversationId = 'b9287000-0000-4000-8000-000000000003';
const message = { conversationId, id: messageId, reactions: [] };
const operation = { emoji: 'heart', id: opId, present: true };

async function post(body: unknown) {
  const { POST } = await import('./route');
  return POST(
    new NextRequest('http://localhost/api/reactions', {
      body: JSON.stringify(body),
      method: 'POST',
    }),
    { params: Promise.resolve({ conversationId, wsId: 'personal' }) }
  );
}

async function put(body: unknown) {
  const { PUT } = await import('./route');
  return PUT(
    new NextRequest('http://localhost/api/reactions', {
      body: JSON.stringify(body),
      method: 'PUT',
    }),
    { params: Promise.resolve({ conversationId, wsId: 'personal' }) }
  );
}

async function get(query = `messageId=${messageId}`) {
  const { GET } = await import('./route');
  return GET(new NextRequest(`http://localhost/api/reactions?${query}`), {
    params: Promise.resolve({ conversationId, wsId: 'personal' }),
  });
}

describe('chat reaction route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const membershipQuery = {
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
      select: mocks.select,
    };
    mocks.from.mockReturnValue(membershipQuery);
    mocks.select.mockReturnValue(membershipQuery);
    mocks.eq.mockReturnValue(membershipQuery);
    mocks.maybeSingle.mockResolvedValue({
      data: { user_id: 'authenticated-actor' },
      error: null,
    });
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'normalized-workspace' },
      ok: true,
    });
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_toggle_reaction') return message;
      if (name === 'chat_set_reaction') return { message, operation };
      if (name === 'chat_get_reaction_message') return message;
      if (name === 'chat_get_conversation') return { id: conversationId };
      throw new Error(`Unexpected RPC ${name}`);
    });
  });

  it('keeps the legacy toggle envelope and realtime event', async () => {
    const response = await post({ emoji: ' heart ', messageId });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message });
    expect(mocks.sessionAuth).toHaveBeenCalledExactlyOnceWith('POST');
    expect(mocks.resolveChatRouteContext).toHaveBeenCalledTimes(1);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_toggle_reaction',
      {
        p_actor_user_id: 'authenticated-actor',
        p_conversation_id: conversationId,
        p_emoji: 'heart',
        p_message_id: messageId,
        p_ws_id: 'normalized-workspace',
      }
    );
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'authenticated-actor',
        conversationId,
        message,
        type: 'reaction.updated',
        wsId: 'normalized-workspace',
      })
    );
  });

  it.each([true, false])(
    'PUT sets present=%s using the original operation ID',
    async (present) => {
      const receipt = { message, operation: { ...operation, present } };
      mocks.callPrivateChatRpc.mockResolvedValueOnce(receipt);
      const response = await put({ emoji: 'heart', messageId, opId, present });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(receipt);
      expect(mocks.sessionAuth).toHaveBeenCalledExactlyOnceWith('PUT');
      expect(mocks.resolveChatRouteContext).toHaveBeenCalledTimes(1);
      expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
        'chat_set_reaction',
        {
          p_actor_user_id: 'authenticated-actor',
          p_conversation_id: conversationId,
          p_emoji: 'heart',
          p_message_id: messageId,
          p_op_id: opId,
          p_present: present,
          p_ws_id: 'normalized-workspace',
        }
      );
      expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
        'chat_toggle_reaction',
        expect.anything()
      );
      expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
        expect.objectContaining({ message, type: 'reaction.updated' })
      );
    }
  );

  it('binds membership and mutation to auth rather than supplied actor fields', async () => {
    const response = await put({
      actorUserId: 'forged-actor',
      emoji: 'heart',
      messageId,
      opId,
      p_actor_user_id: 'forged-actor',
      present: true,
    });

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('workspace_members');
    expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'normalized-workspace');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'authenticated-actor');
    expect(mocks.maybeSingle).toHaveBeenCalledBefore(mocks.callPrivateChatRpc);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_set_reaction',
      expect.objectContaining({ p_actor_user_id: 'authenticated-actor' })
    );
  });

  it.each([
    {},
    { present: true },
    { present: false },
    { opId },
    { opId: null, present: true },
    { opId: 'invalid', present: true },
    { opId, present: null },
    { opId, present: 'false' },
    { opId, present: 1 },
    { emoji: '', opId, present: true },
    { emoji: ' '.repeat(5), opId, present: true },
    { emoji: 'x'.repeat(65), opId, present: true },
    { messageId: 'invalid', opId, present: true },
  ])(
    'PUT rejects missing or invalid intent without toggling: %j',
    async (invalid) => {
      const response = await put({ emoji: 'heart', messageId, ...invalid });

      expect(response.status).toBe(400);
      expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
      expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
    }
  );

  it.each([
    { opId, present: true },
    { opId, present: false },
    { present: true },
    { present: false },
    { opId },
    { opId: null },
    { present: null },
  ])(
    'POST rejects desired-state fields without toggling: %j',
    async (intent) => {
      const response = await post({ emoji: 'heart', messageId, ...intent });

      expect(response.status).toBe(400);
      expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
      expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
    }
  );

  it('rejects malformed JSON', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new NextRequest('http://localhost/api/reactions', {
        body: '{',
        method: 'POST',
      }),
      { params: Promise.resolve({ conversationId, wsId: 'personal' }) }
    );
    expect(response.status).toBe(400);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('stops at request-scoped permission denial', async () => {
    mocks.resolveChatRouteContext.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'denied' }, { status: 403 }),
    });
    expect((await post({ emoji: 'heart', messageId })).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('rejects a successful membership lookup without a row', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await post({ emoji: 'heart', messageId })).status).toBe(403);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it.each(['XX000', '42501'])(
    'treats membership lookup error %s as 500',
    async (code) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mocks.maybeSingle.mockResolvedValue({ data: null, error: { code } });
        expect((await post({ emoji: 'heart', messageId })).status).toBe(500);
        expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    }
  );

  it('fails closed when the desired-state migration is unavailable', async () => {
    mocks.callPrivateChatRpc.mockRejectedValueOnce({ code: 'PGRST202' });
    const response = await put({
      emoji: 'heart',
      messageId,
      opId,
      present: true,
    });

    expect(response.status).toBe(500);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_set_reaction',
      expect.objectContaining({ p_op_id: opId })
    );
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
  });

  it('does not acknowledge a mismatched operation or emit realtime', async () => {
    mocks.callPrivateChatRpc.mockRejectedValueOnce({
      code: '22023',
      message: 'chat_reaction_operation_mismatch',
    });
    const response = await put({
      emoji: 'heart',
      messageId,
      opId,
      present: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing message', async () => {
    mocks.callPrivateChatRpc.mockResolvedValueOnce(null);
    const response = await put({
      emoji: 'heart',
      messageId,
      opId,
      present: true,
    });
    expect(response.status).toBe(404);
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
  });

  it('returns the committed receipt when the conversation disappears before publish', async () => {
    mocks.callPrivateChatRpc
      .mockResolvedValueOnce({ message, operation })
      .mockResolvedValueOnce(null);
    const response = await put({
      emoji: 'heart',
      messageId,
      opId,
      present: true,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message, operation });
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
  });

  describe('exact-message GET', () => {
    it('reads only the target with the authenticated actor and normalized workspace', async () => {
      const fullMessage = {
        ...message,
        reactions: [
          { count: 2, emoji: 'heart', userIds: ['actor-a', 'actor-b'] },
        ],
      };
      mocks.callPrivateChatRpc.mockResolvedValueOnce(fullMessage);
      const response = await get(
        `messageId=${messageId}&actorUserId=forged&wsId=forged&conversationId=forged`
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ message: fullMessage });
      expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'normalized-workspace');
      expect(mocks.eq).toHaveBeenCalledWith('user_id', 'authenticated-actor');
      expect(mocks.maybeSingle).toHaveBeenCalledBefore(
        mocks.callPrivateChatRpc
      );
      expect(mocks.callPrivateChatRpc).toHaveBeenCalledExactlyOnceWith(
        'chat_get_reaction_message',
        {
          p_actor_user_id: 'authenticated-actor',
          p_conversation_id: conversationId,
          p_message_id: messageId,
          p_ws_id: 'normalized-workspace',
        }
      );
      expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
    });

    it.each(['', 'messageId=', 'messageId=not-a-uuid'])(
      'rejects an invalid messageId query: %s',
      async (query) => {
        expect((await get(query)).status).toBe(400);
        expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
      }
    );

    it('returns 404 when the target is absent or deleted', async () => {
      mocks.callPrivateChatRpc.mockResolvedValueOnce(null);
      expect((await get()).status).toBe(404);
      expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
    });

    it('stops before admin lookup on request permission denial', async () => {
      mocks.resolveChatRouteContext.mockResolvedValue({
        ok: false,
        response: Response.json({ message: 'denied' }, { status: 403 }),
      });
      expect((await get()).status).toBe(403);
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    });

    it('stops before admin lookup when membership is absent', async () => {
      mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
      expect((await get()).status).toBe(403);
      expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    });

    it('treats a membership lookup error as 500', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mocks.maybeSingle.mockResolvedValue({
          data: null,
          error: { code: '42501' },
        });
        expect((await get()).status).toBe(500);
        expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    });

    it('fails closed if the exact-message RPC is unavailable', async () => {
      mocks.callPrivateChatRpc.mockRejectedValueOnce({ code: 'PGRST202' });
      expect((await get()).status).toBe(500);
      expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
      expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
        'chat_get_reaction_message',
        expect.objectContaining({ p_message_id: messageId })
      );
    });

    it('propagates actor-scoped RPC denial without publishing or fallback', async () => {
      mocks.callPrivateChatRpc.mockRejectedValueOnce({
        code: '42501',
        message: 'chat_conversation_forbidden',
      });
      expect((await get()).status).toBe(403);
      expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
      expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
    });

    it('returns the target snapshot after acknowledging the original pending operation', async () => {
      const putResponse = await put({
        emoji: 'heart',
        messageId,
        opId,
        present: true,
      });
      const getResponse = await get();
      expect(putResponse.status).toBe(200);
      expect(getResponse.status).toBe(200);
      await expect(putResponse.json()).resolves.toEqual({
        message,
        operation,
      });
      await expect(getResponse.json()).resolves.toEqual({ message });
      expect(mocks.callPrivateChatRpc.mock.calls.map(([name]) => name)).toEqual(
        [
          'chat_set_reaction',
          'chat_get_conversation',
          'chat_get_reaction_message',
        ]
      );
    });
  });
});
