import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    supabase: { from: vi.fn() },
    user: { id: 'user-1' },
  },
  callPrivateChatRpc: vi.fn(),
  getPermissions: vi.fn(),
  listAiAgentExternalThreadConversations: vi.fn(),
  listAiChatConversations: vi.fn(),
  listRootAiAgentDiscoveryConversations: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
  resolveChatRouteContext: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('@/lib/ai-agents/external-chat-mirror', () => ({
  listAiAgentExternalThreadConversations: (
    ...args: Parameters<typeof mocks.listAiAgentExternalThreadConversations>
  ) => mocks.listAiAgentExternalThreadConversations(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, mocks.auth, await routeContext?.params),
}));

vi.mock('@/lib/chat/agent-discovery', () => ({
  listAiChatConversations: (
    ...args: Parameters<typeof mocks.listAiChatConversations>
  ) => mocks.listAiChatConversations(...args),
  listRootAiAgentDiscoveryConversations: (
    ...args: Parameters<typeof mocks.listRootAiAgentDiscoveryConversations>
  ) => mocks.listRootAiAgentDiscoveryConversations(...args),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () =>
    Response.json(
      { message: 'Failed to load chat conversations' },
      { status: 500 }
    ),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({ conversationId: 'conversation-1' }),
  publishChatRealtimeEvent: (
    ...args: Parameters<typeof mocks.publishChatRealtimeEvent>
  ) => mocks.publishChatRealtimeEvent(...args),
}));

function virtualAgentConversation(includeAdminMetadata: boolean) {
  return {
    aiEnabled: true,
    archivedAt: null,
    createdAt: '2026-06-02T00:00:00.000Z',
    createdBy: null,
    description: 'discord agent channel',
    id: 'ai-agent-1',
    latestMessage: null,
    memberCount: 0,
    members: [],
    metadata: {
      readOnly: true,
      source: 'ai-agent',
      ...(includeAdminMetadata
        ? {
            agentId: 'agent-1',
            channelId: 'channel-1',
          }
        : {}),
    },
    title: 'Agent / Discord',
    type: 'ai',
    unreadCount: 0,
    updatedAt: '2026-06-02T00:00:00.000Z',
    wsId: ROOT_WORKSPACE_ID,
  };
}

function mockRouteContext(wsId = ROOT_WORKSPACE_ID) {
  mocks.resolveChatRouteContext.mockResolvedValue({
    context: { normalizedWsId: wsId },
    ok: true,
  });
}

async function callGet(wsId = ROOT_WORKSPACE_ID) {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/chat/conversations`
    ) as never,
    {
      params: Promise.resolve({ wsId }),
    }
  );
}

describe('workspace chat conversations route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteContext();
    mocks.callPrivateChatRpc.mockResolvedValue([]);
    mocks.getPermissions.mockResolvedValue({
      permissions: ['manage_workspace_secrets'],
      withoutPermission: () => false,
    });
    mocks.listAiAgentExternalThreadConversations.mockResolvedValue([]);
    mocks.listAiChatConversations.mockResolvedValue([]);
    mocks.listRootAiAgentDiscoveryConversations.mockImplementation(
      async (input: { includeAdminMetadata?: boolean }) => [
        virtualAgentConversation(Boolean(input.includeAdminMetadata)),
      ]
    );
  });

  it('includes virtual AI-agent IDs for root AI-agent admins', async () => {
    const response = await callGet();

    expect(response.status).toBe(200);
    const payloadText = await response.clone().text();
    await expect(response.json()).resolves.toMatchObject({
      conversations: [
        {
          metadata: {
            agentId: 'agent-1',
            channelId: 'channel-1',
            readOnly: true,
            source: 'ai-agent',
          },
        },
      ],
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: mocks.auth.user,
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(mocks.listRootAiAgentDiscoveryConversations).toHaveBeenCalledWith({
      includeAdminMetadata: true,
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(payloadText).not.toContain('webhookUrl');
  });

  it('omits virtual AI-agent IDs for non-admin chat viewers', async () => {
    mocks.getPermissions.mockResolvedValue({
      permissions: ['view_chat'],
      withoutPermission: () => true,
    });

    const response = await callGet();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      conversations: [
        {
          metadata: {
            readOnly: true,
            source: 'ai-agent',
          },
        },
      ],
    });
    expect(payload.conversations[0].metadata).not.toHaveProperty('agentId');
    expect(payload.conversations[0].metadata).not.toHaveProperty('channelId');
    expect(mocks.listRootAiAgentDiscoveryConversations).toHaveBeenCalledWith({
      includeAdminMetadata: false,
      wsId: ROOT_WORKSPACE_ID,
    });
  });

  it('omits virtual AI-agent IDs when only inherited admin access is present', async () => {
    mocks.getPermissions.mockResolvedValue({
      permissions: ['admin'],
      withoutPermission: () => false,
    });

    const response = await callGet();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.conversations[0].metadata).toEqual({
      readOnly: true,
      source: 'ai-agent',
    });
    expect(mocks.listRootAiAgentDiscoveryConversations).toHaveBeenCalledWith({
      includeAdminMetadata: false,
      wsId: ROOT_WORKSPACE_ID,
    });
  });

  it('does not check root AI-agent admin permission outside the root workspace', async () => {
    mockRouteContext('workspace-1');

    const response = await callGet('workspace-1');

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.listRootAiAgentDiscoveryConversations).toHaveBeenCalledWith({
      includeAdminMetadata: false,
      wsId: 'workspace-1',
    });
  });
});
