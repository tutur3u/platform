import type { SupabaseSession } from '@tuturuuu/supabase/next/user';

export const WEB_ACCOUNT_DEVICE_COOKIE_NAME =
  '__Host-tuturuuu_web_account_device';
export const LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME =
  'tuturuuu_web_account_device';
export const LEGACY_MULTI_SESSION_STORAGE_KEY = 'tuturuuu_multi_session_store';
export const MAX_WEB_ACCOUNT_SESSIONS = 5;

export interface WebAccountMetadata {
  addedAt: number | null;
  avatarUrl: string | null;
  displayName: string | null;
  lastActiveAt: number | null;
  lastRoute: string | null;
  lastWorkspaceId: string | null;
}

export interface WebAccountSummary {
  email: string | null;
  id: string;
  metadata: WebAccountMetadata;
}

export interface WebAccountsResponse {
  accounts: WebAccountSummary[];
  activeAccountId: string | null;
}

export interface WebAccountMutationResponse extends WebAccountsResponse {
  accountId?: string;
  error?: string;
  redirectTo?: string;
  /**
   * The stored session for that account can no longer be used, so the only way
   * forward is signing into it again. Lets the UI say that instead of surfacing
   * a raw "account not found".
   */
  requiresReauth?: boolean;
  success: boolean;
}

export interface SaveCurrentAccountPayload {
  returnUrl?: string | null;
  route?: string | null;
}

export interface SwitchAccountPayload {
  currentRoute?: string | null;
  targetRoute?: string | null;
}

export interface UpdateCurrentAccountPayload {
  route?: string | null;
  workspaceId?: string | null;
}

export interface StoredWebAccountSession {
  email: string | null;
  metadata: WebAccountMetadata;
  session: SupabaseSession;
  userId: string;
}

export interface WebAccountDeviceCredential {
  deviceId: string;
  secret: string;
}

export interface WebAccountDevice extends WebAccountDeviceCredential {
  activeUserId: string | null;
}
