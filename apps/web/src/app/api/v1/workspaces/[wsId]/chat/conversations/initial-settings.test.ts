import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as settingsRoute from '@/legacy-api-routes/v1/workspaces/[wsId]/chat/conversations/[conversationId]/ai-settings/route';

const ws = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const chat = '44444444-4444-4444-8444-444444444444';
const personal = '55555555-5555-4555-8555-555555555555';
const tuple = {
  modelId: 'google/gemini-test',
  creditSource: 'workspace',
  creditWsId: ws,
  thinkingMode: 'thinking',
};
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  context: vi.fn(),
  resolveModel: vi.fn(),
  personal: vi.fn(),
  publish: vi.fn(),
  user: { id: '33333333-3333-4333-8333-333333333333' },
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        req: Request,
        auth: unknown,
        params: unknown
      ) => Promise<Response>
    ) =>
    (req: Request, context: { params: Promise<unknown> }) =>
      context.params.then((params) =>
        handler(req, { user: mocks.user, supabase: {} }, params)
      ),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/chat/private-rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chat/private-rpc')>()),
  resolveChatRouteContext: (...args: unknown[]) => mocks.context(...args),
  callPrivateChatRpc: (...args: unknown[]) => mocks.rpc(...args),
}));
vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  resolvePlanModel: (...args: unknown[]) => mocks.resolveModel(...args),
}));
vi.mock('@tuturuuu/ai/credits/model-mapping', () => ({
  normalizeStableModelId: (value: string) =>
    value === 'alias/model' ? 'google/canonical' : value,
  normalizeAiModelId: (value: string) => value,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => mocks.personal(),
      };
      return chain;
    },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
}));
vi.mock('@/lib/ai-agents/external-chat-mirror', () => ({
  listAiAgentExternalThreadConversations: vi.fn(),
}));
vi.mock('@/lib/chat/agent-discovery', () => ({
  listAiChatConversations: vi.fn(),
  listRootAiAgentDiscoveryConversations: vi.fn(),
}));
vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({}),
  publishChatRealtimeEvent: (...args: unknown[]) => mocks.publish(...args),
}));

function receipt(
  settings: unknown = {
    ...tuple,
    actorUserId: actor,
    wsId: ws,
    conversationId: chat,
  }
) {
  return {
    id: chat,
    wsId: ws,
    type: 'ai',
    createdBy: actor,
    createdAt: '2026-10-18T00:00:00.000Z',
    members: [],
    initialAiSettings: settings,
  };
}
async function create(body: unknown) {
  const { POST } = await import('./route');
  return POST(
    new Request('https://fixture.test/api', {
      method: 'POST',
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ wsId: ws }) }
  );
}

describe('actual native creation initial tuple boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: ws,
        permissions: { withoutPermission: (p: string) => p === 'manage_chat' },
      },
    });
    mocks.rpc.mockResolvedValue(receipt());
    mocks.resolveModel.mockResolvedValue({
      modelId: tuple.modelId,
      source: 'requested',
    });
    mocks.personal.mockResolvedValue({ data: { id: personal }, error: null });
  });
  for (const withTuple of [false, true]) {
    it(`normalizes canonical SQL creation timestamp, initial tuple=${withTuple}`, async () => {
      mocks.rpc.mockResolvedValue({
        ...receipt(),
        createdAt: '2026-10-18 00:15:00.123456+05:30',
      });
      const response = await create({
        type: 'ai',
        ...(withTuple ? { initialAiSettings: tuple } : {}),
      });
      expect(response.status).toBe(201);
      expect((await response.json()).conversation.createdAt).toBe(
        '2026-10-17T18:45:00.123456Z'
      );
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    });
  }
  for (const createdAt of [
    '2026-02-29 00:00:00+00',
    '2026-10-18 00:00:00+24',
    '2026-10-18 00:00:00.1234567+00',
  ]) {
    it(`holds invalid committed timestamp ${createdAt} without replacement RPC`, async () => {
      mocks.rpc.mockResolvedValue({ ...receipt(), createdAt });
      const response = await create({ type: 'ai', initialAiSettings: tuple });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      expect(mocks.publish).not.toHaveBeenCalled();
      expect((await response.json()).code).not.toBe(
        'chat_create_invalid_request'
      );
    });
  }
  it('admits view/create without manage and passes full tuple to one canonical RPC', async () => {
    const response = await create({
      type: 'ai',
      modelId: tuple.modelId,
      initialAiSettings: tuple,
    });
    expect(response.status).toBe(201);
    expect(mocks.context).toHaveBeenCalledWith(
      expect.objectContaining({ permission: 'view_chat' })
    );
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      'chat_create_conversation',
      {
        p_actor_user_id: actor,
        p_ws_id: ws,
        p_input: {
          type: 'ai',
          modelId: tuple.modelId,
          initialAiSettings: tuple,
        },
      }
    );
    expect((await response.json()).conversation.initialAiSettings).toEqual(
      receipt().initialAiSettings
    );
  });
  it('preserves explicit null workspace scope in durable receipt', async () => {
    const initial = { ...tuple, creditWsId: null };
    mocks.rpc.mockResolvedValue(
      receipt({
        ...initial,
        actorUserId: actor,
        conversationId: chat,
        wsId: ws,
      })
    );
    expect(
      (await create({ type: 'ai', initialAiSettings: initial })).status
    ).toBe(201);
    expect(mocks.resolveModel).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: ws })
    );
  });
  it('resolves personal billing from actor membership, preserving null scope', async () => {
    const initial = { ...tuple, creditSource: 'personal', creditWsId: null };
    mocks.rpc.mockResolvedValue(
      receipt({
        ...initial,
        actorUserId: actor,
        conversationId: chat,
        wsId: ws,
      })
    );
    expect(
      (await create({ type: 'ai', initialAiSettings: initial })).status
    ).toBe(201);
    expect(mocks.resolveModel).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: personal })
    );
  });
  for (const source of ['workspace', 'personal']) {
    it(`denies arbitrary cross-workspace ${source} credits before RPC`, async () => {
      expect(
        (
          await create({
            type: 'ai',
            initialAiSettings: {
              ...tuple,
              creditSource: source,
              creditWsId: chat,
            },
          })
        ).status
      ).toBe(403);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  }
  it('rejects a noncanonical model before any creation rather than changing intent', async () => {
    expect(
      (
        await create({
          type: 'ai',
          initialAiSettings: { ...tuple, modelId: 'alias/model' },
        })
      ).status
    ).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('preserves create route authorization failure before RPC or billing', async () => {
    mocks.context.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 403 }),
    });
    expect(
      (await create({ type: 'ai', initialAiSettings: tuple })).status
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });
  it('reports personal lookup errors as server failures, not permission denials', async () => {
    mocks.personal.mockResolvedValue({
      data: null,
      error: { message: 'synthetic failure' },
    });
    expect(
      (
        await create({
          type: 'ai',
          initialAiSettings: {
            ...tuple,
            creditSource: 'personal',
            creditWsId: null,
          },
        })
      ).status
    ).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects an actor without a personal credit workspace before creation', async () => {
    mocks.personal.mockResolvedValue({ data: null, error: null });
    expect(
      (
        await create({
          type: 'ai',
          initialAiSettings: {
            ...tuple,
            creditSource: 'personal',
            creditWsId: null,
          },
        })
      ).status
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not silently replace a disallowed selected model', async () => {
    mocks.resolveModel.mockResolvedValue({
      source: 'plan_default',
      modelId: 'google/default',
    });
    expect(
      (await create({ type: 'ai', initialAiSettings: tuple })).status
    ).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  for (const settings of [
    null,
    { ...tuple },
    { ...tuple, actorUserId: chat, conversationId: chat, wsId: ws },
    { ...tuple, actorUserId: actor, conversationId: actor, wsId: ws },
    { ...tuple, actorUserId: actor, conversationId: chat, wsId: chat },
    {
      ...tuple,
      modelId: 'foreign/model',
      actorUserId: actor,
      conversationId: chat,
      wsId: ws,
    },
  ]) {
    it('holds malformed or mismatched committed receipt without second RPC', async () => {
      mocks.rpc.mockResolvedValue(receipt(settings));
      const response = await create({ type: 'ai', initialAiSettings: tuple });
      expect([400, 500]).toContain(response.status);
      expect((await response.json()).code).not.toBe(
        'chat_create_invalid_request'
      );
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      expect(mocks.publish).not.toHaveBeenCalled();
    });
  }
  for (const type of ['direct', 'group', 'channel']) {
    it(`rejects initial tuple on ${type} without RPC`, async () => {
      expect((await create({ type, initialAiSettings: tuple })).status).toBe(
        400
      );
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  }
  it('retains the real settings handler manage_chat denial for later edits', async () => {
    const response = await settingsRoute.PATCH(
      new Request('https://fixture.test/settings', {
        method: 'PATCH',
        body: JSON.stringify(tuple),
      }) as never,
      { params: Promise.resolve({ wsId: ws, conversationId: chat }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
