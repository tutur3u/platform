import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeAiWorkspace: vi.fn(),
  cascadeBackendRateLimitToProxyBan: vi.fn(),
  createClient: vi.fn(),
  extractIPFromHeaders: vi.fn(),
  generateText: vi.fn(),
  google: vi.fn(),
  isBackendRateLimitError: vi.fn(),
  isInternalTuturuuuAiUser: vi.fn(),
  resolveAiMemoryWorkspaceIdForUser: vi.fn(),
  validateAiTempAuthRequest: vi.fn(),
  withAiMemory: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));

vi.mock('ai', () => ({
  generateText: (...args: Parameters<typeof mocks.generateText>) =>
    mocks.generateText(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: (
    ...args: Parameters<typeof mocks.extractIPFromHeaders>
  ) => mocks.extractIPFromHeaders(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection/backend-rate-limit', () => ({
  cascadeBackendRateLimitToProxyBan: (
    ...args: Parameters<typeof mocks.cascadeBackendRateLimitToProxyBan>
  ) => mocks.cascadeBackendRateLimitToProxyBan(...args),
  isBackendRateLimitError: (
    ...args: Parameters<typeof mocks.isBackendRateLimitError>
  ) => mocks.isBackendRateLimitError(...args),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: (
    ...args: Parameters<typeof mocks.validateAiTempAuthRequest>
  ) => mocks.validateAiTempAuthRequest(...args),
}));

vi.mock('../../../memory', () => ({
  resolveAiMemoryWorkspaceIdForUser: (
    ...args: Parameters<typeof mocks.resolveAiMemoryWorkspaceIdForUser>
  ) => mocks.resolveAiMemoryWorkspaceIdForUser(...args),
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

vi.mock('../route-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../route-auth')>();
  return {
    ...actual,
    authorizeAiWorkspace: (
      ...args: Parameters<typeof mocks.authorizeAiWorkspace>
    ) => mocks.authorizeAiWorkspace(...args),
    isInternalTuturuuuAiUser: (
      ...args: Parameters<typeof mocks.isInternalTuturuuuAiUser>
    ) => mocks.isInternalTuturuuuAiUser(...args),
  };
});

import { createPOST } from './route';

describe('chat google new route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractIPFromHeaders.mockReturnValue('203.0.113.10');
    mocks.cascadeBackendRateLimitToProxyBan.mockResolvedValue({
      id: 'block-1',
      blockLevel: 1,
      reason: 'api_abuse',
      blockedAt: new Date(),
      expiresAt: new Date(Date.now() + 300_000),
    });
    mocks.google.mockReturnValue('mock-model');
    mocks.generateText.mockResolvedValue({ text: 'New title' });
    mocks.isBackendRateLimitError.mockReturnValue(false);
    mocks.isInternalTuturuuuAiUser.mockResolvedValue(true);
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });
    mocks.authorizeAiWorkspace.mockImplementation(async ({ wsId }) => ({
      ok: true,
      wsId,
    }));
    mocks.resolveAiMemoryWorkspaceIdForUser.mockResolvedValue(
      '00000000-0000-0000-0000-000000000000'
    );
    mocks.withAiMemory.mockResolvedValue('memory-model');
  });

  it('returns 429 and seeds the proxy ban cache when auth is rate limited', async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { status: 429, code: 'over_request_rate_limit' },
        }),
      },
    });
    mocks.isBackendRateLimitError.mockImplementation(
      (error) => error?.status === 429
    );

    const response = await createPOST()(
      new Request('http://localhost/api/ai/chat/new', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    );

    expect(response.status).toBe(429);
    expect(mocks.cascadeBackendRateLimitToProxyBan).toHaveBeenCalledWith({
      endpoint: '/api/ai/chat/new',
      ipAddress: '203.0.113.10',
      source: 'auth',
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('rejects client-only prefixed chat ids before title generation', async () => {
    const response = await createPOST()(
      new Request('http://localhost/api/ai/chat/new', {
        method: 'POST',
        body: JSON.stringify({
          id: 'learn-workspace-1-0-00000000-0000-0000-0000-000000000000',
          message: 'hello',
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toBe('Invalid chat id');
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('does not pass the verified user when the database returns 429', async () => {
    const insert = vi.fn().mockResolvedValue({
      data: null,
      error: { status: 429, message: 'Request rate limit reached' },
    });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: insert,
          }),
        }),
      }),
    });
    mocks.isBackendRateLimitError.mockImplementation(
      (error) => error?.status === 429
    );

    const response = await createPOST()(
      new Request('http://localhost/api/ai/chat/new', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    );

    expect(response.status).toBe(429);
    expect(mocks.cascadeBackendRateLimitToProxyBan).toHaveBeenCalledWith({
      endpoint: '/api/ai/chat/new',
      ipAddress: '203.0.113.10',
      source: 'database',
    });
  });

  it('uses a valid temp token without calling Supabase getUser', async () => {
    const getUser = vi.fn();
    const single = vi.fn().mockResolvedValue({
      data: { id: '11111111-1111-4111-8111-111111111111' },
      error: null,
    });
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single,
      }),
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser },
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnValue({
        insert,
      }),
    });
    mocks.validateAiTempAuthRequest.mockResolvedValue({
      status: 'valid',
      context: { user: { id: 'temp-user-1', email: 'temp@example.com' } },
    });

    const response = await createPOST()(
      new Request('http://localhost/api/ai/chat/new', {
        method: 'POST',
        body: JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          message: 'hello',
          model: 'google/gemini-2.5-flash',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ creator_id: 'temp-user-1' })
    );
  });

  it('preserves optional workspace behavior for legacy callers', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: '11111111-1111-4111-8111-111111111111' },
      error: null,
    });
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'legacy-user' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.createClient.mockResolvedValue(supabase);

    const response = await createPOST()(
      new Request('http://localhost/api/ai/chat/new', {
        body: JSON.stringify({ message: 'hello' }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.authorizeAiWorkspace).not.toHaveBeenCalled();
    expect(mocks.resolveAiMemoryWorkspaceIdForUser).not.toHaveBeenCalled();
  });

  it('requires a workspace at the Rewise factory boundary before downstream work', async () => {
    const from = vi.fn();
    const response = await createPOST({
      requireWorkspaceId: true,
      resolveGatewayAuth: async () => ({
        auth: {
          supabase: { from } as never,
          user: { id: 'rewise-user' } as never,
        },
        ok: true,
      }),
    })(
      new Request('http://localhost/api/ai/chat/new', {
        body: JSON.stringify({ message: 'hello' }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(422);
    expect(from).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it.each([
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ])('authorizes Rewise persistence work in workspace %s', async (wsId) => {
    const chatInsert = vi.fn().mockResolvedValue({ error: null });
    const single = vi.fn().mockResolvedValue({
      data: { id: '33333333-3333-4333-8333-333333333333' },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === 'ai_chats') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single }),
          }),
        };
      }
      return { insert: chatInsert };
    });
    const supabase = { from };

    const response = await createPOST({
      requireWorkspaceId: true,
      resolveGatewayAuth: async () => ({
        auth: {
          supabase: supabase as never,
          user: { id: 'rewise-user' } as never,
        },
        ok: true,
      }),
    })(
      new Request('http://localhost/api/ai/chat/new', {
        body: JSON.stringify({ message: 'hello', wsId }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.authorizeAiWorkspace).toHaveBeenCalledWith({
      request: expect.any(Request),
      supabase,
      userId: 'rewise-user',
      wsId,
    });
    expect(mocks.withAiMemory).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(chatInsert).toHaveBeenCalledWith({
      chat_id: '33333333-3333-4333-8333-333333333333',
      content: 'hello',
      creator_id: 'rewise-user',
      role: 'USER',
      metadata: { source: 'Rewise' },
    });
  });

  it('rejects an unauthorized selected workspace before title or persistence work', async () => {
    const from = vi.fn();
    mocks.authorizeAiWorkspace.mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });

    const response = await createPOST({
      requireWorkspaceId: true,
      resolveGatewayAuth: async () => ({
        auth: {
          supabase: { from } as never,
          user: { id: 'rewise-user' } as never,
        },
        ok: true,
      }),
    })(
      new Request('http://localhost/api/ai/chat/new', {
        body: JSON.stringify({
          message: 'hello',
          wsId: '11111111-1111-4111-8111-111111111111',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.withAiMemory).not.toHaveBeenCalled();
  });

  it('rejects unauthorized Mira access before resolving the selected workspace', async () => {
    const from = vi.fn();
    mocks.isInternalTuturuuuAiUser.mockResolvedValueOnce(false);

    const response = await createPOST({
      requireWorkspaceId: true,
      resolveGatewayAuth: async () => ({
        auth: {
          supabase: { from } as never,
          user: { email: 'external@example.com', id: 'rewise-user' } as never,
        },
        ok: true,
      }),
    })(
      new Request('http://localhost/api/ai/chat/new', {
        body: JSON.stringify({
          isMiraMode: true,
          message: 'hello',
          wsId: '11111111-1111-4111-8111-111111111111',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.authorizeAiWorkspace).not.toHaveBeenCalled();
    expect(mocks.resolveAiMemoryWorkspaceIdForUser).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it.each([
    ['  Xin\n chào\t Việt Nam 👩🏽‍💻  ', 'Xin chào Việt Nam 👩🏽‍💻'],
    ['a'.repeat(60), 'a'.repeat(60)],
    ['a'.repeat(61), `${'a'.repeat(59)}…`],
    [`${'a '.repeat(28)}lengthy-word`, `${'a '.repeat(28).trim()}…`],
    [`${'hello '.repeat(10)}world`, `${'hello '.repeat(10).trim()}…`],
    ['👩🏽‍💻'.repeat(61), `${'👩🏽‍💻'.repeat(59)}…`],
    ['a\u0301'.repeat(61), `${'a\u0301'.repeat(59)}…`],
    ['  \n\t ', '…'],
  ])(
    'persists and returns a provisional title without a model call: %j',
    async (message, title) => {
      const id = '11111111-1111-4111-8111-111111111111';
      const single = vi.fn().mockResolvedValue({ data: { id }, error: null });
      const insert = vi
        .fn()
        .mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
      const rpc = vi.fn().mockResolvedValue({ error: null });
      mocks.createClient.mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({ insert }),
        rpc,
      });
      // A title provider must never be required for chat creation to succeed.
      mocks.generateText.mockRejectedValue(
        new Error('Title provider unavailable')
      );

      const response = await createPOST()(
        new Request('http://localhost/api/ai/chat/new', {
          method: 'POST',
          body: JSON.stringify({
            id,
            message,
            model: 'google/gemini-2.5-flash',
            isMiraMode: true,
          }),
        })
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ id, title });
      expect(insert).toHaveBeenCalledWith({
        id,
        title,
        creator_id: 'user-1',
        model: 'gemini-2.5-flash',
      });
      expect(rpc).toHaveBeenCalledWith('insert_ai_chat_message', {
        message,
        chat_id: id,
        source: 'Mira',
      });
      expect(mocks.generateText).not.toHaveBeenCalled();
      expect(mocks.google).not.toHaveBeenCalled();
      expect(mocks.withAiMemory).not.toHaveBeenCalled();
    }
  );

  it.each(['missing-session', 'revoked-token'])(
    'rejects %s before persistence',
    async (failure) => {
      const from = vi.fn();
      mocks.createClient.mockResolvedValue({
        auth: {
          getUser: vi
            .fn()
            .mockResolvedValue({ data: { user: null }, error: null }),
        },
        from,
      });
      if (failure === 'revoked-token')
        mocks.validateAiTempAuthRequest.mockResolvedValueOnce({
          status: 'revoked',
        });
      const response = await createPOST()(
        new Request('http://localhost/api/ai/chat/new', {
          method: 'POST',
          body: JSON.stringify({ message: 'hello' }),
        })
      );
      expect(response.status).toBe(401);
      expect(from).not.toHaveBeenCalled();
      expect(mocks.generateText).not.toHaveBeenCalled();
    }
  );

  it('waits for initial-message persistence and preserves the default model', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const single = vi.fn().mockResolvedValue({ data: { id }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    let finishWrite!: (result: { error: null }) => void;
    const rpc = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finishWrite = resolve;
      })
    );
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({ insert }),
      rpc,
    });
    let settled = false;
    const response = createPOST()(
      new Request('http://localhost/api/ai/chat/new', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    ).then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(settled).toBe(false);
    expect(insert).toHaveBeenCalledWith({
      id: undefined,
      title: 'hello',
      creator_id: 'user-1',
      model: 'gemini-3.1-flash-lite',
    });
    finishWrite({ error: null });
    expect((await response).status).toBe(200);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
