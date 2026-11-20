import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createTicket: vi.fn(),
  loadConversation: vi.fn(),
  resolveContext: vi.fn(),
}));

const actorId = 'a6742000-0000-4000-8000-000000000001';
const wsId = 'a6742000-0000-4000-8000-000000000011';
const roomWorkspaceId = 'a6742000-0000-4000-8000-000000000012';
const conversationId = 'a6742000-0000-4000-8000-000000000021';
const ticket = {
  expiresAt: '2026-11-20T05:30:00.000Z',
  ticket: 'synthetic-ticket',
  url: 'wss://realtime.example.test/v1/connect',
};

vi.mock('next/server', async (load) => ({
  ...(await load<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (...args: unknown[]) => unknown) => (request: NextRequest) =>
      handler(request, { user: { id: actorId } }, { wsId: 'personal' }),
}));
vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: mocks.loadConversation,
  chatRpcErrorResponse: () =>
    NextResponse.json({ message: 'Denied' }, { status: 403 }),
  resolveChatRouteContext: mocks.resolveContext,
}));
vi.mock('@/lib/chat/realtime-worker', () => ({
  createChatRealtimeSubscribeTicket: mocks.createTicket,
}));

import { GET } from './route';

function get(query = '') {
  return GET(
    new NextRequest(
      `https://web.example.test/api/chat/realtime/ticket${query}`
    ),
    { params: Promise.resolve({ wsId: 'personal' }) }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolveContext.mockResolvedValue({
    ok: true,
    context: { normalizedWsId: wsId },
  });
  mocks.loadConversation.mockResolvedValue({
    id: conversationId,
    wsId: roomWorkspaceId,
  });
  mocks.createTicket.mockResolvedValue(ticket);
});

describe('chat realtime ticket route', () => {
  it('issues a private inbox ticket for the authenticated user in the normalized workspace', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      enabled: true,
      ...ticket,
    });
    expect(mocks.loadConversation).not.toHaveBeenCalled();
    expect(mocks.createTicket).toHaveBeenCalledWith({ userId: actorId, wsId });
  });

  it('checks conversation access through the private RPC before minting', async () => {
    const response = await get(`?conversationId=${conversationId}`);

    expect(response.status).toBe(200);
    expect(mocks.loadConversation).toHaveBeenCalledWith(
      'chat_get_conversation',
      {
        p_actor_user_id: actorId,
        p_conversation_id: conversationId,
        p_ws_id: wsId,
      }
    );
    expect(mocks.createTicket).toHaveBeenCalledWith({
      conversationId,
      userId: actorId,
      wsId: roomWorkspaceId,
    });
  });

  it('refuses a missing conversation or an RPC denial without minting', async () => {
    mocks.loadConversation.mockResolvedValueOnce(null).mockRejectedValueOnce({
      code: '42501',
    });

    expect((await get(`?conversationId=${conversationId}`)).status).toBe(404);
    expect((await get(`?conversationId=${conversationId}`)).status).toBe(403);
    expect(mocks.createTicket).not.toHaveBeenCalled();
  });

  it('refuses a workspace permission denial and a malformed conversation ID', async () => {
    mocks.resolveContext.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({}, { status: 403 }),
    });

    expect((await get()).status).toBe(403);
    expect((await get('?conversationId=wrong')).status).toBe(400);
    expect(mocks.loadConversation).not.toHaveBeenCalled();
    expect(mocks.createTicket).not.toHaveBeenCalled();
  });

  it('returns polling mode when a Worker ticket is unavailable', async () => {
    mocks.createTicket.mockResolvedValue(null);
    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ enabled: false });
  });
});
