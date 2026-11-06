// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorize,
}));

import { GET } from './route';

beforeEach(() => vi.resetAllMocks());
it('conceals failed root authorization, passing the request into the existing authorizer', async () => {
  mocks.authorize.mockResolvedValue({
    ok: false,
    response: new Response(null, { status: 403 }),
  });
  const request = new Request(
    'https://infrastructure.tuturuuu.com/api/v1/ops-hub/status'
  );
  expect((await GET(request)).status).toBe(404);
  expect(mocks.authorize).toHaveBeenCalledWith(
    'view_infrastructure',
    true,
    request
  );
});
it('conceals auth backend exceptions', async () => {
  mocks.authorize.mockRejectedValue(new Error('unavailable'));
  expect(
    (
      await GET(
        new Request('https://infrastructure.tuturuuu.com/api/v1/ops-hub/status')
      )
    ).status
  ).toBe(404);
});
