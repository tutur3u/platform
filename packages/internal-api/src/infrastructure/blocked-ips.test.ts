import { describe, expect, it, vi } from 'vitest';
import { unblockBlockedIp } from './blocked-ips';

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('blocked IP internal API helpers', () => {
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
