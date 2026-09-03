import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_B = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  authorizeAiWorkspace: vi.fn(),
  convertToModelMessages: vi.fn(),
  generateText: vi.fn(),
  google: vi.fn(),
  resolveAiMemoryWorkspaceIdForUser: vi.fn(),
  resolveAiRouteAuth: vi.fn(),
  withAiMemory: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));

vi.mock('ai', () => ({
  convertToModelMessages: (
    ...args: Parameters<typeof mocks.convertToModelMessages>
  ) => mocks.convertToModelMessages(...args),
  generateText: (...args: Parameters<typeof mocks.generateText>) =>
    mocks.generateText(...args),
}));

vi.mock('../../../memory', () => ({
  resolveAiMemoryWorkspaceIdForUser: (
    ...args: Parameters<typeof mocks.resolveAiMemoryWorkspaceIdForUser>
  ) => mocks.resolveAiMemoryWorkspaceIdForUser(...args),
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

vi.mock('../route-auth', () => ({
  authorizeAiWorkspace: (
    ...args: Parameters<typeof mocks.authorizeAiWorkspace>
  ) => mocks.authorizeAiWorkspace(...args),
  resolveAiRouteAuth: (...args: Parameters<typeof mocks.resolveAiRouteAuth>) =>
    mocks.resolveAiRouteAuth(...args),
}));

import { createPATCH } from './route';

function createSupabase() {
  const chatMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: 'chat-1' },
    error: null,
  });
  const chatCreatorEq = vi.fn(() => ({ maybeSingle: chatMaybeSingle }));
  const chatIdEq = vi.fn(() => ({ eq: chatCreatorEq }));
  const chatSelect = vi.fn(() => ({ eq: chatIdEq }));
  const messageOrder = vi.fn().mockResolvedValue({
    data: [
      {
        content: 'Answer',
        id: 'message-1',
        role: 'ASSISTANT',
      },
    ],
    error: null,
  });
  const messageEq = vi.fn(() => ({ order: messageOrder }));
  const messageSelect = vi.fn(() => ({ eq: messageEq }));
  const updateMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: 'chat-1' },
    error: null,
  });
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateCreatorEq = vi.fn(() => ({ select: updateSelect }));
  const updateIdEq = vi.fn(() => ({ eq: updateCreatorEq }));
  const update = vi.fn(() => ({ eq: updateIdEq }));
  const from = vi.fn((table: string) =>
    table === 'ai_chat_messages'
      ? { select: messageSelect }
      : { select: chatSelect, update }
  );

  return {
    chatCreatorEq,
    chatMaybeSingle,
    chatSelect,
    from,
    messageEq,
    messageOrder,
    messageSelect,
    update,
    updateCreatorEq,
    updateIdEq,
    updateMaybeSingle,
    updateSelect,
  };
}

function request(body: unknown) {
  return new Request('http://localhost/api/ai/chat/google/summary', {
    body: JSON.stringify(body),
    method: 'PATCH',
  }) as never;
}

describe('chat google summary route workspace authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAiWorkspace.mockImplementation(async ({ wsId }) => ({
      ok: true,
      wsId,
    }));
    mocks.convertToModelMessages.mockResolvedValue([{ role: 'assistant' }]);
    mocks.generateText.mockResolvedValue({ text: 'Summary' });
    mocks.google.mockReturnValue('google-model');
    mocks.resolveAiMemoryWorkspaceIdForUser.mockResolvedValue(
      '00000000-0000-0000-0000-000000000000'
    );
    mocks.withAiMemory.mockResolvedValue('memory-model');
  });

  it('returns 401 before message queries for an anonymous request', async () => {
    const supabase = createSupabase();
    mocks.resolveAiRouteAuth.mockResolvedValue({
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    });

    const response = await createPATCH()(request({ id: 'chat-1' }));

    expect(response.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('requires a workspace at the Rewise factory boundary before message queries', async () => {
    const supabase = createSupabase();

    const response = await createPATCH({
      requireWorkspaceId: true,
      resolveAuth: async () => ({
        ok: true,
        supabase: supabase as never,
        user: { id: 'rewise-user' } as never,
      }),
    })(request({ id: 'chat-1' }));

    expect(response.status).toBe(422);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('preserves optional workspace behavior for legacy callers', async () => {
    const supabase = createSupabase();

    const response = await createPATCH({
      resolveAuth: async () => ({
        ok: true,
        supabase: supabase as never,
        user: { id: 'legacy-user' } as never,
      }),
    })(request({ id: 'chat-1' }));

    expect(response.status).toBe(200);
    expect(mocks.authorizeAiWorkspace).not.toHaveBeenCalled();
    expect(mocks.resolveAiMemoryWorkspaceIdForUser).toHaveBeenCalledWith({
      supabase,
      userId: 'legacy-user',
    });
  });

  it.each([WORKSPACE_A, WORKSPACE_B])(
    'propagates workspace %s to summary memory and authorizes persistence',
    async (wsId) => {
      const supabase = createSupabase();

      const response = await createPATCH({
        requireWorkspaceId: true,
        resolveAuth: async () => ({
          ok: true,
          supabase: supabase as never,
          user: { id: 'rewise-user' } as never,
        }),
      })(request({ id: 'chat-1', wsId }));

      expect(response.status).toBe(200);
      expect(mocks.authorizeAiWorkspace).toHaveBeenCalledWith({
        request: expect.any(Request),
        supabase,
        userId: 'rewise-user',
        wsId,
      });
      expect(mocks.withAiMemory).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'rewise-user', wsId })
      );
      expect(supabase.update).toHaveBeenCalledWith({
        latest_summarized_message_id: 'message-1',
        summary: 'Summary',
      });
      expect(supabase.chatCreatorEq).toHaveBeenCalledWith(
        'creator_id',
        'rewise-user'
      );
      expect(supabase.updateCreatorEq).toHaveBeenCalledWith(
        'creator_id',
        'rewise-user'
      );
    }
  );

  it('rejects a chat not owned by the authenticated actor before reading messages', async () => {
    const supabase = createSupabase();
    supabase.chatMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await createPATCH({
      requireWorkspaceId: true,
      resolveAuth: async () => ({
        ok: true,
        supabase: supabase as never,
        user: { id: 'rewise-user' } as never,
      }),
    })(request({ id: 'other-user-chat', wsId: WORKSPACE_A }));

    expect(response.status).toBe(404);
    expect(supabase.messageSelect).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('returns 404 when ownership changes before summary persistence', async () => {
    const supabase = createSupabase();
    supabase.updateMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const response = await createPATCH({
      requireWorkspaceId: true,
      resolveAuth: async () => ({
        ok: true,
        supabase: supabase as never,
        user: { id: 'rewise-user' } as never,
      }),
    })(request({ id: 'chat-1', wsId: WORKSPACE_A }));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe('Chat not found');
  });

  it.each([
    ['malformed workspace', 422],
    ['workspace nonmember', 403],
    ['membership lookup error', 500],
  ])(
    'rejects %s before message, model, or mutation work',
    async (_, status) => {
      const supabase = createSupabase();
      mocks.authorizeAiWorkspace.mockResolvedValueOnce({
        ok: false,
        response: Response.json({ error: 'Denied' }, { status }),
      });

      const response = await createPATCH({
        requireWorkspaceId: true,
        resolveAuth: async () => ({
          ok: true,
          supabase: supabase as never,
          user: { id: 'rewise-user' } as never,
        }),
      })(request({ id: 'chat-1', wsId: WORKSPACE_A }));

      expect(response.status).toBe(status);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(mocks.generateText).not.toHaveBeenCalled();
      expect(mocks.withAiMemory).not.toHaveBeenCalled();
    }
  );
});
