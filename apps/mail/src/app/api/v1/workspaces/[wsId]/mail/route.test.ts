import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveMailRouteContext: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@/lib/mail/auth', () => ({
  resolveMailRouteContext: mocks.resolveMailRouteContext,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

import { GET } from './route';

function createQuery(result: { data: unknown[] | null; error: unknown }) {
  const query = {
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue(result),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

describe('workspace mail list route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('returns the app-session-aware authorization response', async () => {
    mocks.resolveMailRouteContext.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest(
        'https://mail.example.com/api/v1/workspaces/personal/mail'
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('queries mail with the normalized workspace from the auth context', async () => {
    const rows = [{ id: 'email-1' }];
    const query = createQuery({ data: rows, error: null });
    const supabase = { from: vi.fn().mockReturnValue(query) };
    mocks.resolveMailRouteContext.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'workspace-1',
        supabase,
        user: { email: 'member@tuturuuu.com', id: 'user-1' },
      },
    });

    const response = await GET(
      new NextRequest(
        'https://mail.example.com/api/v1/workspaces/personal/mail?page=1&pageSize=10'
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(mocks.resolveMailRouteContext).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'personal'
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      wsId: ROOT_WORKSPACE_ID,
      userId: 'user-1',
      supabase,
    });
    expect(supabase.from).toHaveBeenCalledWith('internal_emails');
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.range).toHaveBeenCalledWith(10, 19);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ emails: rows });
  });

  it('rejects non-root-workspace members before reading internal emails', async () => {
    const supabase = { from: vi.fn() };
    mocks.resolveMailRouteContext.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'workspace-1',
        supabase,
        user: { email: 'external@example.com', id: 'user-2' },
      },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: false,
      error: 'membership_missing',
    });

    const response = await GET(
      new NextRequest(
        'https://mail.example.com/api/v1/workspaces/workspace-1/mail'
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(403);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('fails closed with 500 when root membership verification fails', async () => {
    const supabase = { from: vi.fn() };
    mocks.resolveMailRouteContext.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'workspace-1',
        supabase,
        user: { email: 'member@tuturuuu.com', id: 'user-1' },
      },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: false,
      error: 'membership_lookup_failed',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(
      new NextRequest(
        'https://mail.example.com/api/v1/workspaces/workspace-1/mail'
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(500);
    expect(supabase.from).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
