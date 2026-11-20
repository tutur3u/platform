import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permissions: vi.fn(),
  getUserById: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.session,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
  })),
}));

import { QA_OPERATOR_PERMISSION, requireQaOperator } from './authorization';

const operatorId = '11111111-1111-4111-8111-111111111111';
const staff = {
  id: operatorId,
  email: 'operator@tuturuuu.com',
  email_confirmed_at: '2026-11-01T00:00:00Z',
  identities: [{ provider: 'google', identity_data: {} }],
  app_metadata: {},
};
const request = () =>
  new Request('https://tuturuuu.com/api/v1/admin/qa/test-users');
const allow = (granted: string[]) =>
  mocks.permissions.mockResolvedValue({
    containsPermission: (permission: string) => granted.includes(permission),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ ok: true, user: { id: operatorId } });
  mocks.getUserById.mockResolvedValue({ data: { user: staff }, error: null });
  allow([QA_OPERATOR_PERMISSION]);
});

describe('requireQaOperator', () => {
  it('admits a verified staff operator with the QA permission', async () => {
    const access = await requireQaOperator(request());
    expect(access.ok).toBe(true);
    expect(mocks.permissions).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: '00000000-0000-0000-0000-000000000000' })
    );
  });

  it('passes through an unauthenticated response', async () => {
    mocks.session.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const access = await requireQaOperator(request());
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(401);
  });

  it('denies a staff user without the root permission', async () => {
    allow(['manage_workspace_members']);
    const access = await requireQaOperator(request());
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(403);
  });

  it.each([
    ['a non-staff address', { ...staff, email: 'person@example.com' }],
    [
      'a QA test account on the staff domain',
      {
        ...staff,
        email: 'qa+abcd1234-1@tuturuuu.com',
        app_metadata: { qa_test: true },
      },
    ],
    ['a banned account', { ...staff, banned_until: '2999-01-01T00:00:00Z' }],
    [
      'a different subject',
      { ...staff, id: '22222222-2222-4222-8222-222222222222' },
    ],
  ])('denies %s', async (_label, user) => {
    mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
    const access = await requireQaOperator(request());
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(403);
  });

  it('fails closed when identity verification is unavailable', async () => {
    mocks.getUserById.mockResolvedValue({
      data: { user: null },
      error: new Error('down'),
    });
    const access = await requireQaOperator(request());
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(503);
  });
});
