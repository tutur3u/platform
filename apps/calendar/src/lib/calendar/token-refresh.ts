/**
 * Token Refresh Utility
 *
 * Centralized token refresh logic for Google and Microsoft OAuth tokens.
 * Handles proactive refresh (5-minute buffer before expiry) and token storage.
 */

// Use generic supabase client type to avoid direct dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = {
  from: (table: string) => any;
};

import { OAuth2Client } from '@tuturuuu/google';
import {
  ConfidentialClientApplication,
  createMsalConfig,
  MICROSOFT_CALENDAR_SCOPES,
  type MicrosoftOAuthConfig,
} from '@tuturuuu/microsoft';

import { microsoftRefreshCredential } from './microsoft-refresh-credential';

export interface CalendarAuthToken {
  id: string;
  user_id: string;
  ws_id: string;
  provider: 'google' | 'microsoft';
  access_token: string;
  refresh_token: string;
  account_email: string | null;
  account_name: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  expiresAt: Date | null;
  refreshed: boolean;
  refreshToken?: string;
  error?: string;
}

function refreshFailure(error: unknown, provider: string): string {
  const candidate = error as {
    errorCode?: unknown;
    code?: unknown;
    message?: unknown;
  } | null;
  const code = candidate?.errorCode ?? candidate?.code;
  const message =
    typeof candidate?.message === 'string' ? candidate.message : '';
  return code === 'invalid_grant' || message.includes('invalid_grant')
    ? 'invalid_grant'
    : `${provider} token refresh failed`;
}

// Buffer time before token expiry to trigger refresh (5 minutes)
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Check if a token needs to be refreshed
 */
export function tokenNeedsRefresh(expiresAt: string | null): boolean {
  if (!expiresAt) return true;

  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();

  return !Number.isFinite(expiryTime) || expiryTime - now < REFRESH_BUFFER_MS;
}

/**
 * Refresh a Google OAuth token
 */
async function refreshGoogleToken(
  authToken: CalendarAuthToken
): Promise<TokenRefreshResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      accessToken: authToken.access_token,
      expiresAt: authToken.expires_at ? new Date(authToken.expires_at) : null,
      refreshed: false,
      error: 'Google OAuth credentials not configured',
    };
  }

  try {
    const oauth2Client = new OAuth2Client({
      clientId,
      clientSecret,
    });

    oauth2Client.setCredentials({
      refresh_token: authToken.refresh_token,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    return {
      accessToken: credentials.access_token || authToken.access_token,
      expiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : null,
      refreshed: true,
    };
  } catch (error) {
    console.error('[TokenRefresh] Google token refresh failed');
    return {
      accessToken: authToken.access_token,
      expiresAt: authToken.expires_at ? new Date(authToken.expires_at) : null,
      refreshed: false,
      error: refreshFailure(error, 'Google'),
    };
  }
}

/**
 * Refresh a Microsoft OAuth token
 */
async function refreshMicrosoftToken(
  authToken: CalendarAuthToken
): Promise<TokenRefreshResult> {
  const config: MicrosoftOAuthConfig = {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
  };

  if (!config.clientId || !config.clientSecret) {
    return {
      accessToken: authToken.access_token,
      expiresAt: authToken.expires_at ? new Date(authToken.expires_at) : null,
      refreshed: false,
      error: 'Microsoft OAuth credentials not configured',
    };
  }

  try {
    const msalConfig = createMsalConfig(config);
    const cca = new ConfidentialClientApplication(msalConfig);

    const result = await cca.acquireTokenByRefreshToken({
      refreshToken: authToken.refresh_token,
      scopes: MICROSOFT_CALENDAR_SCOPES,
    });

    if (!result) {
      throw new Error('No token result from Microsoft refresh');
    }

    return {
      accessToken: result.accessToken,
      refreshToken:
        microsoftRefreshCredential(
          cca.getTokenCache().serialize(),
          result.account?.homeAccountId,
          config.clientId
        ) ?? undefined,
      expiresAt: result.expiresOn || null,
      refreshed: true,
    };
  } catch (error) {
    console.error('[TokenRefresh] Microsoft token refresh failed');
    return {
      accessToken: authToken.access_token,
      expiresAt: authToken.expires_at ? new Date(authToken.expires_at) : null,
      refreshed: false,
      error: refreshFailure(error, 'Microsoft'),
    };
  }
}

/**
 * Ensure a token is valid, refreshing if necessary
 * Updates the token in the database if refreshed
 */
export async function ensureValidToken(
  supabase: SupabaseClientLike,
  authToken: CalendarAuthToken
): Promise<TokenRefreshResult> {
  if (!authToken.is_active) {
    return {
      accessToken: '',
      expiresAt: null,
      refreshed: false,
      error: 'Connection is inactive',
    };
  }
  // Check if token needs refresh
  if (!tokenNeedsRefresh(authToken.expires_at)) {
    return {
      accessToken: authToken.access_token,
      expiresAt: authToken.expires_at ? new Date(authToken.expires_at) : null,
      refreshed: false,
    };
  }

  if (!authToken.refresh_token) {
    return {
      accessToken: '',
      expiresAt: null,
      refreshed: false,
      error: 'Reconnect calendar to grant offline access',
    };
  }

  // Refresh based on provider
  const result =
    authToken.provider === 'google'
      ? await refreshGoogleToken(authToken)
      : await refreshMicrosoftToken(authToken);

  // If refreshed successfully, update the database
  if (result.refreshed && !result.error) {
    const { error: updateError } = await supabase
      .from('calendar_auth_tokens')
      .update({
        access_token: result.accessToken,
        ...(result.refreshToken ? { refresh_token: result.refreshToken } : {}),
        expires_at: result.expiresAt?.toISOString() || null,
      })
      .eq('id', authToken.id);

    if (updateError) {
      console.error('[TokenRefresh] Failed to persist refreshed credential');
      return { ...result, error: 'Failed to persist refreshed credential' };
    } else {
      console.log(
        `[TokenRefresh] Successfully refreshed and stored ${authToken.provider} token`
      );
    }
  }

  // If refresh failed, mark token as inactive
  if (result.error) {
    console.warn('[TokenRefresh] Provider credential refresh failed');

    // Don't mark as inactive immediately - the token might still be valid
    // Only mark inactive on specific errors like 'invalid_grant'
    if (
      result.error.includes('invalid_grant') ||
      result.error.includes('Token has been revoked')
    ) {
      await supabase
        .from('calendar_auth_tokens')
        .update({ is_active: false })
        .eq('id', authToken.id);
    }
  }

  return result;
}

/**
 * Get all active auth tokens for a workspace
 */
export async function getWorkspaceAuthTokens(
  supabase: SupabaseClientLike,
  wsId: string,
  userId: string
): Promise<CalendarAuthToken[]> {
  const { data, error } = await supabase
    .from('calendar_auth_tokens')
    .select('*')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[TokenRefresh] Failed to fetch auth tokens:', error);
    return [];
  }

  return (data as CalendarAuthToken[]) || [];
}

/**
 * Get all active auth tokens for a workspace, ensuring they're valid
 */
export async function getValidWorkspaceAuthTokens(
  supabase: SupabaseClientLike,
  wsId: string,
  userId: string
): Promise<Array<CalendarAuthToken & { validAccessToken: string }>> {
  const tokens = await getWorkspaceAuthTokens(supabase, wsId, userId);

  const validTokens = await Promise.all(
    tokens.map(async (token) => {
      const result = await ensureValidToken(supabase, token);
      return {
        ...token,
        validAccessToken: result.accessToken,
        access_token: result.accessToken,
        expires_at: result.expiresAt?.toISOString() || token.expires_at,
      };
    })
  );

  // Filter out tokens that failed to refresh and are now invalid
  return validTokens.filter((t) => t.is_active);
}
