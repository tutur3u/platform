import { beforeEach, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/devboxes/identity-store', () => ({ identityRpc: rpc }));

import { POST } from './route';

beforeEach(() => vi.resetAllMocks());
it('refuses runner credentials without contacting storage', async () => {
  const response = await POST(
    new Request('https://example.test/api/v1/devboxes/usage/ingest', {
      method: 'POST',
      headers: { 'X-Devbox-Runner-Token': `tdbx_${'a'.repeat(64)}` },
    })
  );
  expect(response.status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('authenticated collector reaches the disabled stub', async () => {
  rpc.mockResolvedValue(true);
  const response = await POST(
    new Request('https://example.test/api/v1/devboxes/usage/ingest', {
      method: 'POST',
      headers: { 'X-Devbox-Collector-Token': `tdbc_${'a'.repeat(64)}` },
    })
  );
  expect(response.status).toBe(501);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(rpc).toHaveBeenCalledOnce();
});
