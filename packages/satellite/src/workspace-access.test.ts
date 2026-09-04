import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createAppSessionUser: vi.fn(),
  createClient: vi.fn(),
  getAppSessionTokenFromRequest: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspace: vi.fn(),
  headers: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  resolveWorkspaceIdForPrincipal: vi.fn(),
  verifyAppSessionRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  createAppSessionUser: mocks.createAppSessionUser,
  getAppSessionTokenFromRequest: mocks.getAppSessionTokenFromRequest,
  verifyAppSessionRequest: mocks.verifyAppSessionRequest,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  getWorkspace: mocks.getWorkspace,
  resolveWorkspaceIdForPrincipal: mocks.resolveWorkspaceIdForPrincipal,
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

import {
  getSatelliteRequestWorkspaceAccess,
  getSatelliteWorkspace,
  resolveSatelliteRequestActor,
  resolveSatelliteWorkspaceId,
} from './workspace-access';

const appUser = { email: 'actor@example.com', id: 'app-user' };
const supabaseUser = { email: 'cookie@example.com', id: 'cookie-user' };
const admin = { kind: 'admin' };
const request = new Request('https://inventory.example/api');

describe('satellite workspace access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.createClient.mockResolvedValue({ kind: 'cookie-client' });
    mocks.createAppSessionUser.mockReturnValue(appUser);
    mocks.getAppSessionTokenFromRequest.mockReturnValue(null);
    mocks.getPermissions.mockResolvedValue({ wsId: 'resolved-workspace' });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: supabaseUser,
    });
  });

  it('accepts a target-matched app session and keeps the explicit actor', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue('token');
    mocks.verifyAppSessionRequest.mockReturnValue({
      claims: { sub: appUser.id },
      ok: true,
    });

    await expect(
      resolveSatelliteRequestActor(request, 'inventory')
    ).resolves.toEqual({ admin, user: appUser });
    expect(mocks.verifyAppSessionRequest).toHaveBeenCalledWith(request, {
      targetApp: 'inventory',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('rejects an invalid or mismatched app session without cookie fallback', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue('token');
    mocks.verifyAppSessionRequest.mockReturnValue({
      error: 'target_app_mismatch',
      ok: false,
    });

    await expect(
      resolveSatelliteRequestActor(request, 'inventory')
    ).resolves.toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('falls back to a verified Supabase session when no app token exists', async () => {
    await expect(
      resolveSatelliteRequestActor(request, 'inventory')
    ).resolves.toEqual({ admin, user: supabaseUser });
  });

  it('resolves personal aliases with the target-scoped page actor', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue('token');
    mocks.verifyAppSessionRequest.mockReturnValue({ claims: {}, ok: true });
    mocks.resolveWorkspaceIdForPrincipal.mockResolvedValue('personal-id');

    await expect(
      resolveSatelliteWorkspaceId('contacts', 'personal')
    ).resolves.toBe('personal-id');
    expect(mocks.resolveWorkspaceIdForPrincipal).toHaveBeenCalledWith({
      authorizationClient: admin,
      principal: appUser,
      wsId: 'personal',
    });
  });

  it('loads workspaces with the target-scoped actor', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue('token');
    mocks.verifyAppSessionRequest.mockReturnValue({ claims: {}, ok: true });
    mocks.getWorkspace.mockResolvedValue({ id: 'workspace' });

    await expect(getSatelliteWorkspace('teach', 'workspace')).resolves.toEqual({
      id: 'workspace',
    });
    expect(mocks.getWorkspace).toHaveBeenCalledWith('workspace', {
      useAdmin: true,
      user: appUser,
    });
  });

  it('returns route workspace access using the resolved actor permissions', async () => {
    await expect(
      getSatelliteRequestWorkspaceAccess(request, 'inventory', 'personal')
    ).resolves.toMatchObject({
      admin,
      permissions: { wsId: 'resolved-workspace' },
      user: supabaseUser,
      wsId: 'resolved-workspace',
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: supabaseUser,
      wsId: 'personal',
    });
  });
});
