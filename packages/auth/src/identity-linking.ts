import type { SupabaseClient } from '@tuturuuu/supabase/next/client';

export interface Identity {
  id: string;
  identity_id: string;
  provider: string;
  user_id: string;
  identity_data?: Record<string, string>;
  last_sign_in_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserIdentitiesResponse {
  identities: Identity[];
}

/**
 * Link an identity to the current user
 * @param supabase The Supabase client
 * @param provider The OAuth provider to link (e.g., 'google', 'github')
 * @param options Optional configuration for the link process
 * @returns Promise containing the result data or error
 */
export async function linkIdentity(
  supabase: SupabaseClient,
  provider:
    | 'google'
    | 'github'
    | 'apple'
    | 'facebook'
    | 'twitter'
    | 'azure'
    | 'bitbucket'
    | 'discord'
    | 'gitlab'
    | 'linkedin_oidc'
    | 'notion'
    | 'slack'
    | 'spotify'
    | 'twitch'
    | 'workos'
    | 'zoom',
  options?: {
    redirectTo?: string;
    scopes?: string;
    queryParams?: Record<string, string>;
  }
) {
  try {
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo:
          options?.redirectTo ||
          `${window.location.origin}/settings/account/security`,
        scopes: options?.scopes,
        queryParams: options?.queryParams,
      },
    });

    return { data, error };
  } catch (error) {
    console.error('Error linking identity:', error);
    return { data: null, error };
  }
}

/**
 * Unlink an identity from the current user
 * @param supabase The Supabase client
 * @param identity The identity object to unlink
 * @returns Promise containing the result data or error
 */
export async function unlinkIdentity(
  supabase: SupabaseClient,
  identity: Identity
) {
  try {
    const { data, error } = await supabase.auth.unlinkIdentity(identity);
    return { data, error };
  } catch (error) {
    console.error('Error unlinking identity:', error);
    return { data: null, error };
  }
}

/**
 * Get all identities linked to the current user
 * @param supabase The Supabase client
 * @returns Promise containing the identities data or error
 */
export async function getUserIdentities(
  supabase: SupabaseClient
): Promise<{ data: UserIdentitiesResponse | null; error: any }> {
  try {
    const { data, error } = await supabase.auth.getUserIdentities();
    return { data, error };
  } catch (error) {
    console.error('Error getting user identities:', error);
    return { data: null, error };
  }
}

/**
 * Check if the user can unlink an identity (must have at least 2 identities)
 * @param supabase The Supabase client
 * @returns Promise<boolean> indicating if unlinking is allowed
 */
export async function canUnlinkIdentity(
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    const { data, error } = await getUserIdentities(supabase);
    if (error || !data) return false;

    return data.identities.length >= 2;
  } catch {
    return false;
  }
}

/**
 * Get the display name for a provider
 * @param provider The provider name
 * @returns A user-friendly display name for the provider
 */
export function getProviderDisplayName(provider: string): string {
  const providerNames: Record<string, string> = {
    google: 'Google',
    github: 'GitHub',
    apple: 'Apple',
    facebook: 'Facebook',
    twitter: 'Twitter',
    azure: 'Microsoft Azure',
    bitbucket: 'Bitbucket',
    discord: 'Discord',
    gitlab: 'GitLab',
    linkedin_oidc: 'LinkedIn',
    notion: 'Notion',
    slack: 'Slack',
    spotify: 'Spotify',
    twitch: 'Twitch',
    workos: 'WorkOS',
    zoom: 'Zoom',
  };

  return (
    providerNames[provider] ||
    provider.charAt(0).toUpperCase() + provider.slice(1)
  );
}

/**
 * Get an icon name for a provider (for use with icon libraries)
 * @param provider The provider name
 * @returns The icon name or a default icon
 */
export function getProviderIcon(provider: string): string {
  const providerIcons: Record<string, string> = {
    google: 'google',
    github: 'github',
    apple: 'apple',
    facebook: 'facebook',
    twitter: 'twitter',
    azure: 'microsoft',
    bitbucket: 'bitbucket',
    discord: 'discord',
    gitlab: 'gitlab',
    linkedin_oidc: 'linkedin',
    notion: 'notion',
    slack: 'slack',
    spotify: 'spotify',
    twitch: 'twitch',
    workos: 'briefcase',
    zoom: 'video',
  };

  return providerIcons[provider] || 'link';
}
