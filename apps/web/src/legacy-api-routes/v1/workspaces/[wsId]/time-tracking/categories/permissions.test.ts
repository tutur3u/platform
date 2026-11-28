import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSessionAuthContext: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  getPermissions: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveSessionAuthContext,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
  getPermissions: mocks.getPermissions,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { DELETE, PATCH } from './[categoryId]/route';
import { POST as COPY } from './copy/route';
import { POST as CREATE } from './route';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const CAT_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000010';

describe('time-tracking categories write permission enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      user: { id: USER_ID },
      supabase: {},
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: true,
      membershipType: 'member',
    });
  });

  it('allows POST /categories for an active workspace member without manager permissions', async () => {
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: CAT_ID, name: 'Engineering' },
              error: null,
            }),
          }),
        }),
      }),
    });

    const response = await CREATE(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WS_ID}/time-tracking/categories`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Engineering' }),
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('rejects PATCH and DELETE /categories/[categoryId] with 403 when caller lacks both permissions', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => true,
    });

    const patchRes = await PATCH(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WS_ID}/time-tracking/categories/${CAT_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Renamed' }),
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID, categoryId: CAT_ID }) }
    );
    expect(patchRes.status).toBe(403);

    const deleteRes = await DELETE(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WS_ID}/time-tracking/categories/${CAT_ID}`,
        { method: 'DELETE' }
      ),
      { params: Promise.resolve({ wsId: WS_ID, categoryId: CAT_ID }) }
    );
    expect(deleteRes.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects POST /categories/copy with 403 when caller lacks both permissions', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => true,
    });

    const response = await COPY(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WS_ID}/time-tracking/categories/copy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceWorkspaceId: '00000000-0000-4000-8000-000000000099',
            categoryIds: [CAT_ID],
          }),
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID }) }
    );

    expect(response.status).toBe(403);
  });
});
