import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: { supabase: null as unknown, user: { id: 'user-1' } },
  callPrivateChatRpc: vi.fn(),
  resolveChatRouteContext: vi.fn(),
};

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, mocks.auth, await routeContext?.params),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: unknown[]) => mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: (error: { code?: string }) =>
    Response.json(
      { message: 'failed' },
      {
        status:
          error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 500,
      }
    ),
  resolveChatRouteContext: (...args: unknown[]) =>
    mocks.resolveChatRouteContext(...args),
}));

const USER = '33333333-3333-4333-8333-333333333333';
const CONVERSATION = '44444444-4444-4444-8444-444444444444';
const MESSAGE = '55555555-5555-4555-8555-555555555555';
const AI_CHAT = '66666666-6666-4666-8666-666666666666';

function post(body: unknown) {
  return new Request('http://localhost/api/v1/workspaces/ws/chat/reports', {
    body: JSON.stringify(body),
    method: 'POST',
  });
}

const ctx = { params: Promise.resolve({ wsId: 'ws' }) };

describe('chat reports route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'ws-1' },
      ok: true,
    });
  });

  it('records a message report bound to the session user', async () => {
    mocks.callPrivateChatRpc.mockResolvedValueOnce({
      reportId: 'r1',
      reportedUserId: USER,
    });
    const { POST } = await import('./route');
    const response = await POST(
      post({
        subjectType: 'message',
        conversationId: CONVERSATION,
        messageId: MESSAGE,
        reason: 'harassment',
        details: '  rude  ',
        // A forged actor in the body is ignored.
        actorUserId: 'someone-else',
      }) as never,
      ctx
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      blocked: false,
      reportId: 'r1',
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_submit_content_report',
      {
        p_actor_user_id: 'user-1',
        p_ai_chat_id: null,
        p_conversation_id: CONVERSATION,
        p_details: 'rude',
        p_message_id: MESSAGE,
        p_reason: 'harassment',
        p_reported_user_id: null,
        p_subject_type: 'message',
        p_ws_id: 'ws-1',
      }
    );
  });

  it('blocks the sender resolved by SQL, never a client-supplied id', async () => {
    mocks.callPrivateChatRpc
      .mockResolvedValueOnce({ reportId: 'r2', reportedUserId: USER })
      .mockResolvedValueOnce({ blocked: true, userId: USER });
    const { POST } = await import('./route');
    const response = await POST(
      post({
        subjectType: 'message',
        conversationId: CONVERSATION,
        messageId: MESSAGE,
        reason: 'spam',
        alsoBlock: true,
      }) as never,
      ctx
    );

    await expect(response.json()).resolves.toEqual({
      blocked: true,
      reportId: 'r2',
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenLastCalledWith(
      'chat_block_user',
      { p_actor_user_id: 'user-1', p_target_user_id: USER }
    );
  });

  it('maps a Mira chat id to the ai_chats report path', async () => {
    mocks.callPrivateChatRpc.mockResolvedValueOnce({ reportId: 'r3' });
    const { POST } = await import('./route');
    const response = await POST(
      post({
        subjectType: 'ai_response',
        conversationId: `ai-chat-${AI_CHAT}`,
        messageId: MESSAGE,
        reason: 'inaccurate',
      }) as never,
      ctx
    );

    expect(response.status).toBe(201);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_submit_content_report',
      expect.objectContaining({
        p_ai_chat_id: AI_CHAT,
        p_conversation_id: null,
        p_message_id: MESSAGE,
        p_subject_type: 'ai_response',
      })
    );
  });

  it('rejects unknown reasons and malformed conversation ids', async () => {
    const { POST } = await import('./route');
    const badReason = await POST(
      post({
        subjectType: 'user',
        reportedUserId: USER,
        reason: 'meh',
      }) as never,
      ctx
    );
    const badConversation = await POST(
      post({
        subjectType: 'ai_response',
        conversationId: 'not-a-uuid',
        messageId: MESSAGE,
        reason: 'harmful',
      }) as never,
      ctx
    );

    expect(badReason.status).toBe(400);
    expect(badConversation.status).toBe(400);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('returns 429 when the reporter is rate limited', async () => {
    mocks.callPrivateChatRpc.mockRejectedValueOnce({
      code: '54000',
      message: 'chat_report_rate_limited',
    });
    const { POST } = await import('./route');
    const response = await POST(
      post({
        subjectType: 'user',
        reportedUserId: USER,
        reason: 'spam',
      }) as never,
      ctx
    );
    expect(response.status).toBe(429);
  });

  it('passes through SQL authorization refusals', async () => {
    mocks.callPrivateChatRpc.mockRejectedValueOnce({
      code: '42501',
      message: 'chat_report_target_invalid',
    });
    const { POST } = await import('./route');
    const response = await POST(
      post({
        subjectType: 'user',
        reportedUserId: USER,
        reason: 'spam',
      }) as never,
      ctx
    );
    expect(response.status).toBe(403);
  });
});
