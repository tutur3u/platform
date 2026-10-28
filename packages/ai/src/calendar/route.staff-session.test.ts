import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  user: vi.fn(),
  member: vi.fn(),
  normalize: vi.fn(),
  memory: vi.fn(),
  stream: vi.fn(),
}));
vi.mock('@ai-sdk/google', () => ({ google: () => 'model' }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ auth: { getUser: f.user } }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: f.normalize,
  verifyWorkspaceMembershipType: f.member,
  WorkspaceAuthError: class extends Error {},
  WorkspaceNotFoundError: class extends Error {},
}));
vi.mock('../memory', () => ({ withAiMemory: f.memory }));
vi.mock('ai', () => ({ Output: { object: () => ({}) }, streamText: f.stream }));

import { POST } from './route';

const staff = {
  id: 'staff-id',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-01-01',
  identities: [],
};
const workspace = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  f.user.mockResolvedValue({ data: { user: staff }, error: null });
  f.normalize.mockResolvedValue(workspace);
  f.memory.mockResolvedValue('model');
  f.stream.mockReturnValue({
    toTextStreamResponse: () => Response.json({ ok: true }),
  });
});
function request(withWorkspace = true) {
  return new Request('https://calendar.test/api/events/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Schedule a meeting',
      current_time: '2026-01-01T00:00:00Z',
      ...(withWorkspace ? { wsId: 'personal' } : {}),
    }),
  });
}
it.each([
  ['nonmember', { ok: false, error: 'membership_missing' }, 403],
  ['guest', { ok: false, error: 'membership_type_mismatch' }, 403],
  ['lookup failure', { ok: false, error: 'membership_lookup_failed' }, 500],
] as const)(
  'denies %s before memory or generation',
  async (_name, member, status) => {
    f.member.mockResolvedValue(member);
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(f.memory).not.toHaveBeenCalled();
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.member).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: workspace,
        userId: staff.id,
        requiredType: 'MEMBER',
      })
    );
  }
);
it('uses the canonical authorized workspace for memory attribution', async () => {
  f.member.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(f.memory).toHaveBeenCalledWith(
    expect.objectContaining({ wsId: workspace, userId: staff.id })
  );
});
it('checks membership for the default workspace too', async () => {
  f.member.mockResolvedValue({ ok: false, error: 'membership_missing' });
  const response = await POST(request(false));
  expect(response.status).toBe(403);
  expect(f.normalize).toHaveBeenCalledWith(
    '00000000-0000-0000-0000-000000000000',
    expect.anything(),
    expect.anything()
  );
  expect(f.stream).not.toHaveBeenCalled();
});
it.each([
  [
    'foreign identity',
    {
      ...staff,
      identities: [{ provider: 'azure', identity_data: { tid: 'foreign' } }],
    },
    'approved',
    403,
  ],
  [
    'missing configuration',
    {
      ...staff,
      identities: [{ provider: 'azure', identity_data: { tid: 'approved' } }],
    },
    undefined,
    403,
  ],
  [
    'approved identity',
    {
      ...staff,
      identities: [{ provider: 'azure', identity_data: { tid: 'approved' } }],
    },
    'approved',
    200,
  ],
  [
    'unconfirmed email',
    { ...staff, email_confirmed_at: undefined },
    'approved',
    403,
  ],
  [
    'lookalike',
    { ...staff, email: 'staff@tuturuuu.com.evil' },
    'approved',
    403,
  ],
] as const)(
  'checks staff session: %s',
  async (_name, user, configured, status) => {
    vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
    f.user.mockResolvedValue({ data: { user }, error: null });
    f.member.mockResolvedValue({ ok: true });
    const response = await POST(request());
    expect(response.status).toBe(status);
    if (status === 403) {
      expect(f.memory).not.toHaveBeenCalled();
      expect(f.stream).not.toHaveBeenCalled();
    }
  }
);
