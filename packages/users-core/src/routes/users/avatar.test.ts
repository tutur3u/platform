import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  admin: vi.fn(),
  auth: vi.fn(),
  budget: vi.fn(),
  permissions: vi.fn(),
  sign: vi.fn(),
  bucket: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock(
  '@tuturuuu/storage-core/profile-upload-budget',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@tuturuuu/storage-core/profile-upload-budget')
    >()),
    reserveProfileUploadBudget: f.budget,
  })
);
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: f.auth } })),
  createAdminClient: f.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: f.permissions,
}));

import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
import { GET, handleCreateAvatarUploadRequest, POST } from './avatar';

const workspace = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ wsId: workspace }) };
const request = (
  body = {
    fileName: 'avatar.webp',
    contentType: 'image/webp',
    actorId: 'forged',
  }
) =>
  new Request('https://web.test/api/v1/workspaces/workspace/users/avatar', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  f.auth.mockResolvedValue({
    data: { user: { id: 'verified-web' } },
    error: null,
  });
  f.permissions.mockResolvedValue({
    wsId: workspace,
    containsPermission: () => true,
  });
  f.budget.mockResolvedValue(undefined);
  f.sign.mockResolvedValue({
    data: { signedUrl: 'https://storage.test/ticket' },
    error: null,
  });
  f.bucket.mockReturnValue({
    createSignedUploadUrl: f.sign,
    createSignedUrl: f.sign,
    getPublicUrl: () => ({
      data: { publicUrl: 'https://storage.test/avatar' },
    }),
  });
  f.admin.mockResolvedValue({ storage: { from: f.bucket } });
});
it('Web budgets the verified session actor before admin ticket issuance', async () => {
  const req = request();
  expect((await POST(req, context)).status).toBe(200);
  expect(f.permissions).toHaveBeenCalledWith({
    wsId: workspace,
    request: req,
    user: { id: 'verified-web' },
  });
  expect(f.budget).toHaveBeenCalledWith('verified-web', 'avatar');
  expect(f.bucket).toHaveBeenCalledWith('avatars');
  expect(f.sign).toHaveBeenCalledExactlyOnceWith(
    `${workspace}/users/avatar.webp`
  );
  expect(f.budget.mock.invocationCallOrder[0]).toBeLessThan(
    f.admin.mock.invocationCallOrder[0]!
  );
});
it('Contacts budgets the same injected satellite actor used for workspace authorization', async () => {
  const req = request();
  const actor = { id: 'verified-contacts', email: 'synthetic@example.test' };
  expect(
    (await handleCreateAvatarUploadRequest(req, context, actor)).status
  ).toBe(200);
  expect(f.auth).not.toHaveBeenCalled();
  expect(f.permissions).toHaveBeenCalledWith({
    wsId: workspace,
    request: req,
    user: actor,
  });
  expect(f.budget).toHaveBeenCalledWith(actor.id, 'avatar');
});
it.each([429, 503])(
  'quota denial %s cannot create an admin upload ticket',
  async (status) => {
    f.budget.mockRejectedValue(
      new ProfileUploadError('Denied', status, status === 429 ? 60 : undefined)
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(status);
    expect(response.headers.get('Retry-After')).toBe(
      status === 429 ? '60' : null
    );
    expect(f.admin).not.toHaveBeenCalled();
    expect(f.sign).not.toHaveBeenCalled();
  }
);
it('unrecognized reservation failures fail closed', async () => {
  f.budget.mockRejectedValue(new Error('private backend failure'));
  const response = await POST(request(), context);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private');
  expect(f.sign).not.toHaveBeenCalled();
});
it.each([
  'session',
  'auth-error',
  'membership',
  'permission',
  'body',
  'satellite',
])('rejects invalid %s before charging or signing', async (stage) => {
  if (stage === 'session')
    f.auth.mockResolvedValue({ data: { user: null }, error: null });
  if (stage === 'auth-error')
    f.auth.mockResolvedValue({
      data: { user: { id: 'rejected-user' } },
      error: new Error('Revoked'),
    });
  if (stage === 'membership') f.permissions.mockResolvedValue(null);
  if (stage === 'permission')
    f.permissions.mockResolvedValue({ containsPermission: () => false });
  const response = await handleCreateAvatarUploadRequest(
    stage === 'body'
      ? request({ fileName: '', contentType: '', actorId: 'forged' })
      : request(),
    context,
    stage === 'satellite' ? null : undefined
  );
  expect(response.status).toBe(
    stage === 'permission' ? 403 : stage === 'body' ? 400 : 404
  );
  expect(f.budget).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
});

const getRequest = (path: string) => {
  const url = new URL('https://web.test/avatar');
  url.searchParams.set('path', path);
  return new Request(url);
};
const unsafeNames = [
  '.',
  '..',
  '../avatar.webp',
  '../../other/users/avatar.webp',
  '/avatar.webp',
  'https://foreign.test/avatar.webp',
  'nested/avatar.webp',
  'nested\\avatar.webp',
  '%2e%2e%2favatar.webp',
  '%252e%252e%252favatar.webp',
  '%2Favatar.webp',
  '%5cavatar.webp',
  'avatar%00.webp',
  'avatar\0.webp',
  'avatar.webp\n',
  'avatar.webp?x=1',
  'avatar.webp#x',
];
it.each(unsafeNames)(
  'rejects unsafe read path segment %j before admin access',
  async (name) => {
    const response = await GET(
      getRequest(`${workspace}/users/${name}`),
      context
    );
    expect(response.status).toBe(400);
    expect(f.admin).not.toHaveBeenCalled();
    expect(f.sign).not.toHaveBeenCalled();
  }
);
it.each([
  `${other}/users/avatar.webp`,
  `${workspace}/users/../../${other}/users/avatar.webp`,
  `${workspace}/users/%2e%2e/%2e%2e/${other}/users/avatar.webp`,
  `${workspace}/users//avatar.webp`,
  `${workspace}/users/`,
  `https://storage.test/${workspace}/users/avatar.webp`,
])('rejects foreign or malformed read path %j', async (path) => {
  expect((await GET(getRequest(path), context)).status).toBe(400);
  expect(f.sign).not.toHaveBeenCalled();
});
it('signs only the allowed workspace user object for reads', async () => {
  const path = `${workspace}/users/avatar.webp`;
  expect((await GET(getRequest(path), context)).status).toBe(200);
  expect(f.sign).toHaveBeenCalledExactlyOnceWith(path, 60 * 60 * 24 * 365);
  expect(f.bucket).toHaveBeenCalledExactlyOnceWith('workspaces');
});
it.each(unsafeNames)(
  'rejects unsafe upload filename %j without charging or signing',
  async (fileName) => {
    expect(
      (
        await POST(
          request({ fileName, contentType: 'image/webp', actorId: 'forged' }),
          context
        )
      ).status
    ).toBe(400);
    expect(f.budget).not.toHaveBeenCalled();
    expect(f.admin).not.toHaveBeenCalled();
    expect(f.sign).not.toHaveBeenCalled();
  }
);
it.each([
  'not-a-uuid',
  'personal',
  `${workspace}\n`,
  workspace.replace('11111111', 'abcdefAB'),
])('rejects a noncanonical resolved workspace %j', async (wsId) => {
  f.permissions.mockResolvedValue({ wsId, containsPermission: () => true });
  const invalidContext = { params: Promise.resolve({ wsId }) };
  expect(
    (await GET(getRequest(`${wsId}/users/avatar.webp`), invalidContext)).status
  ).toBe(400);
  expect((await POST(request(), invalidContext)).status).toBe(400);
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.budget).not.toHaveBeenCalled();
});
it.each(['personal', 'workspace-handle', 'internal'])(
  'uses the authorized canonical workspace for alias %s',
  async (wsId) => {
    const aliasContext = { params: Promise.resolve({ wsId }) };
    const path = `${workspace}/users/avatar.webp`;
    expect((await GET(getRequest(path), aliasContext)).status).toBe(200);
    expect((await POST(request(), aliasContext)).status).toBe(200);
    expect(f.sign).toHaveBeenLastCalledWith(path);
  }
);
it.each(['text/html', 'image/svg+xml', 'application/octet-stream'])(
  'rejects unsupported content type %s',
  async (contentType) => {
    expect(
      (
        await POST(
          request({ fileName: 'avatar.webp', contentType, actorId: 'forged' }),
          context
        )
      ).status
    ).toBe(400);
    expect(f.budget).not.toHaveBeenCalled();
    expect(f.sign).not.toHaveBeenCalled();
  }
);
it('denies reads without workspace membership', async () => {
  f.permissions.mockResolvedValue(null);
  expect(
    (await GET(getRequest(`${workspace}/users/avatar.webp`), context)).status
  ).toBe(404);
  expect(f.admin).not.toHaveBeenCalled();
});

it.each([
  '{',
  'null',
  '{"fileName":123,"contentType":"image/webp"}',
  '{"fileName":[],"contentType":"image/webp"}',
])('rejects malformed upload body %s', async (body) => {
  const response = await POST(
    new Request('https://web.test/avatar', { method: 'POST', body }),
    context
  );
  expect(response.status).toBe(400);
  expect(f.budget).not.toHaveBeenCalled();
  expect(f.admin).not.toHaveBeenCalled();
});
