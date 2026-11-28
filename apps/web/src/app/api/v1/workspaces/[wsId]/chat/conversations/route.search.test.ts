import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { supabase: {}, user: { id: 'user-1' } },
  callPrivateChatRpc: vi.fn(),
  canModerateChat: vi.fn(),
  listAiAgentExternalThreadConversations: vi.fn(),
  listAiChatConversations: vi.fn(),
  listRootAiAgentDiscoveryConversations: vi.fn(),
  resolveChatRouteContext: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    permissions: [],
    withoutPermission: () => false,
  }),
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
vi.mock('@/lib/chat/safety', () => ({
  getChatBlockedUserIds: async () => new Set<string>(),
  hideBlockedPreviews: <T,>(conversations: T[]) => conversations,
}));
vi.mock('@/lib/chat/moderation', () => ({
  canModerateChat: (...args: Parameters<typeof mocks.canModerateChat>) =>
    mocks.canModerateChat(...args),
}));
vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () => Response.json({}, { status: 500 }),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));
vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({}),
  publishChatRealtimeEvent: vi.fn(),
}));

const WS_A = '00000000-0000-4000-8000-00000000000a';
const WS_B = '00000000-0000-4000-8000-00000000000b';

function conversation(
  id: string,
  title: string | null,
  others: string[],
  updatedAt: string
) {
  return {
    id,
    members: [
      { user: { displayName: 'Minh Tran', id: 'user-1' }, userId: 'user-1' },
      ...others.map((name, index) => ({
        user: { displayName: name, handle: null, id: `${id}-${index}` },
        userId: `${id}-${index}`,
      })),
    ],
    title,
    type: title === null ? 'direct' : 'channel',
    updatedAt,
    wsId: WS_A,
  };
}

const conversations = [
  conversation(
    'design',
    'Design review',
    ['Ada Lovelace'],
    '2026-11-26T09:00:00Z'
  ),
  conversation('dm-linh', null, ['Phạm Lĩnh'], '2026-11-26T08:00:00Z'),
  conversation('general', 'General', ['Grace Hopper'], '2026-11-26T07:00:00Z'),
  conversation('ops', 'Ops', ['Linh Nguyen'], '2026-11-26T06:00:00Z'),
];

/** Moderators per workspace, as `has_workspace_permission` would answer. */
const moderators: Record<string, string[]> = { [WS_B]: ['user-1'] };

async function callGet(wsId: string, query = '') {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/chat/conversations${query}`
    ) as never,
    { params: Promise.resolve({ wsId }) }
  );
}

describe('conversation search and moderation flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.user.id = 'user-1';
    mocks.resolveChatRouteContext.mockImplementation(
      async ({ wsId }: { wsId: string }) => ({
        context: { normalizedWsId: wsId },
        ok: true,
      })
    );
    mocks.callPrivateChatRpc.mockResolvedValue(conversations);
    mocks.canModerateChat.mockImplementation(
      async ({ actorUserId, wsId }: { actorUserId: string; wsId: string }) =>
        moderators[wsId]?.includes(actorUserId) ?? false
    );
    mocks.listAiAgentExternalThreadConversations.mockResolvedValue([]);
    mocks.listAiChatConversations.mockResolvedValue([]);
    mocks.listRootAiAgentDiscoveryConversations.mockResolvedValue([]);
  });

  it("searches the viewer's own conversation list by title and members", async () => {
    const response = await callGet(WS_A, '?q=LINH&limit=1');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(
      payload.conversations.map((item: { id: string }) => item.id)
    ).toEqual(['dm-linh']);
    expect(payload.nextOffset).toBe(1);
    // Only the actor-scoped list RPC is searched: nothing the viewer
    // cannot list can match.
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_list_conversations',
      expect.objectContaining({
        p_actor_user_id: 'user-1',
        p_limit: null,
        p_ws_id: WS_A,
      })
    );

    const next = await (await callGet(WS_A, '?q=linh&limit=1&offset=1')).json();
    expect(next.conversations.map((item: { id: string }) => item.id)).toEqual([
      'ops',
    ]);
    expect(next.nextOffset).toBeNull();
  });

  it("does not match the viewer's own name", async () => {
    const payload = await (await callGet(WS_A, '?q=minh')).json();
    expect(payload.conversations).toEqual([]);
  });

  it('rejects short queries and external scope', async () => {
    expect((await callGet(WS_A, '?q=a')).status).toBe(400);
    expect((await callGet(WS_A, '?q=li&scope=external')).status).toBe(400);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('refuses a viewer without chat access before listing or flagging', async () => {
    mocks.resolveChatRouteContext.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Unauthorized' }, { status: 403 }),
    });

    const response = await callGet(WS_A, '?q=design');

    expect(response.status).toBe(403);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    expect(mocks.canModerateChat).not.toHaveBeenCalled();
  });

  it('flags a member without moderate_chat as not moderating', async () => {
    mocks.auth.user.id = 'user-2';
    const payload = await (await callGet(WS_B, '?limit=10')).json();
    expect(payload.canModerate).toBe(false);
  });

  it('flags a moderator of the workspace', async () => {
    const payload = await (await callGet(WS_B, '?limit=10')).json();
    expect(payload.canModerate).toBe(true);
    expect(mocks.canModerateChat).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      wsId: WS_B,
    });
  });

  it("does not carry one workspace's moderation into another", async () => {
    // user-1 moderates WS_B only.
    const payload = await (await callGet(WS_A, '?limit=10')).json();
    expect(payload.canModerate).toBe(false);
    expect(mocks.canModerateChat).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      wsId: WS_A,
    });
  });
});
