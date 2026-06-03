import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FROM_NPC_ID = '00000000-0000-4000-8000-000000000001';
const TO_NPC_ID = '00000000-0000-4000-8000-000000000002';
const TRADE_ID = '00000000-0000-4000-8000-000000000003';

const mocks = vi.hoisted(() => ({
  acceptHiveTradeOffer: vi.fn(),
  createHiveTradeOffer: vi.fn(),
  requireHiveAccess: vi.fn(),
  requireHiveAdmin: vi.fn(),
}));

vi.mock('@/lib/hive/economy', () => ({
  acceptHiveTradeOffer: (...args: unknown[]) =>
    mocks.acceptHiveTradeOffer(...args),
  createHiveTradeOffer: (...args: unknown[]) =>
    mocks.createHiveTradeOffer(...args),
}));

vi.mock('../../../_shared', async () => {
  const actual =
    await vi.importActual<typeof import('../../../_shared')>(
      '../../../_shared'
    );

  return {
    ...actual,
    requireHiveAccess: (...args: unknown[]) => mocks.requireHiveAccess(...args),
    requireHiveAdmin: (...args: unknown[]) => mocks.requireHiveAdmin(...args),
    withHiveRoute: (
      _request: NextRequest,
      _route: string,
      handler: () => Promise<Response>
    ) => handler(),
  };
});

function tradeRequest(body: unknown) {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/hive/servers/server-1/trades',
    {
      body: JSON.stringify(body),
      method: 'POST',
    }
  );
}

describe('Hive trades route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHiveAccess.mockImplementation(() => {
      throw new Error('requireHiveAccess should not authorize trades');
    });
    mocks.requireHiveAdmin.mockResolvedValue({
      access: { isAdmin: true, user: { id: 'admin-1' } },
      ok: true,
    });
    mocks.createHiveTradeOffer.mockResolvedValue({ id: TRADE_ID });
    mocks.acceptHiveTradeOffer.mockResolvedValue({ accepted: true });
  });

  it('rejects member trade actions before reaching the economy layer', async () => {
    const { POST } = await import('./route');
    mocks.requireHiveAdmin.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json(
        { error: 'Hive admin access required' },
        { status: 403 }
      ),
    });

    const response = await POST(
      tradeRequest({
        action: 'create',
        fromNpcId: FROM_NPC_ID,
        offeredCurrency: 10,
        toNpcId: TO_NPC_ID,
      }),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.createHiveTradeOffer).not.toHaveBeenCalled();
    expect(mocks.acceptHiveTradeOffer).not.toHaveBeenCalled();
  });

  it('allows admins to create server-scoped trade offers', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      tradeRequest({
        action: 'create',
        fromNpcId: FROM_NPC_ID,
        offeredCurrency: 10,
        requestedCurrency: 5,
        toNpcId: TO_NPC_ID,
      }),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.createHiveTradeOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        fromNpcId: FROM_NPC_ID,
        offeredCurrency: 10,
        requestedCurrency: 5,
        serverId: 'server-1',
        toNpcId: TO_NPC_ID,
      })
    );
  });

  it('allows admins to accept server-scoped trade offers', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      tradeRequest({
        acceptingNpcId: TO_NPC_ID,
        action: 'accept',
        tradeId: TRADE_ID,
      }),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.acceptHiveTradeOffer).toHaveBeenCalledWith({
      acceptingNpcId: TO_NPC_ID,
      serverId: 'server-1',
      tradeId: TRADE_ID,
    });
  });
});
