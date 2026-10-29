import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const guard = vi.hoisted(() => vi.fn(async () => null));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: guard,
}));

import { proxy } from './proxy';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('SR-263 SDK storage demo admission', () => {
  it.each(['production', 'test'])(
    'denies storage requests in %s before consulting the SDK',
    async (mode) => {
      vi.stubEnv('NODE_ENV', mode);
      expect(
        (await proxy(new NextRequest('http://localhost/api/storage/delete')))
          .status
      ).toBe(403);
      expect(guard).not.toHaveBeenCalled();
    }
  );
  it('retains the development demo rate limit', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      (await proxy(new NextRequest('http://localhost/api/storage/list'))).status
    ).toBe(200);
    expect(guard).toHaveBeenCalledOnce();
  });
});
