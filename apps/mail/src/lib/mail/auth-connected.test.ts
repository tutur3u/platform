import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  membership: vi.fn(),
  reviewer: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: async () => ({}),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: 'owner', email: 'external@example.test' },
  }),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: vi.fn(),
  createAppSessionUser: vi.fn(),
  verifyAppSessionRequest: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: mocks.workspace,
  normalizeWorkspaceId: async () => 'personal-id',
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('./reviewer-access', () => ({ isManagedMailReviewer: mocks.reviewer }));

import { resolveMailRouteContext } from './auth';

const request = new NextRequest('https://mail.example.test/api');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue({ personal: true, joined: true });
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.reviewer.mockResolvedValue(false);
});
it('allows external users to connect personal provider accounts without granting managed mail access', async () => {
  expect((await resolveMailRouteContext(request, 'personal', true)).ok).toBe(
    true
  );
  const managed = await resolveMailRouteContext(request, 'personal');
  expect(managed.ok).toBe(false);
  if (!managed.ok) expect(managed.response.status).toBe(403);
});
it('rejects non-personal and unjoined workspace contexts', async () => {
  for (const workspace of [
    { personal: false, joined: true },
    { personal: true, joined: false },
  ]) {
    mocks.workspace.mockResolvedValueOnce(workspace);
    const result = await resolveMailRouteContext(request, 'workspace', true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  }
});
it('rejects lost membership before reading the personal workspace', async () => {
  mocks.membership.mockResolvedValueOnce({ ok: false });
  const result = await resolveMailRouteContext(request, 'personal', true);
  expect(result.ok).toBe(false);
  expect(mocks.workspace).not.toHaveBeenCalled();
});
