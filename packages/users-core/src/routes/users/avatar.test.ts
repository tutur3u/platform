import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  admin: vi.fn(),
  auth: vi.fn(),
  budget: vi.fn(),
  permissions: vi.fn(),
  sign: vi.fn(),
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
import { handleCreateAvatarUploadRequest, POST } from './avatar';

const context = { params: Promise.resolve({ wsId: 'workspace' }) };
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
  f.permissions.mockResolvedValue({ containsPermission: () => true });
  f.budget.mockResolvedValue(undefined);
  f.sign.mockResolvedValue({
    data: { signedUrl: 'https://storage.test/ticket' },
    error: null,
  });
  f.admin.mockResolvedValue({
    storage: {
      from: () => ({
        createSignedUploadUrl: f.sign,
        getPublicUrl: () => ({
          data: { publicUrl: 'https://storage.test/avatar' },
        }),
      }),
    },
  });
});
it('Web budgets the verified session actor before admin ticket issuance', async () => {
  const req = request();
  expect((await POST(req, context)).status).toBe(200);
  expect(f.permissions).toHaveBeenCalledWith({
    wsId: 'workspace',
    request: req,
    user: { id: 'verified-web' },
  });
  expect(f.budget).toHaveBeenCalledWith('verified-web', 'avatar');
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
    wsId: 'workspace',
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
