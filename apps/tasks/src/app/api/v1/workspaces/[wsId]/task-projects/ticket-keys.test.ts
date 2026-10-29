import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  result: { data: null as unknown, error: null as unknown },
  insert: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: unknown,
        params: unknown
      ) => Promise<Response>
    ) =>
    (request: NextRequest) =>
      handler(
        request,
        { supabase: {}, user: { id: 'actor' } },
        { wsId: 'workspace', projectId: 'project' }
      ),
}));

import { PUT } from './[projectId]/route';
import { POST } from './route';

function request(body: unknown, method: string) {
  return new NextRequest(
    'http://localhost/api/v1/workspaces/workspace/task-projects',
    { method, body: JSON.stringify(body) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.normalizeWorkspaceId.mockResolvedValue('workspace');
  mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  mocks.getPermissions.mockResolvedValue({ containsPermission: () => true });
  mocks.result = {
    data: {
      id: 'project',
      name: 'Platform',
      ticket_key: 'PLA',
      next_ticket_number: 1,
    },
    error: null,
  };
  const query = {
    insert: mocks.insert,
    update: mocks.update,
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
  mocks.insert.mockReturnValue(query);
  mocks.update.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.single.mockImplementation(async () => mocks.result);
  query.maybeSingle.mockImplementation(async () => mocks.result);
  mocks.createAdminClient.mockResolvedValue({ from: vi.fn(() => query) });
});

describe('project ticket key routes', () => {
  it.each(['pla', '1PLA', 'A', 'ABCDEFGHIJK', 'PL-A', null])(
    'rejects invalid key %s on create and update',
    async (ticket_key) => {
      expect(
        (
          await POST(request({ name: 'Platform', ticket_key }, 'POST'), {
            params: Promise.resolve({ wsId: 'workspace' }),
          })
        ).status
      ).toBe(400);
      expect(
        (
          await PUT(request({ ticket_key }, 'PUT'), {
            params: Promise.resolve({
              wsId: 'workspace',
              projectId: 'project',
            }),
          })
        ).status
      ).toBe(400);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );
  it('accepts generated keys on create and explicit keys on update', async () => {
    const created = await POST(request({ name: 'Platform' }, 'POST'), {
      params: Promise.resolve({ wsId: 'workspace' }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ ticket_key: 'PLA' });
    const updated = await PUT(request({ ticket_key: 'PLA' }, 'PUT'), {
      params: Promise.resolve({ wsId: 'workspace', projectId: 'project' }),
    });
    expect(updated.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ ticket_key: 'PLA' });
  });
  it('maps workspace key conflicts to 409 on create and update', async () => {
    mocks.result = { data: null, error: { code: '23505' } };
    const created = await POST(
      request({ name: 'Platform', ticket_key: 'PLA' }, 'POST'),
      { params: Promise.resolve({ wsId: 'workspace' }) }
    );
    const updated = await PUT(request({ ticket_key: 'PLA' }, 'PUT'), {
      params: Promise.resolve({ wsId: 'workspace', projectId: 'project' }),
    });
    expect(created.status).toBe(409);
    expect(updated.status).toBe(409);
    expect(await updated.json()).toEqual({
      error: 'Project key is already used in this workspace',
    });
  });
  it('lets members without project management create projects with a derived key', async () => {
    mocks.getPermissions.mockResolvedValue({ containsPermission: () => false });
    const created = await POST(request({ name: 'Platform' }, 'POST'), {
      params: Promise.resolve({ wsId: 'workspace' }),
    });
    expect(created.status).toBe(201);
  });
  it('requires project management permission to choose or edit a key', async () => {
    mocks.getPermissions.mockResolvedValue({ containsPermission: () => false });
    expect(
      (
        await POST(request({ name: 'Platform', ticket_key: 'PLA' }, 'POST'), {
          params: Promise.resolve({ wsId: 'workspace' }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await PUT(request({ ticket_key: 'PLA' }, 'PUT'), {
          params: Promise.resolve({ wsId: 'workspace', projectId: 'project' }),
        })
      ).status
    ).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
