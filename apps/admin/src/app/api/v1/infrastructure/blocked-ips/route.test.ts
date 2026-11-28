import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  authorize: vi.fn(),
  list: vi.fn(),
  stores: vi.fn(),
  edge: vi.fn(),
  del: vi.fn(),
  mget: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/infrastructure/ip-operator', () => ({
  authorizeIpOperator: mock.authorize,
}));
vi.mock('@/lib/infrastructure/ip-block-store', async (original) => ({
  ...(await original<typeof import('@/lib/infrastructure/ip-block-store')>()),
  allBlockStores: () => [{ del: mock.del, mget: mock.mget }],
  getBlockStores: mock.stores,
  listIpBlocks: mock.list,
  readEdgeBlock: mock.edge,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import { DELETE, GET, POST } from './route';

const ip = '203.0.113.10';

function request(method: string, body?: unknown, query = '') {
  return new Request(
    `https://infrastructure.example/api/v1/infrastructure/blocked-ips${query}`,
    {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

describe('IP block operator route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const existing = { data: [], error: null };
    const builder = {
      eq: vi.fn(() => builder),
      gt: vi.fn().mockResolvedValue(existing),
    };
    mock.update.mockReturnValue(builder);
    mock.audit.mockResolvedValue({ error: null });
    const state = new Map<string, unknown>([
      [`ip:blocked:${ip}`, 'edge-only-block'],
      [`ip:block:level:${ip}`, 1],
    ]);
    mock.del.mockImplementation(
      (...keys: string[]) => keys.filter((key) => state.delete(key)).length
    );
    mock.mget.mockImplementation((...keys: string[]) =>
      keys.map((key) => state.get(key) ?? null)
    );
    mock.edge.mockResolvedValue({ block: null, unreadable: false });
    mock.stores.mockResolvedValue({ edge: {} });
    mock.authorize.mockResolvedValue({
      ok: true,
      user: { id: 'operator-id' },
      sbAdmin: {
        from: (table: string) =>
          table === 'abuse_events'
            ? { insert: mock.audit }
            : { select: () => builder, update: mock.update },
      },
    });
  });

  it.each([DELETE, POST])(
    'requires a reason before reading or writing block state',
    async (handler) => {
      expect(
        (await handler(request(handler.name, { ip_address: ip, reason: ' ' })))
          .status
      ).toBe(400);
      expect(mock.stores).not.toHaveBeenCalled();
    }
  );

  it('refuses a CIDR even if force is submitted', async () => {
    expect(
      (
        await DELETE(
          request('DELETE', {
            ip_address: `${ip}/24`,
            reason: 'Incident',
            force: true,
          })
        )
      ).status
    ).toBe(400);
    expect(mock.audit).not.toHaveBeenCalled();
  });

  it('audits an edge-only unblock before deleting either key and records completion', async () => {
    mock.edge.mockResolvedValue({
      unreadable: false,
      block: {
        id: 'edge:id',
        reason: 'api_abuse',
        expires_at: '2026-12-01T00:00:00Z',
      },
    });
    const response = await DELETE(
      request('DELETE', { ip_address: ip, reason: 'Prober fixed' })
    );
    expect(response.status).toBe(200);
    expect(mock.del).toHaveBeenCalledWith(
      `ip:blocked:${ip}`,
      `ip:block:level:${ip}`
    );
    expect(mock.audit.mock.invocationCallOrder[0]).toBeLessThan(
      mock.del.mock.invocationCallOrder[0] ?? 0
    );
    expect(mock.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        success: true,
        ip_address: ip,
        metadata: expect.objectContaining({
          actor: 'operator-id',
          reason: 'Prober fixed',
          before: {
            unreadableEdgeRecord: false,
            database: [],
            edge: {
              id: 'edge:id',
              reason: 'api_abuse',
              expires_at: '2026-12-01T00:00:00Z',
            },
          },
          after: { blocked: false, expiresAt: null },
        }),
      })
    );
  });

  it('keeps enforcement in place when the audit intent cannot be written', async () => {
    mock.edge.mockResolvedValue({
      unreadable: false,
      block: {
        id: 'edge:id',
        reason: 'api_abuse',
        expires_at: '2026-12-01T00:00:00Z',
      },
    });
    mock.audit.mockResolvedValue({ error: { message: 'unavailable' } });
    expect(
      (
        await DELETE(
          request('DELETE', { ip_address: ip, reason: 'Prober fixed' })
        )
      ).status
    ).toBe(503);
    expect(mock.del).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('fails closed when the proxy store still has either block key', async () => {
    mock.edge.mockResolvedValue({
      unreadable: false,
      block: {
        id: 'edge:id',
        reason: 'api_abuse',
        expires_at: '2026-12-01T00:00:00Z',
      },
    });
    mock.mget.mockResolvedValue([null, 2]);
    expect(
      (
        await DELETE(
          request('DELETE', { ip_address: ip, reason: 'Prober fixed' })
        )
      ).status
    ).toBe(503);
    expect(mock.audit).toHaveBeenCalledTimes(1);
  });

  it('clears an unreadable edge record without recording its raw value', async () => {
    mock.edge.mockResolvedValue({ block: null, unreadable: true });
    const response = await DELETE(
      request('DELETE', { ip_address: ip, reason: 'Clear malformed entry' })
    );
    expect(response.status).toBe(200);
    expect(mock.mget).toHaveBeenCalledWith(
      `ip:blocked:${ip}`,
      `ip:block:level:${ip}`
    );
  });

  it('passes a partial IP search to the shared listing', async () => {
    mock.list.mockResolvedValue({ data: [], count: 0, edgeComplete: true });
    expect((await GET(request('GET', undefined, '?q=203.0.113'))).status).toBe(
      200
    );
    expect(mock.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: '203.0.113' })
    );
  });
});
