// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  readAudit: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorize,
}));
vi.mock('@/lib/feature-flags/platform-feature-flag-store', () => ({
  asPrivateRpcAdmin: (admin: unknown) => admin,
  readPlatformFeatureFlagAudit: mocks.readAudit,
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({
    ok: true,
    sbAdmin: {},
    user: { id: '44444444-4444-4444-8444-444444444444' },
  });
});

describe('feature flag audit route', () => {
  it('rejects an unbounded limit before reading audit rows', async () => {
    const response = await GET(new Request('http://localhost/audit?limit=101'));
    expect(response.status).toBe(400);
    expect(mocks.readAudit).not.toHaveBeenCalled();
  });

  it('returns denial without reading storage', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    expect((await GET(new Request('http://localhost/audit'))).status).toBe(403);
    expect(mocks.readAudit).not.toHaveBeenCalled();
  });
});
