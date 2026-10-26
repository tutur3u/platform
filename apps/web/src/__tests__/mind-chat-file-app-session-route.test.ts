import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDynamicAdminClient: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  serverLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  verifyWorkspaceMembershipType: vi.fn(),
  withSessionAuth: vi.fn((handler: unknown, _options: unknown) => handler),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options?: unknown) =>
    mocks.withSessionAuth(handler, options),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: () => mocks.createDynamicAdminClient(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

type ChatFileRoutePost = (
  request: Request,
  context: { supabase: unknown; user: { id: string } }
) => Promise<Response>;

const chatId = '11111111-1111-4111-8111-111111111111';

function aiChatLookup(creatorId: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: creatorId ? { creator_id: creatorId } : null,
    error: null,
  });
  return vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
  }));
}

function createRouteContext() {
  return {
    supabase: { from: vi.fn() },
    user: { id: 'user-1' },
  };
}

describe('Mind chat file routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.withSessionAuth.mockClear();
    mocks.withSessionAuth.mockImplementation(
      (handler: unknown, _options: unknown) => handler
    );
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
  });

  const appSessionAuthOptions = {
    allowAppSessionAuth: { targetApp: ['mind', 'chat'] },
  };

  it.each<[string, () => Promise<unknown>, Record<string, unknown>]>([
    [
      'upload-url',
      () => import('@/legacy-api-routes/ai/chat/upload-url/route'),
      {
        allowAiTempAuth: true,
        ...appSessionAuthOptions,
        rateLimit: { windowMs: 60000, maxRequests: 60 },
      },
    ],
    [
      'delete-file',
      () => import('@/legacy-api-routes/ai/chat/delete-file/route'),
      {
        allowAiTempAuth: true,
        ...appSessionAuthOptions,
        rateLimit: { windowMs: 60000, maxRequests: 120 },
      },
    ],
    [
      'file-urls',
      () => import('@/legacy-api-routes/ai/chat/file-urls/route'),
      {
        allowAiTempAuth: true,
        ...appSessionAuthOptions,
        rateLimitKind: 'read',
      },
    ],
  ])(
    'accepts Mind and Chat app-session auth for %s',
    async (_, loadRoute, expectedOptions) => {
      await loadRoute();

      expect(mocks.withSessionAuth).toHaveBeenCalledWith(
        expect.any(Function),
        expectedOptions
      );
    }
  );

  it('normalizes upload-url workspaces with the authenticated app-session context', async () => {
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.com/upload',
        token: 'upload-token',
      },
      error: null,
    });
    mocks.createDynamicAdminClient.mockResolvedValue({
      from: aiChatLookup('user-1'),
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl,
        })),
      },
    });

    const request = new Request(
      'https://mind.tuturuuu.com/api/ai/chat/upload-url',
      {
        body: JSON.stringify({
          chatId,
          filename: 'Tuturuuu Technical Planning.jpg',
          wsId: 'personal',
        }),
        method: 'POST',
      }
    );
    const context = createRouteContext();
    const { POST } = (await import(
      '@/legacy-api-routes/ai/chat/upload-url/route'
    )) as unknown as {
      POST: ChatFileRoutePost;
    };

    const response = await POST(request, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      path: expect.stringMatching(
        /^ws-1\/chats\/ai\/resources\/11111111-1111-4111-8111-111111111111\/\d+_Tuturuuu_Technical_Planning\.jpg$/u
      ),
      signedUrl: 'https://storage.example.com/upload',
      token: 'upload-token',
    });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      context.supabase,
      request
    );
    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(
        /^ws-1\/chats\/ai\/resources\/11111111-1111-4111-8111-111111111111\/\d+_Tuturuuu_Technical_Planning\.jpg$/u
      ),
      { upsert: false }
    );
  });

  it('normalizes delete-file workspaces with the authenticated app-session context', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    mocks.createDynamicAdminClient.mockResolvedValue({
      from: aiChatLookup('user-1'),
      storage: {
        from: vi.fn(() => ({
          remove,
        })),
      },
    });

    const request = new Request(
      'https://mind.tuturuuu.com/api/ai/chat/delete-file',
      {
        body: JSON.stringify({
          path: `ws-1/chats/ai/resources/${chatId}/123_file.jpg`,
          wsId: 'personal',
        }),
        method: 'POST',
      }
    );
    const context = createRouteContext();
    const { POST } = (await import(
      '@/legacy-api-routes/ai/chat/delete-file/route'
    )) as unknown as {
      POST: ChatFileRoutePost;
    };

    const response = await POST(request, context);

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      context.supabase,
      request
    );
    expect(remove).toHaveBeenCalledWith([
      `ws-1/chats/ai/resources/${chatId}/123_file.jpg`,
    ]);
  });

  it('rejects upload-url for a chat owned by another user', async () => {
    const createSignedUploadUrl = vi.fn();
    mocks.createDynamicAdminClient.mockResolvedValue({
      from: aiChatLookup('user-2'),
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    });
    const { POST } = (await import(
      '@/legacy-api-routes/ai/chat/upload-url/route'
    )) as unknown as { POST: ChatFileRoutePost };

    const response = await POST(
      new Request('https://web.tuturuuu.com/api/ai/chat/upload-url', {
        body: JSON.stringify({ chatId, filename: 'a.png', wsId: 'ws-1' }),
        method: 'POST',
      }),
      createRouteContext()
    );

    expect(response.status).toBe(403);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('allows upload-url for a chat id that does not exist yet', async () => {
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload', token: 't' },
      error: null,
    });
    mocks.createDynamicAdminClient.mockResolvedValue({
      from: aiChatLookup(null),
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    });
    const { POST } = (await import(
      '@/legacy-api-routes/ai/chat/upload-url/route'
    )) as unknown as { POST: ChatFileRoutePost };

    const response = await POST(
      new Request('https://web.tuturuuu.com/api/ai/chat/upload-url', {
        body: JSON.stringify({ chatId, filename: 'a.png', wsId: 'ws-1' }),
        method: 'POST',
      }),
      createRouteContext()
    );

    expect(response.status).toBe(200);
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'another user temp folder',
      'ws-1/chats/ai/resources/temp/user-2/1_a.png',
      null,
    ],
    [
      'a chat owned by another user',
      `ws-1/chats/ai/resources/${chatId}/1_a.png`,
      'user-2',
    ],
    [
      'a chat folder with no chat row',
      `ws-1/chats/ai/resources/${chatId}/1_a.png`,
      null,
    ],
  ])('rejects delete-file for %s', async (_, path, creatorId) => {
    const remove = vi.fn();
    mocks.createDynamicAdminClient.mockResolvedValue({
      from: aiChatLookup(creatorId),
      storage: { from: vi.fn(() => ({ remove })) },
    });
    const { POST } = (await import(
      '@/legacy-api-routes/ai/chat/delete-file/route'
    )) as unknown as { POST: ChatFileRoutePost };

    const response = await POST(
      new Request('https://web.tuturuuu.com/api/ai/chat/delete-file', {
        body: JSON.stringify({ path, wsId: 'ws-1' }),
        method: 'POST',
      }),
      createRouteContext()
    );

    expect(response.status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects delete-file for non-chat folders without a lookup', async () => {
    const remove = vi.fn();
    const from = aiChatLookup('user-1');
    mocks.createDynamicAdminClient.mockResolvedValue({
      from,
      storage: { from: vi.fn(() => ({ remove })) },
    });
    const { POST } = (await import(
      '@/legacy-api-routes/ai/chat/delete-file/route'
    )) as unknown as { POST: ChatFileRoutePost };

    const response = await POST(
      new Request('https://web.tuturuuu.com/api/ai/chat/delete-file', {
        body: JSON.stringify({
          path: 'ws-1/chats/ai/resources/not-a-chat/1_a.png',
          wsId: 'ws-1',
        }),
        method: 'POST',
      }),
      createRouteContext()
    );

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('normalizes file-urls workspaces with the authenticated app-session context', async () => {
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          created_at: '2026-05-22T00:00:00.000Z',
          id: 'file-1',
          metadata: { size: 512 },
          name: '123_Tuturuuu_Technical_Planning.jpg',
        },
      ],
      error: null,
    });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{ signedUrl: 'https://storage.example.com/read' }],
      error: null,
    });
    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: {
        from: vi.fn(() => ({
          createSignedUrls,
          list,
        })),
      },
    });

    const request = new Request(
      'https://mind.tuturuuu.com/api/ai/chat/file-urls',
      {
        body: JSON.stringify({
          chatId,
          wsId: 'personal',
        }),
        method: 'POST',
      }
    );
    const context = createRouteContext();
    const { POST } = (await import(
      '@/legacy-api-routes/ai/chat/file-urls/route'
    )) as unknown as {
      POST: ChatFileRoutePost;
    };

    const response = await POST(request, context);

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      context.supabase,
      request
    );
    expect(list).toHaveBeenCalledWith(
      `ws-1/chats/ai/resources/${chatId}`,
      expect.any(Object)
    );
    expect(createSignedUrls).toHaveBeenCalledWith(
      [`ws-1/chats/ai/resources/${chatId}/123_Tuturuuu_Technical_Planning.jpg`],
      3600
    );
  });
});
