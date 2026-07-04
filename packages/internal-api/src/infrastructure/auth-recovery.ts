import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from '../client';

export type AuthRecoveryEventType =
  | 'override_created'
  | 'override_revoked'
  | 'normal_login_bypass_used'
  | 'recovery_email_sent'
  | 'recovery_email_send_failed'
  | 'recovery_token_consumed'
  | 'recovery_code_consumed'
  | 'recovery_token_rejected'
  | 'supabase_user_created'
  | 'supabase_user_unbanned';

export interface AuthRecoveryOverrideSummary {
  allowNormalLogin: boolean;
  allowRecoveryEmail: boolean;
  createdAt: string;
  createdBy: string | null;
  email: string;
  expiresAt: string;
  id: string;
  lastUsedAt: string | null;
  reason: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedReason: string | null;
}

export interface AuthRecoveryEventSummary {
  actorUserId: string | null;
  createdAt: string;
  email: string;
  eventType: AuthRecoveryEventType;
  id: string;
  metadata: Record<string, unknown>;
  overrideId: string | null;
  tokenId: string | null;
}

export interface AuthRecoveryDiagnostics {
  activeOverride: AuthRecoveryOverrideSummary | null;
  authUser: {
    bannedUntil: string | null;
    confirmedAt: string | null;
    createdAt: string | null;
    email: string | null;
    id: string | null;
  } | null;
  emailBlocked: boolean;
  emailBlockedReason: string | null;
  recentAbuseEvents: Array<Record<string, unknown>>;
  relatedIpBlocks: AuthRecoveryRelatedIpBlockSummary[];
}

export interface AuthRecoveryRelatedIpBlockSummary {
  blockLevel: number | null;
  blockedAt: string | null;
  expiresAt: string | null;
  id: string;
  ipAddress: string;
  reason: string | null;
  status: string | null;
}

export interface AuthRecoverySnapshot {
  diagnostics: AuthRecoveryDiagnostics | null;
  events: AuthRecoveryEventSummary[];
  overrides: AuthRecoveryOverrideSummary[];
}

export interface CreateAuthRecoveryOverridePayload {
  allowNormalLogin?: boolean;
  allowRecoveryEmail?: boolean;
  clearEmailScoped?: boolean;
  clearRelatedIpBlocks?: boolean;
  clearRelatedIpCounters?: boolean;
  email: string;
  expiresAt?: string;
  reason?: string;
}

export interface RevokeAuthRecoveryOverridePayload {
  reason?: string;
}

export interface SendAuthRecoveryEmailPayload {
  locale?: string;
  next?: string | null;
}

export interface SendAuthRecoveryEmailResponse {
  result: {
    email: string;
    expiresAt: string;
    tokenId: string;
  };
}

export async function getAuthRecoverySnapshot(
  params: { email?: string } = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AuthRecoverySnapshot>(
    '/api/v1/infrastructure/auth-recovery',
    {
      cache: 'no-store',
      query: {
        email: params.email,
      },
    }
  );
}

export async function createAuthRecoveryOverride(
  payload: CreateAuthRecoveryOverridePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<{ override: AuthRecoveryOverrideSummary }>(
    '/api/v1/infrastructure/auth-recovery',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function revokeAuthRecoveryOverride(
  overrideId: string,
  payload: RevokeAuthRecoveryOverridePayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<{ override: AuthRecoveryOverrideSummary }>(
    `/api/v1/infrastructure/auth-recovery/${encodePathSegment(overrideId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function sendAuthRecoveryEmail(
  overrideId: string,
  payload: SendAuthRecoveryEmailPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<SendAuthRecoveryEmailResponse>(
    `/api/v1/infrastructure/auth-recovery/${encodePathSegment(overrideId)}/send-email`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}
