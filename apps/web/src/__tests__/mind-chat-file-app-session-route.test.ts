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
      () => import('@/app/api/ai/chat/upload-url/route'),
      {
        allowAiTempAuth: true,
        ...appSessionAuthOptions,
        rateLimit: { windowMs: 60000, maxRequests: 60 },
      },
    ],
    [
      'delete-file',
      () => import('@/app/api/ai/chat/delete-file/route'),
      {
        allowAiTempAuth: true,
        ...appSessionAuthOptions,
        rateLimit: { windowMs: 60000, maxRequests: 120 },
      },
    ],
    [
      'file-urls',
      () => import('@/app/api/ai/chat/file-urls/route'),
      {
        allowAiTempAuth: true,
        ...appSessionAuthOptions,
        rateLimitKind: 'read',
      },
    ],
  ])('accepts Mind and Chat app-session auth for %s', async (_, loadRoute, expectedOptions) => {
    await loadRoute();

    expect(mocks.withSessionAuth).toHaveBeenCalledWith(
      expect.any(Function),
      expectedOptions
    );
  });

  it('normalizes upload-url workspaces with the authenticated app-session context', async () => {
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.com/upload',
        token: 'upload-token',
      },
      error: null,
    });
    mocks.createDynamicAdminClient.mockResolvedValue({
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
      '@/app/api/ai/chat/upload-url/route'
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
      { upsert: true }
    );
  });

  it('normalizes delete-file workspaces with the authenticated app-session context', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    mocks.createDynamicAdminClient.mockResolvedValue({
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
      '@/app/api/ai/chat/delete-file/route'
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
      '@/app/api/ai/chat/file-urls/route'
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
