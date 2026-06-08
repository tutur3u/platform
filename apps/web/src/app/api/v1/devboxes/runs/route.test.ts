import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAppSessionUserMock,
  createAdminClientMock,
  createClientMock,
  getAppSessionTokenFromRequestMock,
  getPermissionsMock,
  resolveAuthenticatedSessionUserMock,
  verifyAppSessionRequestMock,
} = vi.hoisted(() => ({
  createAppSessionUserMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  getAppSessionTokenFromRequestMock: vi.fn(),
  getPermissionsMock: vi.fn(),
  resolveAuthenticatedSessionUserMock: vi.fn(),
  verifyAppSessionRequestMock: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  createAppSessionUser: createAppSessionUserMock,
  getAppSessionTokenFromRequest: getAppSessionTokenFromRequestMock,
  verifyAppSessionRequest: verifyAppSessionRequestMock,
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_TARGET_APP: 'platform',
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
    getAppSessionTokenFromRequestMock.mockReturnValue(null);
    createAppSessionUserMock.mockImplementation(
      (claims: { email?: string | null; sub: string }) => ({
        email: claims.email ?? undefined,
        id: claims.sub,
      })
    );
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

  it('accepts CLI app-session tokens for root workspace members', async () => {
    getAppSessionTokenFromRequestMock.mockReturnValue('ttr_app_access');
    verifyAppSessionRequestMock.mockReturnValue({
      claims: {
        email: 'agent@example.com',
        sub: 'user-1',
      },
      ok: true,
    });
    getPermissionsMock.mockResolvedValue(createPermissionsResult('MEMBER'));

    const request = createRunRequest({ command: ['bun', 'check'] });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(resolveAuthenticatedSessionUserMock).not.toHaveBeenCalled();
    expect(verifyAppSessionRequestMock).toHaveBeenCalledWith(request, {
      targetApp: 'platform',
    });
    expect(getPermissionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'user-1' }),
      })
    );
  });

  it('rejects invalid CLI app-session tokens without Supabase fallback', async () => {
    getAppSessionTokenFromRequestMock.mockReturnValue('ttr_app_invalid');
    verifyAppSessionRequestMock.mockReturnValue({
      error: 'Invalid app session',
      ok: false,
    });
    resolveAuthenticatedSessionUserMock.mockResolvedValue({
      user: { id: 'fallback-user' },
    });

    const response = await POST(
      createRunRequest({ command: ['bun', 'check'] })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(resolveAuthenticatedSessionUserMock).not.toHaveBeenCalled();
    expect(getPermissionsMock).not.toHaveBeenCalled();
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

  it('returns an actionable readiness error when devbox tables are missing', async () => {
    resolveAuthenticatedSessionUserMock.mockResolvedValue({
      user: { id: 'user-1' },
    });
    getPermissionsMock.mockResolvedValue(createPermissionsResult('MEMBER'));
    insertMock.mockResolvedValueOnce({
      error: {
        message:
          "Could not find the table 'private.devbox_leases' in the schema cache",
      },
    });

    const response = await POST(
      createRunRequest({ command: ['bun', '--version'] })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: expect.stringContaining(
        'Remote devboxes are not ready: Supabase is missing private devbox tables'
      ),
    });
  });
});
