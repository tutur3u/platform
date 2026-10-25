import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  callPrivateChatRpc: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  select: vi.fn(),
  sessionAuth: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, context: { params: Promise<unknown> }) => {
      mocks.sessionAuth(request.method);
      return handler(
        request,
        { supabase: { from: mocks.from }, user: { id: 'authenticated-actor' } },
        await context.params
      );
    },
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: unknown[]) => mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: (error: { code?: string }, message: string) => {
    let status = 500;
    if (error.code === '42501') status = 403;
    if (error.code === '22023') status = 400;
    return Response.json({ code: error.code, message }, { status });
  },
  resolveChatRouteContext: (...args: unknown[]) =>
    mocks.resolveChatRouteContext(...args),
}));

const opId = 'd9287000-0000-4000-8000-000000000001';
const secondOpId = 'd9287000-0000-4000-8000-000000000002';

async function post(body: unknown) {
  const { POST } = await import('./route');
  return POST(
    new NextRequest('http://localhost/api/chat/reactions/retire', {
      body: JSON.stringify(body),
      method: 'POST',
    }),
    { params: Promise.resolve({ wsId: 'personal' }) }
  );
}

describe('reaction operation retirement POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
      select: mocks.select,
    };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.maybeSingle.mockResolvedValue({
      data: { user_id: 'authenticated-actor' },
      error: null,
    });
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'normalized-workspace' },
      ok: true,
    });
    mocks.callPrivateChatRpc.mockImplementation(
      async (_name: string, args: { p_op_ids: string[] }) => ({
        retiredOpIds: [...new Set(args.p_op_ids)].sort(),
      })
    );
  });

  it('retires the exact IDs for the authenticated actor after workspace admission', async () => {
    const response = await post({
      actorUserId: 'forged-actor',
      opIds: [opId],
      p_actor_user_id: 'forged-actor',
      wsId: 'forged-workspace',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ retiredOpIds: [opId] });
    expect(mocks.sessionAuth).toHaveBeenCalledExactlyOnceWith('POST');
    expect(mocks.resolveChatRouteContext).toHaveBeenCalledWith(
      expect.objectContaining({ permission: 'view_chat', wsId: 'personal' })
    );
    expect(mocks.from).toHaveBeenCalledWith('workspace_members');
    expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'normalized-workspace');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'authenticated-actor');
    expect(mocks.maybeSingle).toHaveBeenCalledBefore(mocks.callPrivateChatRpc);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledExactlyOnceWith(
      'chat_retire_reaction_operations',
      { p_actor_user_id: 'authenticated-actor', p_op_ids: [opId] }
    );
  });

  it('allows retrying the same operation IDs without replacing them', async () => {
    const first = await post({ opIds: [secondOpId, opId, opId] });
    const retry = await post({ opIds: [secondOpId, opId, opId] });

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      retiredOpIds: [opId, secondOpId],
    });
    await expect(retry.json()).resolves.toEqual({
      retiredOpIds: [opId, secondOpId],
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(2);
    expect(mocks.callPrivateChatRpc).toHaveBeenNthCalledWith(
      2,
      'chat_retire_reaction_operations',
      {
        p_actor_user_id: 'authenticated-actor',
        p_op_ids: [secondOpId, opId, opId],
      }
    );
  });

  it('accepts the bounded maximum of 100 IDs', async () => {
    const opIds = Array.from(
      { length: 100 },
      (_, n) => `d9287000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`
    );
    const response = await post({ opIds });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ retiredOpIds: opIds });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_retire_reaction_operations',
      { p_actor_user_id: 'authenticated-actor', p_op_ids: opIds }
    );
  });

  it.each([
    {},
    { opIds: null },
    { opIds: [] },
    { opIds: [null] },
    { opIds: ['invalid'] },
    { opIds: [opId, 'invalid'] },
    { opIds: [[opId]] },
    { opIds: opId },
    { opIds: Array.from({ length: 101 }, () => opId) },
  ])('rejects an invalid or oversized operation batch: %j', async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON before any retirement', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new NextRequest('http://localhost/api/chat/reactions/retire', {
        body: '{',
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );
    expect(response.status).toBe(400);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    'stops at request-scoped admission failure %s',
    async (status) => {
      mocks.resolveChatRouteContext.mockResolvedValue({
        ok: false,
        response: Response.json({ message: 'denied' }, { status }),
      });
      expect((await post({ opIds: [opId] })).status).toBe(status);
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    }
  );

  it('requires current workspace membership before the service RPC', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await post({ opIds: [opId] })).status).toBe(403);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it.each(['42501', 'XX000'])(
    'treats membership lookup error %s as 500',
    async (code) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mocks.maybeSingle.mockResolvedValue({ data: null, error: { code } });
        expect((await post({ opIds: [opId] })).status).toBe(500);
        expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    }
  );

  it.each([
    ['PGRST202', 500],
    ['42501', 403],
    ['22023', 400],
    ['P0001', 500],
  ])(
    'does not acknowledge retirement after RPC failure %s',
    async (code, status) => {
      mocks.callPrivateChatRpc.mockRejectedValueOnce({ code });
      const response = await post({ opIds: [opId] });
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.not.toHaveProperty('retiredOpIds');
      expect(mocks.callPrivateChatRpc).toHaveBeenCalledExactlyOnceWith(
        'chat_retire_reaction_operations',
        { p_actor_user_id: 'authenticated-actor', p_op_ids: [opId] }
      );
    }
  );
});
