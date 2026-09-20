import {
  hashMfaMobileApprovalSecret,
  MFA_MOBILE_APPROVAL_KIND,
} from '@tuturuuu/auth/mfa-mobile-approval';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database, QrLoginChallenge } from '@tuturuuu/types/db';
import type { Json } from '@tuturuuu/types/supabase';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import {
  MAX_CODE_LENGTH,
  MAX_LONG_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';

export const MFA_MOBILE_APPROVAL_GENERIC_ERROR =
  'Unable to process mobile MFA approval right now.';
export const MFA_MOBILE_APPROVAL_INVALID_CHALLENGE_ERROR =
  'Invalid or expired mobile MFA approval request.';
export const MFA_MOBILE_APPROVAL_REQUIRES_MOBILE_MFA_ERROR =
  'This mobile session must pass MFA before approving web sign-ins.';

export type MfaMobileApprovalStatus =
  | 'approved'
  | 'consumed'
  | 'expired'
  | 'pending'
  | 'rejected';

export type MfaMobileApprovalRow = QrLoginChallenge;
export type HeadersLike =
  | Headers
  | Map<string, string>
  | Record<string, string | null>;

export interface MfaMobileApprovalRequestContext {
  endpoint: string;
  headers: HeadersLike;
  request?: Pick<Request, 'headers' | 'url'>;
}

export interface MfaMobileApprovalFailureResult {
  body: Record<string, unknown>;
  status: number;
}

export interface MfaMobileApprovalSuccessResult {
  body: Record<string, unknown>;
  cookie?: {
    maxAge: number;
    name: string;
    value: string;
  };
  status: 200;
}

export const MfaMobileApprovalCreateRequestSchema = z.object({
  locale: z.string().max(MAX_CODE_LENGTH).optional(),
});

export const MfaMobileApprovalPollQuerySchema = z.object({
  secret: z.string().min(16).max(MAX_LONG_TEXT_LENGTH),
});

export const MfaMobileApprovalApproveRequestSchema = z.object({
  factorId: z.string().uuid().optional(),
  proof: z.string().min(32).max(256).optional(),
  deviceId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  pairCode: z.string().max(MAX_CODE_LENGTH).optional(),
  decision: z.enum(['approve', 'reject']).default('approve'),
  platform: z.enum(['android', 'ios']).optional(),
});

export function asJson(value: Record<string, unknown>) {
  return value as Json;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function challengeStatus(value: string): MfaMobileApprovalStatus {
  switch (value) {
    case 'approved':
    case 'consumed':
    case 'expired':
    case 'pending':
    case 'rejected':
      return value;
    default:
      return 'expired';
  }
}

export function isExpired(row: Pick<MfaMobileApprovalRow, 'expires_at'>) {
  return new Date(row.expires_at).getTime() <= Date.now();
}

export function approvalValidUntil(
  row: Pick<MfaMobileApprovalRow, 'approval_metadata'>,
  approverSessionId: string
) {
  const approvalMetadata = asRecord(row.approval_metadata);

  if (approvalMetadata.approverSessionId !== approverSessionId) {
    return null;
  }

  const validUntil = approvalMetadata.mobileMfaValidUntil;

  if (typeof validUntil !== 'string') {
    return null;
  }

  const timestamp = Date.parse(validUntil);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return timestamp > Date.now() ? validUntil : null;
}

export function pairCodeFromRow(
  row: Pick<MfaMobileApprovalRow, 'request_metadata'>
) {
  const pairCode = asRecord(row.request_metadata).pairCode;
  return typeof pairCode === 'string' ? pairCode : null;
}

export function isMobileMfaApprovalRow(
  row: Pick<MfaMobileApprovalRow, 'request_metadata'>
) {
  return asRecord(row.request_metadata).kind === MFA_MOBILE_APPROVAL_KIND;
}

export async function getCurrentSupabaseSessionId(
  supabase: Awaited<ReturnType<typeof createClient<Database>>>
) {
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return null;
  }

  const claims = asRecord(data?.claims);
  const sessionId = claims.session_id;

  return typeof sessionId === 'string' && sessionId ? sessionId : null;
}

export async function enforceRateLimit(
  kind: 'approve' | 'create' | 'list' | 'poll',
  context: MfaMobileApprovalRequestContext,
  maxRequests: number
): Promise<MfaMobileApprovalFailureResult | null> {
  const ipAddress = extractIPFromHeaders(context.headers) || 'unknown';
  const result = await checkRateLimit(`auth:mfa-mobile:${kind}:${ipAddress}`, {
    maxRequests,
    windowMs: 60_000,
  });

  if ('allowed' in result) {
    return null;
  }

  return {
    body: {
      error: 'Too many mobile MFA approval requests. Please try again later.',
    },
    status: 429,
  };
}

export function createInvalidChallengeResult(status = 404) {
  return {
    body: { error: MFA_MOBILE_APPROVAL_INVALID_CHALLENGE_ERROR },
    status,
  } satisfies MfaMobileApprovalFailureResult;
}

export async function markExpired(challengeId: string) {
  const admin = await createAdminClient<Database>();
  const { error } = await admin
    .from('qr_login_challenges')
    .update({ status: 'expired' })
    .eq('id', challengeId)
    .eq('status', 'pending');

  if (error) {
    console.warn('Failed to mark mobile MFA approval expired', {
      challengeId,
      message: error.message,
    });
  }
}

export async function getAuthenticatedMfaContext(
  context: MfaMobileApprovalRequestContext
) {
  const supabase = await createClient<Database>(context.request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    return {
      error: {
        body: { error: 'Authentication required' },
        status: 401,
      } satisfies MfaMobileApprovalFailureResult,
      supabase,
      user: null,
      assuranceLevel: null,
    };
  }

  const { data: assuranceLevel, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (assuranceError) {
    return {
      error: {
        body: { error: assuranceError.message },
        status: 400,
      } satisfies MfaMobileApprovalFailureResult,
      supabase,
      user,
      assuranceLevel: null,
    };
  }

  return {
    error: null,
    supabase,
    user,
    assuranceLevel,
  };
}

export async function getChallengeBySecret(input: {
  challengeId: string;
  secret: string;
  userId: string;
}) {
  const admin = await createAdminClient<Database>();
  const { data, error } = await admin
    .from('qr_login_challenges')
    .select('*')
    .eq('id', input.challengeId)
    .eq('secret_hash', await hashMfaMobileApprovalSecret(input.secret))
    .eq('approver_user_id', input.userId)
    .maybeSingle();

  if (error) {
    console.warn('Failed to load mobile MFA approval challenge', {
      challengeId: input.challengeId,
      message: error.message,
    });
    return null;
  }

  return data;
}
