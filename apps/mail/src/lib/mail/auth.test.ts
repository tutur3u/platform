import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getWorkspace: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveUser: vi.fn(),
  reviewer: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: vi.fn(),
  createAppSessionUser: vi.fn(),
  verifyAppSessionRequest: vi.fn(() => ({ ok: false })),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveUser,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: mocks.createClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: mocks.getWorkspace,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));
vi.mock('./reviewer-access', () => ({ isManagedMailReviewer: mocks.reviewer }));

import { resolveMailRouteContext } from './auth';

const request = new NextRequest(
  'https://mail.tuturuuu.com/api/v1/workspaces/personal/mail/bootstrap'
);

describe('Mail route reviewer boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.resolveUser.mockResolvedValue({
      authError: null,
      user: { id: 'reviewer-1', email: 'app-review-ios@tutur3u.com' },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('personal-workspace');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.reviewer.mockResolvedValue(true);
    mocks.getWorkspace.mockResolvedValue({ joined: true, personal: true });
  });

  it('allows a tagged reviewer only in their personal workspace', async () => {
    const result = await resolveMailRouteContext(request, 'personal');
    expect(result.ok).toBe(true);
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'reviewer-1',
        wsId: 'personal-workspace',
      })
    );
    mocks.getWorkspace.mockResolvedValue({ joined: true, personal: false });
    const shared = await resolveMailRouteContext(request, 'shared-workspace');
    expect(shared.ok).toBe(false);
    if (!shared.ok) expect(shared.response.status).toBe(403);
  });

  it('rejects an untagged external identity before any workspace query', async () => {
    mocks.reviewer.mockResolvedValue(false);
    const result = await resolveMailRouteContext(request, 'personal');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
  });

  it('still requires workspace membership for a tagged reviewer', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
    const result = await resolveMailRouteContext(request, 'personal');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
