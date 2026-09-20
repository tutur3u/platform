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
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/db';
import {
  extractIPFromHeaders,
  extractUserAgentFromHeaders,
} from '@tuturuuu/utils/abuse-protection';
import type { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { isTrustedAuthenticator } from './device-mfa/registry';
import { sendMfaApprovalPush } from './mfa-approval-push';

import {
  approvalValidUntil,
  asJson,
  asRecord,
  challengeStatus,
  createInvalidChallengeResult,
  enforceRateLimit,
  getAuthenticatedMfaContext,
  getChallengeBySecret,
  getCurrentSupabaseSessionId,
  isExpired,
  isMobileMfaApprovalRow,
  MFA_MOBILE_APPROVAL_GENERIC_ERROR,
  MFA_MOBILE_APPROVAL_INVALID_CHALLENGE_ERROR,
  MFA_MOBILE_APPROVAL_REQUIRES_MOBILE_MFA_ERROR,
  type MfaMobileApprovalApproveRequestSchema,
  type MfaMobileApprovalCreateRequestSchema,
  type MfaMobileApprovalFailureResult,
  type MfaMobileApprovalRequestContext,
  type MfaMobileApprovalSuccessResult,
  markExpired,
  pairCodeFromRow,
} from './mfa-mobile-approval-context';

export {
  MFA_MOBILE_APPROVAL_GENERIC_ERROR,
  MFA_MOBILE_APPROVAL_INVALID_CHALLENGE_ERROR,
  MFA_MOBILE_APPROVAL_REQUIRES_MOBILE_MFA_ERROR,
  MfaMobileApprovalApproveRequestSchema,
  MfaMobileApprovalCreateRequestSchema,
  MfaMobileApprovalPollQuerySchema,
} from './mfa-mobile-approval-context';

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

  const userLimit = await checkRateLimit(
    `auth:mfa-mobile:create:user:${authContext.user.id}`,
    { maxRequests: 3, windowMs: 60_000 }
  );
  if (!('allowed' in userLimit))
    return {
      body: { error: 'Please wait before requesting another approval.' },
      status: 429,
    };

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

  const requesterSessionId = await getCurrentSupabaseSessionId(
    authContext.supabase
  );
  if (!requesterSessionId) return createInvalidChallengeResult(401);

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
        requesterSessionId,
        userAgent,
      }),
      secret_hash: await hashMfaMobileApprovalSecret(secret),
      status: 'pending',
    })
    .select('expires_at, id, request_metadata, status')
    .single();

  if (error || !data) {
    console.error('Failed to create mobile MFA approval challenge', {
      message: error?.message,
    });
    return {
      body: { error: MFA_MOBILE_APPROVAL_GENERIC_ERROR },
      status: 500,
    };
  }

  await sendMfaApprovalPush({
    userId: authContext.user.id,
    challengeId: data.id,
    expiresAt: data.expires_at,
    locale: input.locale,
  });

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

  const requesterSessionId = asRecord(row.request_metadata).requesterSessionId;
  if (
    requesterSessionId &&
    requesterSessionId !==
      (await getCurrentSupabaseSessionId(authContext.supabase))
  ) {
    return createInvalidChallengeResult();
  }

  if (
    ['pending', 'approved'].includes(challengeStatus(row.status)) &&
    isExpired(row)
  ) {
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
      .gt('expires_at', consumedAt)
      .is('consumed_at', null)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to consume mobile MFA approval challenge', {
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
    console.error('Failed to list pending mobile MFA approvals', {
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
            numberMatching: true,
            browser: asRecord(row.request_metadata).userAgent ?? null,
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
  input: z.input<typeof MfaMobileApprovalApproveRequestSchema> & {
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

  if (
    input.decision !== 'reject' &&
    !(await isTrustedAuthenticator(authContext.user.id, input))
  ) {
    return {
      body: { error: 'Approve from a registered trusted authenticator' },
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
    console.warn('Failed to load mobile MFA approval before approval', {
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

  const requesterSessionId = asRecord(row.request_metadata).requesterSessionId;
  if (
    requesterSessionId &&
    requesterSessionId ===
      (await getCurrentSupabaseSessionId(authContext.supabase))
  ) {
    return createInvalidChallengeResult(403);
  }
  const attemptLimit = await checkRateLimit(
    `auth:mfa-mobile:attempt:${row.id}:${authContext.user.id}`,
    { maxRequests: 5, windowMs: 5 * 60_000 }
  );
  if (!('allowed' in attemptLimit))
    return {
      body: { error: MFA_MOBILE_APPROVAL_INVALID_CHALLENGE_ERROR },
      status: 429,
    };

  const pairCode = pairCodeFromRow(row);
  if (
    input.decision !== 'reject' &&
    (!input.pairCode ||
      !pairCode ||
      normalizeMfaMobileApprovalPairCode(input.pairCode) !==
        normalizeMfaMobileApprovalPairCode(pairCode))
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
      status: input.decision === 'reject' ? 'rejected' : 'approved',
    })
    .eq('id', input.challengeId)
    .eq('approver_user_id', authContext.user.id)
    .eq('status', 'pending')
    .gt('expires_at', approvedAt)
    .select('expires_at, id, status')
    .maybeSingle();

  if (error) {
    console.error('Failed to approve mobile MFA challenge', {
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
      status: input.decision === 'reject' ? 'rejected' : 'approved',
      success: true,
    },
    status: 200,
  };
}

export function toMfaMobileApprovalErrorResult(error: unknown) {
  console.error('Unexpected mobile MFA approval error', error);
  return {
    body: { error: MFA_MOBILE_APPROVAL_GENERIC_ERROR },
    status: 500,
  } satisfies MfaMobileApprovalFailureResult;
}
