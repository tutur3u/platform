import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  createClientMock,
  getPermissionsMock,
  resolveAuthenticatedSessionUserMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  getPermissionsMock: vi.fn(),
  resolveAuthenticatedSessionUserMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: resolveAuthenticatedSessionUserMock,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
  createClient: createClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
}));

import { POST } from './route';

function createPermissionsResult(membershipType: 'GUEST' | 'MEMBER') {
  return {
    membershipType,
    permissions: ['manage_workspace_roles'],
    containsPermission: () => true,
    withoutPermission: () => false,
  };
}

function createRunRequest(body: unknown) {
  return new Request('http://localhost/api/v1/devboxes/runs', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }) as NextRequest;
}

describe('devbox runs route', () => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({
    insert: insertMock,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({});
    createAdminClientMock.mockResolvedValue({
      schema: vi.fn(() => ({
        from: fromMock,
      })),
    });
    insertMock.mockResolvedValue({ error: null });
  });

  it('rejects unauthenticated requests', async () => {
    resolveAuthenticatedSessionUserMock.mockResolvedValue({ user: null });

    const response = await POST(
      createRunRequest({ command: ['bun', 'check'] })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
  });

  it('rejects root workspace guests', async () => {
    resolveAuthenticatedSessionUserMock.mockResolvedValue({
      user: { id: 'user-1' },
    });
    getPermissionsMock.mockResolvedValue(createPermissionsResult('GUEST'));

    const response = await POST(
      createRunRequest({ command: ['bun', 'check'] })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
  });

  it('rejects blocked host-destructive commands before storage writes', async () => {
    resolveAuthenticatedSessionUserMock.mockResolvedValue({
      user: { id: 'user-1' },
    });
    getPermissionsMock.mockResolvedValue(createPermissionsResult('MEMBER'));

    const response = await POST(
      createRunRequest({ command: ['rm', '-rf', '/'] })
    );

    expect(response.status).toBe(400);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('creates an auto-lease run for root workspace members', async () => {
    resolveAuthenticatedSessionUserMock.mockResolvedValue({
      user: { id: 'user-1' },
    });
    getPermissionsMock.mockResolvedValue(createPermissionsResult('MEMBER'));

    const response = await POST(
      createRunRequest({
        command: ['bun', 'sb:reset'],
        keep: true,
        leaseMode: 'auto',
        previewPorts: [7803],
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      lease: { status: 'active' },
      run: { command: ['bun', 'sb:reset'], status: 'queued' },
    });
    expect(fromMock).toHaveBeenCalledWith('devbox_leases');
    expect(fromMock).toHaveBeenCalledWith('devbox_runs');
  });
});
