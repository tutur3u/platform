import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  reap: vi.fn(),
}));

vi.mock('@/lib/devboxes/authorization', () => ({
  authorizeDevboxRootAdmin: mocks.authorize,
}));
vi.mock('@/lib/devboxes/admin-runner-control', () => ({
  reapStaleDevboxRuns: mocks.reap,
}));

import { POST } from './route';

const request = () =>
  new Request(
    'http://localhost/api/v1/infrastructure/devboxes/runs/reap-stale',
    { method: 'POST', headers: { origin: 'http://localhost' } }
  );

describe('stale devbox run reaper route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reap.mockResolvedValue({ limit: 200, reaped: 3 });
  });

  it.each([
    [401, 'Unauthorized'],
    [403, 'Forbidden'],
  ])('refuses a %s caller without touching runs', async (status, message) => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message }, { status }),
    });
    expect((await POST(request())).status).toBe(status);
    expect(mocks.reap).not.toHaveBeenCalled();
  });

  it('runs one bounded sweep for a root admin', async () => {
    mocks.authorize.mockResolvedValue({ ok: true, user: { id: 'admin-1' } });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ limit: 200, reaped: 3 });
    expect(mocks.reap).toHaveBeenCalledTimes(1);
  });
});
