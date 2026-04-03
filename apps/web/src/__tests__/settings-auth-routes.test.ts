import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getUserIdentities = vi.fn();
  const unlinkIdentity = vi.fn();
  const linkIdentity = vi.fn();
  const updateUser = vi.fn();
  const reauthenticate = vi.fn();

  return {
    getUserIdentities,
    unlinkIdentity,
    linkIdentity,
    updateUser,
    reauthenticate,
    supabase: {
      auth: {
        getUserIdentities,
        unlinkIdentity,
        linkIdentity,
        updateUser,
        reauthenticate,
      },
    },
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

describe('settings auth routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns linked identities with canUnlink derived from the backend result', async () => {
    mocks.getUserIdentities.mockResolvedValue({
      data: {
        identities: [
          { id: 'identity-1', identity_id: 'identity-1', provider: 'google' },
          { id: 'identity-2', identity_id: 'identity-2', provider: 'github' },
        ],
      },
      error: null,
    });

    const route = await import('@/app/api/v1/users/me/identities/route');
    const response = await (route.GET as any)(
      new NextRequest('http://localhost/api/v1/users/me/identities'),
      { supabase: mocks.supabase }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      identities: [
        { id: 'identity-1', identity_id: 'identity-1', provider: 'google' },
        { id: 'identity-2', identity_id: 'identity-2', provider: 'github' },
      ],
      canUnlink: true,
    });
  });

  it('builds the OAuth return redirect with settings dialog state', async () => {
    mocks.linkIdentity.mockResolvedValue({
      data: { url: 'https://oauth.example/start' },
      error: null,
    });

    const route = await import(
      '@/app/api/v1/users/me/identities/link/[provider]/route'
    );
    const response = await (route.GET as any)(
      new NextRequest(
        'http://localhost/api/v1/users/me/identities/link/google?returnTo=%2Fen%2Fworkspace%3Ffoo%3D1'
      ),
      { supabase: mocks.supabase },
      { provider: 'google' }
    );

    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo:
          'http://localhost/en/workspace?foo=1&settingsDialog=open&settingsTab=security&settingsLinkedProvider=google',
      },
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://oauth.example/start'
    );
  });

  it('allows apple as a supported identity linking provider', async () => {
    mocks.linkIdentity.mockResolvedValue({
      data: { url: 'https://oauth.example/apple' },
      error: null,
    });

    const route = await import(
      '@/app/api/v1/users/me/identities/link/[provider]/route'
    );
    const response = await (route.GET as any)(
      new NextRequest(
        'http://localhost/api/v1/users/me/identities/link/apple?returnTo=%2Fen%2Fsettings'
      ),
      { supabase: mocks.supabase },
      { provider: 'apple' }
    );

    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      options: {
        redirectTo:
          'http://localhost/en/settings?settingsDialog=open&settingsTab=security&settingsLinkedProvider=apple',
      },
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://oauth.example/apple'
    );
  });

  it('allows microsoft as a supported identity linking provider', async () => {
    mocks.linkIdentity.mockResolvedValue({
      data: { url: 'https://oauth.example/microsoft' },
      error: null,
    });

    const route = await import(
      '@/app/api/v1/users/me/identities/link/[provider]/route'
    );
    const response = await (route.GET as any)(
      new NextRequest(
        'http://localhost/api/v1/users/me/identities/link/azure?returnTo=%2Fen%2Fsettings'
      ),
      { supabase: mocks.supabase },
      { provider: 'azure' }
    );

    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'azure',
      options: {
        redirectTo:
          'http://localhost/en/settings?settingsDialog=open&settingsTab=security&settingsLinkedProvider=azure',
        scopes: 'email',
      },
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://oauth.example/microsoft'
    );
  });

  it('surfaces password reauthentication as a 409 backend response', async () => {
    mocks.updateUser.mockResolvedValue({
      error: {
        code: 'reauthentication_needed',
        message: 'reauthentication_needed',
      },
    });

    const route = await import('@/app/api/v1/users/me/password/route');
    const response = await (route.POST as any)(
      new NextRequest('http://localhost/api/v1/users/me/password', {
        method: 'POST',
        body: JSON.stringify({ password: 'Password1!' }),
      }),
      { supabase: mocks.supabase }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'reauthentication_needed',
      message: 'Reauthentication required before changing password',
    });
  });
});
