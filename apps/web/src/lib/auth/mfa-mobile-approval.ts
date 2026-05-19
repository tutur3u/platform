import {
  buildMfaMobileApprovalCookieValue,
  generateMfaMobileApprovalPairCode,
  generateMfaMobileApprovalSecret,
  hashMfaMobileApprovalSecret,
  MFA_MOBILE_APPROVAL_CHALLENGE_TTL_SECONDS,
  MFA_MOBILE_APPROVAL_COOKIE_MAX_AGE_SECONDS,
  MFA_MOBILE_APPROVAL_COOKIE_NAME,
  MFA_MOBILE_APPROVAL_KIND,
  MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS,
  normalizeMfaMobileApprovalPairCode,
} from '@tuturuuu/auth/mfa-mobile-approval';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database, QrLoginChallenge } from '@tuturuuu/types/db';
import type { Json } from '@tuturuuu/types/supabase';
import {
  extractIPFromHeaders,
  extractUserAgentFromHeaders,
} from '@tuturuuu/utils/abuse-protection';
import {
  MAX_CODE_LENGTH,
  MAX_LONG_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
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

type MfaMobileApprovalRow = QrLoginChallenge;
type HeadersLike =
  | Headers
  | Map<string, string>
  | Record<string, string | null>;

interface MfaMobileApprovalRequestContext {
  endpoint: string;
  headers: HeadersLike;
  request?: Pick<Request, 'headers' | 'url'>;
}

interface MfaMobileApprovalFailureResult {
  body: Record<string, unknown>;
  status: number;
}

interface MfaMobileApprovalSuccessResult {
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
  deviceId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  pairCode: z.string().max(MAX_CODE_LENGTH).optional(),
  platform: z.enum(['android', 'ios']).optional(),
});

function asJson(value: Record<string, unknown>) {
  return value as Json;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function challengeStatus(value: string): MfaMobileApprovalStatus {
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

function isExpired(row: Pick<MfaMobileApprovalRow, 'expires_at'>) {
  return new Date(row.expires_at).getTime() <= Date.now();
}

function approvalValidUntil(
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

function pairCodeFromRow(row: Pick<MfaMobileApprovalRow, 'request_metadata'>) {
  const pairCode = asRecord(row.request_metadata).pairCode;
  return typeof pairCode === 'string' ? pairCode : null;
}

function isMobileMfaApprovalRow(
  row: Pick<MfaMobileApprovalRow, 'request_metadata'>
) {
  return asRecord(row.request_metadata).kind === MFA_MOBILE_APPROVAL_KIND;
}

async function getCurrentSupabaseSessionId(
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

async function enforceRateLimit(
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

function createInvalidChallengeResult(status = 404) {
  return {
    body: { error: MFA_MOBILE_APPROVAL_INVALID_CHALLENGE_ERROR },
    status,
  } satisfies MfaMobileApprovalFailureResult;
}

async function markExpired(challengeId: string) {
  const admin = await createAdminClient<Database>();
  const { error } = await admin
    .from('qr_login_challenges')
    .update({ status: 'expired' })
    .eq('id', challengeId)
    .eq('status', 'pending');

  if (error) {
    serverLogger.warn('Failed to mark mobile MFA approval expired', {
      challengeId,
      message: error.message,
    });
  }
}

async function getAuthenticatedMfaContext(
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

async function getChallengeBySecret(input: {
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
    serverLogger.warn('Failed to load mobile MFA approval challenge', {
      challengeId: input.challengeId,
      message: error.message,
    });
    return null;
  }

  return data;
}

export async function createMfaMobileApprovalChallenge(
  input: z.infer<typeof MfaMobileApprovalCreateRequestSchema>,
  context: MfaMobileApprovalRequestContext
): Promise<MfaMobileApprovalFailureResult | MfaMobileApprovalSuccessResult> {
  const rateLimitFailure = await enforceRateLimit('create', context, 20);
  if (rateLimitFailure) {
    return rateLimitFailure;
  }

  const authContext = await getAuthenticatedMfaContext(context);
  if (authContext.error || !authContext.user || !authContext.assuranceLevel) {
    return authContext.error;
  }

  const { currentLevel, nextLevel } = authContext.assuranceLevel;
  if (currentLevel !== 'aal1' || nextLevel !== 'aal2') {
    return {
      body: { error: 'Mobile MFA approval is not required for this session.' },
      status: 400,
    };
  }

  const { data: factors, error: factorsError } =
    await authContext.supabase.auth.mfa.listFactors();
  const hasVerifiedMfa =
    factors?.totp?.some((factor) => factor.status === 'verified') ?? false;

  if (factorsError || !hasVerifiedMfa) {
    return {
      body: { error: 'No verified MFA factor found.' },
      status: 400,
    };
  }

  const secret = generateMfaMobileApprovalSecret();
  const pairCode = generateMfaMobileApprovalPairCode();
  const expiresAt = new Date(
    Date.now() + MFA_MOBILE_APPROVAL_CHALLENGE_TTL_SECONDS * 1000
  ).toISOString();
  const ipAddress = extractIPFromHeaders(context.headers);
  const userAgent = extractUserAgentFromHeaders(context.headers);
  const admin = await createAdminClient<Database>();

  const { data, error } = await admin
    .from('qr_login_challenges')
    .insert({
      approver_email: authContext.user.email,
      approver_user_id: authContext.user.id,
      expires_at: expiresAt,
      request_metadata: asJson({
        endpoint: context.endpoint,
        ipAddress,
        kind: MFA_MOBILE_APPROVAL_KIND,
        locale: input.locale || 'en',
        pairCode,
        userAgent,
      }),
      secret_hash: await hashMfaMobileApprovalSecret(secret),
      status: 'pending',
    })
    .select('expires_at, id, request_metadata, status')
    .single();

  if (error || !data) {
    serverLogger.error('Failed to create mobile MFA approval challenge', {
      message: error?.message,
    });
    return {
      body: { error: MFA_MOBILE_APPROVAL_GENERIC_ERROR },
      status: 500,
    };
  }

  return {
    body: {
      challenge: {
        expiresAt: data.expires_at,
        id: data.id,
        pairCode,
        status: challengeStatus(data.status),
      },
      expiresIn: MFA_MOBILE_APPROVAL_CHALLENGE_TTL_SECONDS,
      secret,
      success: true,
    },
    status: 200,
  };
}

export async function pollMfaMobileApprovalChallenge(
  input: {
    challengeId: string;
    secret: string;
  },
  context: MfaMobileApprovalRequestContext
): Promise<MfaMobileApprovalFailureResult | MfaMobileApprovalSuccessResult> {
  const rateLimitFailure = await enforceRateLimit('poll', context, 120);
  if (rateLimitFailure) {
    return rateLimitFailure;
  }

  const authContext = await getAuthenticatedMfaContext(context);
  if (authContext.error || !authContext.user) {
    return authContext.error;
  }

  const row = await getChallengeBySecret({
    challengeId: input.challengeId,
    secret: input.secret,
    userId: authContext.user.id,
  });

  if (!row || !isMobileMfaApprovalRow(row)) {
    return createInvalidChallengeResult();
  }

  if (challengeStatus(row.status) === 'pending' && isExpired(row)) {
    await markExpired(row.id);
    return {
      body: {
        expiresAt: row.expires_at,
        status: 'expired',
        success: false,
      },
      status: 200,
    };
  }

  if (challengeStatus(row.status) === 'pending') {
    return {
      body: {
        expiresAt: row.expires_at,
        status: 'pending',
        success: true,
      },
      status: 200,
    };
  }

  if (challengeStatus(row.status) === 'approved') {
    const approverSessionId = await getCurrentSupabaseSessionId(
      authContext.supabase
    );

    if (!approverSessionId) {
      return {
        body: { error: MFA_MOBILE_APPROVAL_GENERIC_ERROR },
        status: 400,
      };
    }

    const consumedAt = new Date().toISOString();
    const mobileMfaValidUntil = new Date(
      Date.now() + MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS * 1000
    ).toISOString();
    const admin = await createAdminClient<Database>();
    const { data, error } = await admin
      .from('qr_login_challenges')
      .update({
        approval_metadata: asJson({
          ...asRecord(row.approval_metadata),
          approverSessionId,
          mobileMfaSessionTtlSeconds: MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS,
          mobileMfaValidUntil,
        }),
        consumed_at: consumedAt,
        status: 'consumed',
      })
      .eq('id', row.id)
      .eq('status', 'approved')
      .is('consumed_at', null)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      serverLogger.error('Failed to consume mobile MFA approval challenge', {
        challengeId: row.id,
        message: error?.message,
      });
      return {
        body: { error: MFA_MOBILE_APPROVAL_GENERIC_ERROR },
        status: 500,
      };
    }

    return {
      body: {
        mobileMfaVerified: true,
        status: 'approved',
        success: true,
        validUntil: mobileMfaValidUntil,
      },
      cookie: {
        maxAge: MFA_MOBILE_APPROVAL_COOKIE_MAX_AGE_SECONDS,
        name: MFA_MOBILE_APPROVAL_COOKIE_NAME,
        value: buildMfaMobileApprovalCookieValue({
          challengeId: row.id,
          secret: input.secret,
        }),
      },
      status: 200,
    };
  }

  if (challengeStatus(row.status) === 'consumed') {
    const approverSessionId = await getCurrentSupabaseSessionId(
      authContext.supabase
    );
    const validUntil = approverSessionId
      ? approvalValidUntil(row, approverSessionId)
      : null;

    return {
      body: {
        mobileMfaVerified: Boolean(validUntil),
        status: 'consumed',
        success: Boolean(validUntil),
        validUntil,
      },
      cookie: validUntil
        ? {
            maxAge: MFA_MOBILE_APPROVAL_COOKIE_MAX_AGE_SECONDS,
            name: MFA_MOBILE_APPROVAL_COOKIE_NAME,
            value: buildMfaMobileApprovalCookieValue({
              challengeId: row.id,
              secret: input.secret,
            }),
          }
        : undefined,
      status: 200,
    };
  }

  return {
    body: {
      expiresAt: row.expires_at,
      status: challengeStatus(row.status),
      success: false,
    },
    status: 200,
  };
}

export async function listPendingMfaMobileApprovals(
  context: MfaMobileApprovalRequestContext
): Promise<MfaMobileApprovalFailureResult | MfaMobileApprovalSuccessResult> {
  const rateLimitFailure = await enforceRateLimit('list', context, 120);
  if (rateLimitFailure) {
    return rateLimitFailure;
  }

  const authContext = await getAuthenticatedMfaContext(context);
  if (authContext.error || !authContext.user || !authContext.assuranceLevel) {
    return authContext.error;
  }

  if (authContext.assuranceLevel.currentLevel !== 'aal2') {
    return {
      body: {
        approvals: [],
        requiresMobileMfa: true,
        success: true,
      },
      status: 200,
    };
  }

  const admin = await createAdminClient<Database>();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('qr_login_challenges')
    .select('created_at, expires_at, id, request_metadata, status')
    .eq('approver_user_id', authContext.user.id)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .contains('request_metadata', { kind: MFA_MOBILE_APPROVAL_KIND })
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    serverLogger.error('Failed to list pending mobile MFA approvals', {
      message: error.message,
    });
    return {
      body: { error: MFA_MOBILE_APPROVAL_GENERIC_ERROR },
      status: 500,
    };
  }

  return {
    body: {
      approvals: (data ?? []).flatMap((row) => {
        const pairCode = pairCodeFromRow(row);
        if (!pairCode || !isMobileMfaApprovalRow(row)) {
          return [];
        }

        return [
          {
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            id: row.id,
            pairCode,
            status: challengeStatus(row.status),
          },
        ];
      }),
      requiresMobileMfa: false,
      success: true,
    },
    status: 200,
  };
}

export async function approveMfaMobileApprovalChallenge(
  input: z.infer<typeof MfaMobileApprovalApproveRequestSchema> & {
    challengeId: string;
  },
  context: MfaMobileApprovalRequestContext
): Promise<MfaMobileApprovalFailureResult | MfaMobileApprovalSuccessResult> {
  const rateLimitFailure = await enforceRateLimit('approve', context, 30);
  if (rateLimitFailure) {
    return rateLimitFailure;
  }

  const authContext = await getAuthenticatedMfaContext(context);
  if (authContext.error || !authContext.user || !authContext.assuranceLevel) {
    return authContext.error;
  }

  if (authContext.assuranceLevel.currentLevel !== 'aal2') {
    return {
      body: { error: MFA_MOBILE_APPROVAL_REQUIRES_MOBILE_MFA_ERROR },
      status: 403,
    };
  }

  const admin = await createAdminClient<Database>();
  const { data: row, error: loadError } = await admin
    .from('qr_login_challenges')
    .select('*')
    .eq('id', input.challengeId)
    .eq('approver_user_id', authContext.user.id)
    .maybeSingle();

  if (loadError) {
    serverLogger.warn('Failed to load mobile MFA approval before approval', {
      challengeId: input.challengeId,
      message: loadError.message,
    });
    return createInvalidChallengeResult();
  }

  if (!row || !isMobileMfaApprovalRow(row)) {
    return createInvalidChallengeResult();
  }

  if (challengeStatus(row.status) === 'pending' && isExpired(row)) {
    await markExpired(row.id);
    return {
      body: {
        error: MFA_MOBILE_APPROVAL_INVALID_CHALLENGE_ERROR,
        status: 'expired',
      },
      status: 410,
    };
  }

  if (challengeStatus(row.status) !== 'pending') {
    return {
      body: {
        error: MFA_MOBILE_APPROVAL_INVALID_CHALLENGE_ERROR,
        status: challengeStatus(row.status),
      },
      status: 409,
    };
  }

  const pairCode = pairCodeFromRow(row);
  if (
    input.pairCode &&
    pairCode &&
    normalizeMfaMobileApprovalPairCode(input.pairCode) !==
      normalizeMfaMobileApprovalPairCode(pairCode)
  ) {
    return {
      body: { error: MFA_MOBILE_APPROVAL_INVALID_CHALLENGE_ERROR },
      status: 400,
    };
  }

  const ipAddress = extractIPFromHeaders(context.headers);
  const userAgent = extractUserAgentFromHeaders(context.headers);
  const approvedAt = new Date().toISOString();
  const { data, error } = await admin
    .from('qr_login_challenges')
    .update({
      approval_metadata: asJson({
        endpoint: context.endpoint,
        ipAddress,
        pairCodeConfirmed: Boolean(input.pairCode),
        userAgent,
      }),
      approved_at: approvedAt,
      approver_device_id: input.deviceId,
      approver_email: authContext.user.email,
      approver_platform: input.platform,
      approver_user_id: authContext.user.id,
      status: 'approved',
    })
    .eq('id', input.challengeId)
    .eq('approver_user_id', authContext.user.id)
    .eq('status', 'pending')
    .gt('expires_at', approvedAt)
    .select('expires_at, id, status')
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to approve mobile MFA challenge', {
      challengeId: input.challengeId,
      message: error.message,
    });
    return {
      body: { error: MFA_MOBILE_APPROVAL_GENERIC_ERROR },
      status: 500,
    };
  }

  if (!data) {
    return createInvalidChallengeResult(409);
  }

  return {
    body: {
      expiresAt: data.expires_at,
      status: 'approved',
      success: true,
    },
    status: 200,
  };
}

export function toMfaMobileApprovalErrorResult(error: unknown) {
  serverLogger.error('Unexpected mobile MFA approval error', error);
  return {
    body: { error: MFA_MOBILE_APPROVAL_GENERIC_ERROR },
    status: 500,
  } satisfies MfaMobileApprovalFailureResult;
}
