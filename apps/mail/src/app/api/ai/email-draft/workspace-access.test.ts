import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  member: vi.fn(),
  normalize: vi.fn(),
  memory: vi.fn(),
  generate: vi.fn(),
  temp: vi.fn(),
  getUserById: vi.fn(),
}));
vi.mock('@ai-sdk/google', () => ({ google: () => 'model' }));
vi.mock('@tuturuuu/ai/memory', () => ({ withAiMemory: f.memory }));
vi.mock('ai', () => ({ generateObject: f.generate }));
vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: f.temp,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: f.normalize,
  verifyWorkspaceMembershipType: f.member,
  WorkspaceAuthError: class extends Error {},
  WorkspaceNotFoundError: class extends Error {},
}));
vi.mock('@/lib/mail/auth', () => ({ resolveMailRouteContext: vi.fn() }));

import { POST } from './route';

const staff = {
  id: 'staff-id',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-01-01',
  identities: [{ provider: 'email', identity_data: {} }],
};
const workspace = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  f.temp.mockResolvedValue({ status: 'valid', context: { user: staff } });
  f.getUserById.mockResolvedValue({ data: { user: staff }, error: null });
  f.normalize.mockResolvedValue(workspace);
  f.memory.mockResolvedValue('model');
  f.generate.mockResolvedValue({
    object: { content: 'Hello', subject: 'Test' },
  });
});
function request() {
  return new NextRequest('https://mail.test/api/ai/email-draft', {
    method: 'POST',
    body: JSON.stringify({ wsId: 'personal' }),
  });
}
it.each([
  ['nonmember', { ok: false, error: 'membership_missing' }, 403],
  ['guest', { ok: false, error: 'membership_type_mismatch' }, 403],
  ['lookup failure', { ok: false, error: 'membership_lookup_failed' }, 500],
] as const)(
  'denies temporary-auth %s before AI work',
  async (_name, member, status) => {
    f.member.mockResolvedValue(member);
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(f.memory).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.member).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: workspace,
        userId: staff.id,
        requiredType: 'MEMBER',
      })
    );
  }
);
it('attributes authorized temporary-auth work to the canonical workspace', async () => {
  f.member.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(f.memory).toHaveBeenCalledWith(
    expect.objectContaining({ wsId: workspace, userId: staff.id })
  );
});
