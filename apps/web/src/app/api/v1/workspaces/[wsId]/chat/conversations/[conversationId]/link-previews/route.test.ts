import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: {
    supabase: { from: vi.fn() },
    user: { id: 'user-1' },
  },
  callPrivateChatRpc: vi.fn(),
  canAccessAiChatConversation: vi.fn(),
  createAdminClient: vi.fn(),
  fetchChatLinkPreview: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  selectExistingPreviews: vi.fn(),
  upsertPreview: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, mocks.auth, await routeContext?.params),
}));

vi.mock('@/lib/chat/agent-discovery', () => ({
  canAccessAiChatConversation: (
    ...args: Parameters<typeof mocks.canAccessAiChatConversation>
  ) => mocks.canAccessAiChatConversation(...args),
  isAiChatConversationId: (conversationId: string) =>
    conversationId.startsWith('ai-chat-'),
}));

vi.mock('@/lib/chat/link-preview', () => ({
  fetchChatLinkPreview: (
    ...args: Parameters<typeof mocks.fetchChatLinkPreview>
  ) => mocks.fetchChatLinkPreview(...args),
  normalizeChatPreviewUrl: (value: string) => {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  },
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () =>
    Response.json({ message: 'Failed to load link previews' }, { status: 500 }),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

function createPrivateClientMock() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: mocks.selectExistingPreviews,
      })),
      upsert: mocks.upsertPreview,
    })),
  };
}

function mockRouteContext() {
  mocks.resolveChatRouteContext.mockResolvedValue({
    context: { normalizedWsId: 'workspace-1' },
    ok: true,
  });
}

async function callRoute(urls: string[]) {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/link-previews', {
      body: JSON.stringify({ urls }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }) as never,
    {
      params: Promise.resolve({
        conversationId: 'ai-chat-owned-chat',
        wsId: 'workspace-1',
      }),
    }
  );
}

describe('chat link preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteContext();
    mocks.canAccessAiChatConversation.mockResolvedValue(true);
    mocks.createAdminClient.mockResolvedValue({
      schema: vi.fn(() => createPrivateClientMock()),
    });
    mocks.upsertPreview.mockResolvedValue({ error: null });
  });

  it('sanitizes cached preview image URLs before returning them', async () => {
    mocks.selectExistingPreviews.mockResolvedValue({
      data: [
        {
          description: 'Cached description',
          error: null,
          failed_at: null,
          fetched_at: '2026-06-01T00:00:00.000Z',
          image_url: 'https://tracker.example/pixel.png',
          normalized_url: 'https://example.com/article',
          site_name: 'Example',
          title: 'Cached title',
          url: 'https://example.com/article',
        },
      ],
      error: null,
    });

    const response = await callRoute(['https://example.com/article#viewer']);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      previews: [
        {
          description: 'Cached description',
          error: null,
          imageUrl: null,
          siteName: 'Example',
          title: 'Cached title',
          url: 'https://example.com/article',
        },
      ],
    });
    expect(mocks.fetchChatLinkPreview).not.toHaveBeenCalled();
  });

  it('stores fresh fetched previews without remote image URLs', async () => {
    mocks.selectExistingPreviews.mockResolvedValue({ data: [], error: null });
    mocks.fetchChatLinkPreview.mockResolvedValue({
      description: 'Fresh description',
      imageUrl: 'https://tracker.example/pixel.png',
      siteName: 'Example',
      title: 'Fresh title',
      url: 'https://example.com/fresh',
    });

    const response = await callRoute(['https://example.com/fresh']);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      previews: [
        {
          description: 'Fresh description',
          imageUrl: null,
          siteName: 'Example',
          title: 'Fresh title',
          url: 'https://example.com/fresh',
        },
      ],
    });
    expect(mocks.upsertPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        image_url: null,
        normalized_url: 'https://example.com/fresh',
      }),
      { onConflict: 'normalized_url' }
    );
  });
});
