import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  managedMailbox: vi.fn(),
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
vi.mock('./mailbox-notification-access', () => ({
  hasManagedMailMailbox: mocks.managedMailbox,
}));
vi.mock('./reviewer-access', () => ({ isManagedMailReviewer: mocks.reviewer }));

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveMailRouteContext } from './auth';

const request = new NextRequest(
  'https://mail.tuturuuu.com/api/v1/workspaces/personal/mail/bootstrap'
);

describe('Mail route reviewer boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.managedMailbox.mockResolvedValue(false);
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
  it('allows only a persisted managed subdomain owner in their own workspace', async () => {
    mocks.resolveUser.mockResolvedValue({
      authError: null,
      user: { id: 'subdomain-owner', email: 'owner@team.tuturuuu.com' },
    });
    mocks.reviewer.mockResolvedValue(false);
    mocks.managedMailbox.mockResolvedValue(true);
    const result = await resolveMailRouteContext(request, 'personal');
    expect(result.ok).toBe(true);
    expect(mocks.managedMailbox).toHaveBeenCalledWith({
      id: 'subdomain-owner',
      email: 'owner@team.tuturuuu.com',
    });
    mocks.getWorkspace.mockResolvedValue({ joined: true, personal: false });
    const shared = await resolveMailRouteContext(request, 'shared');
    expect(shared.ok).toBe(false);
    if (!shared.ok) expect(shared.response.status).toBe(403);
  });
  it('fails closed when configured-domain authority is unavailable', async () => {
    mocks.managedMailbox.mockRejectedValue(new Error('fixture DB unavailable'));
    const result = await resolveMailRouteContext(request, 'personal');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
  });
});

describe('Mail staff domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.managedMailbox.mockResolvedValue(false);
    mocks.reviewer.mockResolvedValue(false);
    mocks.normalizeWorkspaceId.mockResolvedValue('personal-workspace');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getWorkspace.mockResolvedValue({ joined: true, personal: true });
  });

  it.each([
    ['staff@tuturuuu.com', true],
    ['staff@xwf.tuturuuu.com', false],
  ])('grants staff Mail access only to exact-domain %s', async (email, ok) => {
    const user = {
      id: 'staff-1',
      email,
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'email', identity_data: {} }],
    };
    mocks.resolveUser.mockResolvedValue({ authError: null, user });
    vi.mocked(createAdminClient).mockResolvedValue({
      auth: {
        admin: { getUserById: async () => ({ data: { user }, error: null }) },
      },
    } as unknown as Awaited<ReturnType<typeof createAdminClient>>);
    const result = await resolveMailRouteContext(request, 'personal');
    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
