/**
 * Tests for Identity Linking Utilities
 *
 * Tests the pure utility functions for OAuth provider identity management.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  canUnlinkIdentity,
  getProviderDisplayName,
  getProviderIcon,
  getUserIdentities,
  type Identity,
  linkIdentity,
  unlinkIdentity,
} from './identity-linking';

describe('getProviderDisplayName', () => {
  it('should return correct display names for known providers', () => {
    expect(getProviderDisplayName('google')).toBe('Google');
    expect(getProviderDisplayName('github')).toBe('GitHub');
    expect(getProviderDisplayName('apple')).toBe('Apple');
    expect(getProviderDisplayName('facebook')).toBe('Facebook');
    expect(getProviderDisplayName('twitter')).toBe('Twitter');
    expect(getProviderDisplayName('azure')).toBe('Microsoft Azure');
    expect(getProviderDisplayName('bitbucket')).toBe('Bitbucket');
    expect(getProviderDisplayName('discord')).toBe('Discord');
    expect(getProviderDisplayName('gitlab')).toBe('GitLab');
    expect(getProviderDisplayName('linkedin_oidc')).toBe('LinkedIn');
    expect(getProviderDisplayName('notion')).toBe('Notion');
    expect(getProviderDisplayName('slack')).toBe('Slack');
    expect(getProviderDisplayName('spotify')).toBe('Spotify');
    expect(getProviderDisplayName('twitch')).toBe('Twitch');
    expect(getProviderDisplayName('workos')).toBe('WorkOS');
    expect(getProviderDisplayName('zoom')).toBe('Zoom');
  });

  it('should capitalize unknown provider names', () => {
    expect(getProviderDisplayName('unknown')).toBe('Unknown');
    expect(getProviderDisplayName('custom_provider')).toBe('Custom_provider');
    expect(getProviderDisplayName('myauth')).toBe('Myauth');
  });

  it('should handle empty string', () => {
    expect(getProviderDisplayName('')).toBe('');
  });
});

describe('getProviderIcon', () => {
  it('should return correct icon names for known providers', () => {
    expect(getProviderIcon('google')).toBe('google');
    expect(getProviderIcon('github')).toBe('github');
    expect(getProviderIcon('apple')).toBe('apple');
    expect(getProviderIcon('facebook')).toBe('facebook');
    expect(getProviderIcon('twitter')).toBe('twitter');
    expect(getProviderIcon('azure')).toBe('microsoft');
    expect(getProviderIcon('bitbucket')).toBe('bitbucket');
    expect(getProviderIcon('discord')).toBe('discord');
    expect(getProviderIcon('gitlab')).toBe('gitlab');
    expect(getProviderIcon('linkedin_oidc')).toBe('linkedin');
    expect(getProviderIcon('notion')).toBe('notion');
    expect(getProviderIcon('slack')).toBe('slack');
    expect(getProviderIcon('spotify')).toBe('spotify');
    expect(getProviderIcon('twitch')).toBe('twitch');
    expect(getProviderIcon('workos')).toBe('briefcase');
    expect(getProviderIcon('zoom')).toBe('video');
  });

  it('should return default "link" icon for unknown providers', () => {
    expect(getProviderIcon('unknown')).toBe('link');
    expect(getProviderIcon('custom_provider')).toBe('link');
    expect(getProviderIcon('')).toBe('link');
  });
});

describe('linkIdentity', () => {
  it('should call supabase auth linkIdentity with correct params', async () => {
    const mockSupabase = {
      auth: {
        linkIdentity: vi.fn().mockResolvedValue({
          data: { url: 'https://oauth.example.com/authorize' },
          error: null,
        }),
      },
    };

    // Mock window.location for the default redirect
    const originalWindow = global.window;
    global.window = { location: { origin: 'https://app.example.com' } } as any;

    const result = await linkIdentity(mockSupabase as any, 'google');

    expect(mockSupabase.auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://app.example.com/settings/account/security',
        scopes: undefined,
        queryParams: undefined,
      },
    });
    expect(result.data).toEqual({ url: 'https://oauth.example.com/authorize' });
    expect(result.error).toBeNull();

    global.window = originalWindow;
  });

  it('should use custom redirect URL when provided', async () => {
    const mockSupabase = {
      auth: {
        linkIdentity: vi.fn().mockResolvedValue({
          data: { url: 'https://oauth.example.com/authorize' },
          error: null,
        }),
      },
    };

    global.window = { location: { origin: 'https://app.example.com' } } as any;

    await linkIdentity(mockSupabase as any, 'github', {
      redirectTo: 'https://custom.example.com/callback',
      scopes: 'read:user',
    });

    expect(mockSupabase.auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'github',
      options: {
        redirectTo: 'https://custom.example.com/callback',
        scopes: 'read:user',
        queryParams: undefined,
      },
    });

    global.window = undefined as any;
  });

  it('should handle errors gracefully', async () => {
    const mockSupabase = {
      auth: {
        linkIdentity: vi.fn().mockRejectedValue(new Error('Network error')),
      },
    };

    global.window = { location: { origin: 'https://app.example.com' } } as any;

    const result = await linkIdentity(mockSupabase as any, 'google');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);

    global.window = undefined as any;
  });
});

describe('unlinkIdentity', () => {
  it('should call supabase auth unlinkIdentity with identity object', async () => {
    const mockSupabase = {
      auth: {
        unlinkIdentity: vi.fn().mockResolvedValue({
          data: {},
          error: null,
        }),
      },
    };

    const identity: Identity = {
      id: 'identity-1',
      identity_id: 'provider-identity-123',
      provider: 'google',
      user_id: 'user-123',
    };

    const result = await unlinkIdentity(mockSupabase as any, identity);

    expect(mockSupabase.auth.unlinkIdentity).toHaveBeenCalledWith(identity);
    expect(result.error).toBeNull();
  });

  it('should handle errors gracefully', async () => {
    const mockSupabase = {
      auth: {
        unlinkIdentity: vi.fn().mockRejectedValue(new Error('Cannot unlink')),
      },
    };

    const identity: Identity = {
      id: 'identity-1',
      identity_id: 'provider-identity-123',
      provider: 'google',
      user_id: 'user-123',
    };

    const result = await unlinkIdentity(mockSupabase as any, identity);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe('getUserIdentities', () => {
  it('should return user identities from supabase', async () => {
    const mockIdentities = {
      identities: [
        { id: '1', identity_id: 'g1', provider: 'google', user_id: 'u1' },
        { id: '2', identity_id: 'gh1', provider: 'github', user_id: 'u1' },
      ],
    };

    const mockSupabase = {
      auth: {
        getUserIdentities: vi.fn().mockResolvedValue({
          data: mockIdentities,
          error: null,
        }),
      },
    };

    const result = await getUserIdentities(mockSupabase as any);

    expect(result.data).toEqual(mockIdentities);
    expect(result.error).toBeNull();
  });

  it('should handle errors gracefully', async () => {
    const mockSupabase = {
      auth: {
        getUserIdentities: vi.fn().mockRejectedValue(new Error('Auth error')),
      },
    };

    const result = await getUserIdentities(mockSupabase as any);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe('canUnlinkIdentity', () => {
  it('should return true when user has 2 or more identities', async () => {
    const mockSupabase = {
      auth: {
        getUserIdentities: vi.fn().mockResolvedValue({
          data: {
            identities: [
              { id: '1', identity_id: 'g1', provider: 'google', user_id: 'u1' },
              {
                id: '2',
                identity_id: 'gh1',
                provider: 'github',
                user_id: 'u1',
              },
            ],
          },
          error: null,
        }),
      },
    };

    const result = await canUnlinkIdentity(mockSupabase as any);
    expect(result).toBe(true);
  });

  it('should return false when user has only 1 identity', async () => {
    const mockSupabase = {
      auth: {
        getUserIdentities: vi.fn().mockResolvedValue({
          data: {
            identities: [
              { id: '1', identity_id: 'g1', provider: 'google', user_id: 'u1' },
            ],
          },
          error: null,
        }),
      },
    };

    const result = await canUnlinkIdentity(mockSupabase as any);
    expect(result).toBe(false);
  });

  it('should return false when user has no identities', async () => {
    const mockSupabase = {
      auth: {
        getUserIdentities: vi.fn().mockResolvedValue({
          data: { identities: [] },
          error: null,
        }),
      },
    };

    const result = await canUnlinkIdentity(mockSupabase as any);
    expect(result).toBe(false);
  });

  it('should return false on error', async () => {
    const mockSupabase = {
      auth: {
        getUserIdentities: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('Auth error'),
        }),
      },
    };

    const result = await canUnlinkIdentity(mockSupabase as any);
    expect(result).toBe(false);
  });

  it('should return false on exception', async () => {
    const mockSupabase = {
      auth: {
        getUserIdentities: vi
          .fn()
          .mockRejectedValue(new Error('Network error')),
      },
    };

    const result = await canUnlinkIdentity(mockSupabase as any);
    expect(result).toBe(false);
  });
});
