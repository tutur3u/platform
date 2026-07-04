import { describe, expect, it, vi } from 'vitest';
import {
  blockBlockedIp,
  listBlockedIps,
  unblockBlockedIp,
} from './blocked-ips';

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('blocked IP internal API helpers', () => {
  it('lists blocked IPs through the infrastructure API with explicit all-status filtering', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        count: 1,
        data: [],
        page: 2,
        pageSize: 10,
        totalPages: 1,
      })
    );

    await listBlockedIps(
      {
        page: 2,
        pageSize: 10,
        q: '203.0.113',
        status: '',
      },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);

    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe(
      'https://web.test/api/v1/infrastructure/blocked-ips'
    );
    expect(parsedUrl.searchParams.get('ip')).toBe('203.0.113');
    expect(parsedUrl.searchParams.get('page')).toBe('2');
    expect(parsedUrl.searchParams.get('pageSize')).toBe('10');
    expect(parsedUrl.searchParams.get('status')).toBe('all');
    expect(init).toEqual(
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('blocks an IP through the infrastructure API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: {
          id: 'blocked-ip-1',
          ip_address: '203.0.113.10',
        },
        message: 'IP blocked',
      })
    );

    await blockBlockedIp(
      {
        blockLevel: 2,
        ipAddress: '203.0.113.10',
        notes: 'Manual investigation',
        reason: 'manual',
      },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://web.test/api/v1/infrastructure/blocked-ips',
      expect.objectContaining({
        body: JSON.stringify({
          block_level: 2,
          ip_address: '203.0.113.10',
          notes: 'Manual investigation',
          reason: 'manual',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('content-type')).toBe(
      'application/json'
    );
  });

  it('unblocks an IP through the infrastructure API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'IP unblocked' }));

    await unblockBlockedIp(
      {
        ipAddress: '203.0.113.10',
        reason: 'Cleared from diagnostics',
      },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://web.test/api/v1/infrastructure/blocked-ips',
      expect.objectContaining({
        body: JSON.stringify({
          ip_address: '203.0.113.10',
          reason: 'Cleared from diagnostics',
        }),
        cache: 'no-store',
        method: 'DELETE',
      })
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('content-type')).toBe(
      'application/json'
    );
  });
});
