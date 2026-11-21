import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  admin: vi.fn(),
  permissions: vi.fn(),
  release: vi.fn(),
  bearer: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.cookie,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/utils/platform-release', () => ({
  getPlatformReleaseInfo: mocks.release,
}));

import { GET } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ auth: { getUser: mocks.bearer } });
  mocks.bearer.mockResolvedValue({ data: { user: null }, error: null });
  mocks.cookie.mockResolvedValue({ id: 'cookie-admin' });
  mocks.permissions.mockResolvedValue({
    membershipType: 'MEMBER',
    containsPermission: (permission: string) =>
      permission === 'view_infrastructure',
  });
  mocks.release.mockReturnValue({
    app: 'infrastructure',
    platformVersion: 'fixture-version',
    commitSha: 'fixture-sha',
  });
});

function request(authorization?: string) {
  return new Request('https://infra.example.test/api/build-info', {
    headers: authorization === undefined ? {} : { authorization },
  });
}

it('rejects signed-out requests before reading metadata', async () => {
  mocks.cookie.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect(mocks.release).not.toHaveBeenCalled();
  expect(mocks.permissions).not.toHaveBeenCalled();
});

it.each(['GUEST', undefined])(
  'rejects %s root membership before metadata',
  async (membershipType) => {
    mocks.permissions.mockResolvedValue({
      membershipType,
      containsPermission: () => true,
    });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.release).not.toHaveBeenCalled();
  }
);

it('requires view_infrastructure even for root members', async () => {
  mocks.permissions.mockResolvedValue({
    membershipType: 'MEMBER',
    containsPermission: () => false,
  });
  expect((await GET(request())).status).toBe(403);
  expect(mocks.release).not.toHaveBeenCalled();
});

it.each(['Bearer invalid', 'Bearer', 'Basic invalid', ''])(
  'rejects authorization %s without eligible-cookie fallback',
  async (authorization) => {
    expect((await GET(request(authorization))).status).toBe(401);
    expect(mocks.cookie).not.toHaveBeenCalled();
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  }
);

it('retains payload and no-store headers for eligible cookies and checks every request', async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
  expect(await response.json()).toEqual(mocks.release.mock.results[0]?.value);
  expect(mocks.release).toHaveBeenCalledWith('infrastructure');
  mocks.cookie.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect(mocks.release).toHaveBeenCalledTimes(1);
});

it('authorizes the bearer identity with root permissions', async () => {
  mocks.bearer.mockResolvedValue({
    data: { user: { id: 'bearer-admin' } },
    error: null,
  });
  expect((await GET(request('Bearer valid'))).status).toBe(200);
  expect(mocks.bearer).toHaveBeenCalledWith('valid');
  expect(mocks.cookie).not.toHaveBeenCalled();
  expect(mocks.permissions).toHaveBeenCalledWith({
    wsId: '00000000-0000-0000-0000-000000000000',
    user: { id: 'bearer-admin' },
  });
});
