import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  CoordinationUnavailableError,
  coordinate,
  coordinationKey,
} from './coordination';

const input = {
  namespace: 'authenticator' as const,
  key: 'a'.repeat(64),
  owner: '0199619a-9154-7000-8000-000000000001',
  action: 'acquire' as const,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup() {
  vi.stubEnv('CLOUDFLARE_COORDINATION_URL', 'https://coordination.example.com');
  vi.stubEnv(
    'CLOUDFLARE_COORDINATION_TOKEN',
    'test-only-placeholder'.repeat(3)
  );
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      Response.json({ outcome: 'acquired', fresh: true, completed: false })
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
describe('server coordination client', () => {
  it('hashes identities and sends bounded uncached authenticated requests', async () => {
    const fetchMock = setup();
    expect(coordinationKey('user')).toMatch(/^[a-f0-9]{64}$/);
    await expect(coordinate(input)).resolves.toMatchObject({
      outcome: 'acquired',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://coordination.example.com/v1/coordinate'),
      expect.objectContaining({
        cache: 'no-store',
        redirect: 'error',
        method: 'POST',
        signal: expect.any(AbortSignal),
      })
    );
  });
  it('fails closed without configuration or with an insecure URL', async () => {
    const fetchMock = setup();
    for (const url of [
      '',
      'http://example.com',
      'https://user:password@example.com',
    ]) {
      vi.stubEnv('CLOUDFLARE_COORDINATION_URL', url);
      await expect(coordinate(input)).rejects.toBeInstanceOf(
        CoordinationUnavailableError
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sanitizes provider failures and does not retry ambiguous mutations', async () => {
    const fetchMock = setup();
    fetchMock.mockRejectedValueOnce(new Error('sensitive provider detail'));
    await expect(coordinate(input)).rejects.toThrow(
      'Shared coordination is temporarily unavailable'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(Response.json({ unexpected: 'value' }));
    await expect(coordinate(input)).rejects.toBeInstanceOf(
      CoordinationUnavailableError
    );
    fetchMock.mockResolvedValueOnce(
      new Response('private error', { status: 503 })
    );
    await expect(coordinate(input)).rejects.toBeInstanceOf(
      CoordinationUnavailableError
    );
  });
});
