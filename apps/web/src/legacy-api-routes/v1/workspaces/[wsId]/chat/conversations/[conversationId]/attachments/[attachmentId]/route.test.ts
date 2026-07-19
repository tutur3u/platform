import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  auth: {
    supabase: null,
    user: { id: 'user-1' },
  },
  callPrivateChatRpc: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  resolveChatRouteContext: vi.fn(),
};

class MockWorkspaceStorageError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, mocks.auth, await routeContext?.params),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () =>
    Response.json(
      { message: 'Failed to sign chat attachment' },
      { status: 500 }
    ),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageSignedReadUrl>
  ) => mocks.createWorkspaceStorageSignedReadUrl(...args),
  WorkspaceStorageError: MockWorkspaceStorageError,
}));

function createRequest(conversationId: string) {
  return new Request(
    `http://localhost/api/v1/workspaces/workspace-1/chat/conversations/${conversationId}/attachments/attachment-1`
  );
}

async function callRoute(conversationId: string) {
  const { GET } = await import('./route');
  return await GET(createRequest(conversationId) as never, {
    params: Promise.resolve({
      attachmentId: 'attachment-1',
      conversationId,
      wsId: 'workspace-1',
    }),
  });
}

describe('chat attachment signed URL route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.callPrivateChatRpc.mockResolvedValue({
      storagePath: 'AI Agent Imports/zalo/photo.jpg',
      storageWsId: 'workspace-1',
    });
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://drive.example/signed-photo'
    );
  });

  it('uses the external mirror RPC for imported AI-agent media', async () => {
    const response = await callRoute('ai-agent-thread-thread-1');

    expect(response.status).toBe(200);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'ai_agent_external_get_attachment',
      expect.objectContaining({
        p_attachment_id: 'attachment-1',
        p_conversation_id: 'ai-agent-thread-thread-1',
      })
    );
    expect(await response.json()).toEqual({
      signedUrl: 'https://drive.example/signed-photo',
    });
  });

  it('keeps native chat attachments on the existing RPC', async () => {
    await callRoute('conversation-1');

    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_get_attachment',
      expect.objectContaining({ p_conversation_id: 'conversation-1' })
    );
  });
});
