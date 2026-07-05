import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  auth: {
    supabase: null,
    user: { id: 'user-1' },
  },
  callPrivateChatRpc: vi.fn(),
  createWorkspaceStorageUploadPayload: vi.fn(),
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
      { message: 'Failed to prepare chat attachment' },
      { status: 500 }
    ),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageUploadPayload: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageUploadPayload>
  ) => mocks.createWorkspaceStorageUploadPayload(...args),
  WorkspaceStorageError: MockWorkspaceStorageError,
}));

function createRequest() {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/conversation-1/attachments/upload-url',
    {
      body: JSON.stringify({
        contentType: 'text/plain',
        filename: 'notes.txt',
        sizeBytes: 10,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

describe('chat attachment upload URL route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires create_chat before preparing attachment upload URLs', async () => {
    mocks.resolveChatRouteContext.mockResolvedValue({
      ok: false,
      response: Response.json(
        { message: 'Insufficient chat permissions' },
        { status: 403 }
      ),
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(403);
    expect(mocks.resolveChatRouteContext).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: 'create_chat',
        wsId: 'workspace-1',
      })
    );
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });
});
