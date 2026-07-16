import crypto from 'node:crypto';
import {
  createAdminClient,
  createClient,
  createDetachedClient,
} from '@tuturuuu/supabase/next/server';
import {
  isTurnstileError,
  type TurnstileRequestLike,
  verifyTurnstileToken,
} from '@tuturuuu/turnstile/server';
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
import { INTERNAL_DOMAINS } from '@tuturuuu/utils/internal-domains';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';

export const QR_LOGIN_CHALLENGE_TTL_SECONDS = 120;
export const QR_LOGIN_GENERIC_ERROR = 'Unable to process QR login right now.';
export const QR_LOGIN_INVALID_CHALLENGE_ERROR =
  'Invalid or expired QR login request.';
export const QR_LOGIN_INVALID_ORIGIN_ERROR =
  'QR login is only available from a trusted Tuturuuu web origin.';

export type QrLoginChallengeStatus =
  | 'approved'
  | 'consumed'
  | 'expired'
  | 'pending'
  | 'rejected';

type QrLoginChallengeRow = QrLoginChallenge;
type QrLoginSessionPayload = {
  access_token: string;
  expires_at: number | null;
  expires_in: number;
  refresh_token: string;
  token_type: string;
};

type HeadersLike =
  | Headers
  | Map<string, string>
  | Record<string, string | null>;

interface QrLoginRequestContext {
  endpoint: string;
  headers: HeadersLike;
  request?: Pick<Request, 'headers' | 'url'>;
}

interface QrLoginFailureResult {
  body: Record<string, unknown>;
  status: number;
}

interface QrLoginSuccessResult {
  body: Record<string, unknown>;
  status: 200;
}

export const QrLoginCreateRequestSchema = z.object({
  captchaToken: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  locale: z.string().max(MAX_CODE_LENGTH).optional(),
  origin: z.string().url().max(MAX_LONG_TEXT_LENGTH).optional(),
});

export const QrLoginPollQuerySchema = z.object({
  secret: z.string().min(16).max(MAX_LONG_TEXT_LENGTH),
});

export const QrLoginApproveRequestSchema = z.object({
  deviceId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  platform: z.enum(['android', 'ios']).optional(),
  secret: z.string().min(16).max(MAX_LONG_TEXT_LENGTH),
});

export function hashQrLoginSecret(secret: string) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function buildQrLoginPayload(input: {
  challengeId: string;
  origin: string;
  secret: string;
}) {
  const payload = new URL('tuturuuu://auth/qr-login');
  payload.searchParams.set('challengeId', input.challengeId);
  payload.searchParams.set('secret', input.secret);
  payload.searchParams.set('origin', input.origin);
  return payload.toString();
}

function generateQrLoginSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function isTrustedQrLoginOrigin(origin: string) {
  const url = new URL(origin);
  if (INTERNAL_DOMAINS.some((trustedOrigin) => trustedOrigin === url.origin)) {
    return true;
  }

  if (process.env.NODE_ENV !== 'production') {
    return ['10.0.2.2', '127.0.0.1', 'localhost'].includes(url.hostname);
  }

  return false;
}

function normalizeOrigin(origin: string | undefined, requestUrl?: string) {
  const normalizedOrigin = origin
    ? new URL(origin).origin
    : requestUrl
      ? new URL(requestUrl).origin
      : 'https://tuturuuu.com';

  return isTrustedQrLoginOrigin(normalizedOrigin) ? normalizedOrigin : null;
}

function asJson(value: Record<string, unknown>) {
  return value as Json;
}

function createTurnstileRequestLike(
  context: QrLoginRequestContext
): TurnstileRequestLike {
  if (context.request) {
    return { headers: context.request.headers };
  }

  if (context.headers instanceof Headers || context.headers instanceof Map) {
    return { headers: context.headers };
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(context.headers)) {
    if (value) {
      headers.set(key, value);
    }
  }
  return { headers };
}

function challengeStatus(value: string): QrLoginChallengeStatus {
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

function isExpired(row: Pick<QrLoginChallengeRow, 'expires_at'>) {
  return new Date(row.expires_at).getTime() <= Date.now();
}

function createInvalidChallengeResult(status = 404): QrLoginFailureResult {
  return {
    body: { error: QR_LOGIN_INVALID_CHALLENGE_ERROR },
    status,
  };
}

async function enforceRateLimit(
  kind: 'approve' | 'create' | 'poll',
  context: QrLoginRequestContext,
  maxRequests: number
): Promise<QrLoginFailureResult | null> {
  const ipAddress = extractIPFromHeaders(context.headers) || 'unknown';
  const result = await checkRateLimit(`auth:qr-login:${kind}:${ipAddress}`, {
    maxRequests,
    windowMs: 60_000,
  });

  if ('allowed' in result) {
    return null;
  }

  return {
    body: { error: 'Too many QR login requests. Please try again later.' },
    status: 429,
  };
}

async function getChallengeBySecret(input: {
  challengeId: string;
  secret: string;
}) {
  const admin = await createAdminClient<Database>();
  const { data, error } = await admin
    .from('qr_login_challenges')
    .select('*')
    .eq('id', input.challengeId)
    .eq('secret_hash', hashQrLoginSecret(input.secret))
    .maybeSingle();

  if (error) {
    console.warn('Failed to load QR login challenge', {
      challengeId: input.challengeId,
      message: error.message,
    });
    return null;
  }

  return data;
}

async function markExpired(challengeId: string) {
  const admin = await createAdminClient<Database>();
  const { error } = await admin
    .from('qr_login_challenges')
    .update({ status: 'expired' })
    .eq('id', challengeId)
    .eq('status', 'pending');

  if (error) {
    console.warn('Failed to mark QR login challenge expired', {
      challengeId,
      message: error.message,
    });
  }
}

async function consumeApprovedChallenge(row: QrLoginChallengeRow) {
  const consumedAt = new Date().toISOString();
  const admin = await createAdminClient<Database>();
  const { data, error } = await admin
    .from('qr_login_challenges')
    .update({
      consumed_at: consumedAt,
      status: 'consumed',
    })
    .eq('id', row.id)
    .eq('status', 'approved')
    .is('consumed_at', null)
    .select('*')
    .maybeSingle();

  if (error) {
    console.warn('Failed to consume QR login challenge', {
      challengeId: row.id,
      message: error.message,
    });
    return null;
  }

  return data;
}

export async function createQrLoginChallenge(
  input: z.infer<typeof QrLoginCreateRequestSchema>,
  context: QrLoginRequestContext
): Promise<QrLoginFailureResult | QrLoginSuccessResult> {
  const rateLimitFailure = await enforceRateLimit('create', context, 20);
  if (rateLimitFailure) {
    return rateLimitFailure;
  }

  const ipAddress = extractIPFromHeaders(context.headers);
  const userAgent = extractUserAgentFromHeaders(context.headers);
  const origin = normalizeOrigin(input.origin, context.request?.url);

  if (!origin) {
    return {
      body: { error: QR_LOGIN_INVALID_ORIGIN_ERROR },
      status: 400,
    };
  }

  try {
    await verifyTurnstileToken(
      createTurnstileRequestLike(context),
      input.captchaToken
    );
  } catch (error) {
    if (isTurnstileError(error)) {
      return {
        body: { error: error.message },
        status: 400,
      };
    }

    throw error;
  }

  const secret = generateQrLoginSecret();
  const expiresAt = new Date(
    Date.now() + QR_LOGIN_CHALLENGE_TTL_SECONDS * 1000
  ).toISOString();
  const admin = await createAdminClient<Database>();

  const { data, error } = await admin
    .from('qr_login_challenges')
    .insert({
      expires_at: expiresAt,
      request_metadata: asJson({
        endpoint: context.endpoint,
        ipAddress,
        locale: input.locale || 'en',
        origin,
        userAgent,
      }),
      secret_hash: hashQrLoginSecret(secret),
      status: 'pending',
    })
    .select('expires_at, id, status')
    .single();

  if (error || !data) {
    console.error('Failed to create QR login challenge', {
      message: error?.message,
    });
    return {
      body: { error: QR_LOGIN_GENERIC_ERROR },
      status: 500,
    };
  }

  return {
    body: {
      challenge: {
        expiresAt: data.expires_at,
        id: data.id,
        payload: buildQrLoginPayload({
          challengeId: data.id,
          origin,
          secret,
        }),
        status: challengeStatus(data.status),
      },
      expiresIn: QR_LOGIN_CHALLENGE_TTL_SECONDS,
      success: true,
    },
    status: 200,
  };
}

export async function pollQrLoginChallenge(
  input: {
    challengeId: string;
    secret: string;
  },
  context: QrLoginRequestContext
): Promise<QrLoginFailureResult | QrLoginSuccessResult> {
  const rateLimitFailure = await enforceRateLimit('poll', context, 120);
  if (rateLimitFailure) {
    return rateLimitFailure;
  }

  const row = await getChallengeBySecret(input);
  if (!row) {
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

  if (challengeStatus(row.status) !== 'approved') {
    return {
      body: {
        expiresAt: row.expires_at,
        status: challengeStatus(row.status),
        success: challengeStatus(row.status) === 'consumed',
      },
      status: 200,
    };
  }

  const consumed = await consumeApprovedChallenge(row);
  if (!consumed?.approver_user_id) {
    return {
      body: { error: QR_LOGIN_GENERIC_ERROR },
      status: 500,
    };
  }

  try {
    const session = await issueQrLoginSessionForUser(
      consumed.approver_user_id,
      consumed.approver_email ?? undefined
    );

    return {
      body: {
        session,
        status: 'approved',
        success: true,
      },
      status: 200,
    };
  } catch (error) {
    console.error('Failed to issue QR login session', {
      challengeId: consumed.id,
      error,
    });
    return {
      body: { error: QR_LOGIN_GENERIC_ERROR },
      status: 500,
    };
  }
}

export async function approveQrLoginChallenge(
  input: z.infer<typeof QrLoginApproveRequestSchema> & {
    challengeId: string;
  },
  context: QrLoginRequestContext
): Promise<QrLoginFailureResult | QrLoginSuccessResult> {
  const rateLimitFailure = await enforceRateLimit('approve', context, 30);
  if (rateLimitFailure) {
    return rateLimitFailure;
  }

  const row = await getChallengeBySecret(input);
  if (!row) {
    return createInvalidChallengeResult();
  }

  if (challengeStatus(row.status) === 'pending' && isExpired(row)) {
    await markExpired(row.id);
    return {
      body: {
        error: QR_LOGIN_INVALID_CHALLENGE_ERROR,
        status: 'expired',
      },
      status: 410,
    };
  }

  if (challengeStatus(row.status) !== 'pending') {
    return {
      body: {
        error: QR_LOGIN_INVALID_CHALLENGE_ERROR,
        status: challengeStatus(row.status),
      },
      status: 409,
    };
  }

  const supabase = await createClient<Database>(context.request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    return {
      body: { error: 'Authentication required' },
      status: 401,
    };
  }

  const ipAddress = extractIPFromHeaders(context.headers);
  const userAgent = extractUserAgentFromHeaders(context.headers);
  const approvedAt = new Date().toISOString();
  const admin = await createAdminClient<Database>();
  const { data, error } = await admin
    .from('qr_login_challenges')
    .update({
      approval_metadata: asJson({
        endpoint: context.endpoint,
        ipAddress,
        userAgent,
      }),
      approved_at: approvedAt,
      approver_device_id: input.deviceId,
      approver_email: user.email,
      approver_platform: input.platform,
      approver_user_id: user.id,
      status: 'approved',
    })
    .eq('id', input.challengeId)
    .eq('secret_hash', hashQrLoginSecret(input.secret))
    .eq('status', 'pending')
    .gt('expires_at', approvedAt)
    .select('expires_at, id, status')
    .maybeSingle();

  if (error) {
    console.error('Failed to approve QR login challenge', {
      challengeId: input.challengeId,
      message: error.message,
    });
    return {
      body: { error: QR_LOGIN_GENERIC_ERROR },
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

export async function issueQrLoginSessionForUser(
  userId: string,
  email?: string
): Promise<QrLoginSessionPayload> {
  const admin = await createAdminClient();
  let userEmail = email;

  if (!userEmail) {
    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(userId);

    if (userError || !userData.user?.email) {
      throw new Error(userError?.message || 'QR login user email not found');
    }

    userEmail = userData.user.email;
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      email: userEmail,
      options: {
        data: {
          auth_client: 'qr_login',
          origin: 'TUTURUUU_WEB_QR',
        },
      },
      type: 'magiclink',
    });

  if (linkError || !linkData?.properties?.action_link) {
    throw new Error(linkError?.message || 'QR login magic link not generated');
  }

  const magicLinkUrl = new URL(linkData.properties.action_link);
  const tokenHash =
    magicLinkUrl.searchParams.get('token') ||
    magicLinkUrl.searchParams.get('token_hash');

  if (!tokenHash) {
    throw new Error('QR login magic link token hash not found');
  }

  const detached = createDetachedClient();
  const { data: otpData, error: verifyError } = await detached.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  if (verifyError || !otpData.session) {
    throw new Error(verifyError?.message || 'QR login session not created');
  }

  return {
    access_token: otpData.session.access_token,
    expires_at: otpData.session.expires_at ?? null,
    expires_in: otpData.session.expires_in,
    refresh_token: otpData.session.refresh_token,
    token_type: otpData.session.token_type,
  };
}

export function toQrLoginErrorResult(error: unknown) {
  console.error('Unexpected QR login error', error);
  return {
    body: { error: QR_LOGIN_GENERIC_ERROR },
    status: 500,
  } satisfies QrLoginFailureResult;
}
