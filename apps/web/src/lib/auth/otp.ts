import {
  createAdminClient,
  createClient,
  createDetachedClient,
} from '@tuturuuu/supabase/next/server';
import {
  isTurnstileError,
  resolveTurnstileToken,
} from '@tuturuuu/turnstile/server';
import {
  checkOTPSendAllowed,
  checkOTPVerifyLimit,
  classifyPotentialSpamUserAgent,
  clearOTPVerifyFailures,
  extractIPFromHeaders,
  extractUserAgentFromHeaders,
  logAbuseEvent,
  recordOTPSendSuccess,
  recordOTPVerifyFailure,
} from '@tuturuuu/utils/abuse-protection';
import {
  MAX_CODE_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_OTP_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  checkEmailInfrastructureBlocked,
  checkIfUserExists,
  generateRandomPassword,
  validateEmail,
  validateOtp,
} from '@tuturuuu/utils/email/server';
import { z } from 'zod';
import {
  getMobileVersionPolicies,
  type MobilePlatform,
} from '@/lib/mobile-version-policy';

export const OTP_UNAVAILABLE_ERROR =
  'Verification code sign-in is unavailable right now.';
export const OTP_SEND_GENERIC_ERROR =
  'Unable to send a verification code right now.';
export const OTP_VERIFY_GENERIC_ERROR =
  'Verification failed. Please try again.';
export const OTP_SPAM_BLOCK_ERROR = 'Unable to continue right now.';

export type OtpClient = 'mobile' | 'web';

export const OtpSendRequestSchema = z
  .object({
    email: z.string().email().max(MAX_EMAIL_LENGTH),
    locale: z.string().max(MAX_CODE_LENGTH).optional(),
    deviceId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
    captchaToken: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
    client: z.enum(['web', 'mobile']),
    platform: z.enum(['ios', 'android']).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.client === 'mobile' && !value.platform) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mobile OTP requests must include a platform',
        path: ['platform'],
      });
    }
  });

export const OtpVerifyRequestSchema = z
  .object({
    email: z.string().email().max(MAX_EMAIL_LENGTH),
    otp: z.string().max(MAX_OTP_LENGTH),
    locale: z.string().max(MAX_CODE_LENGTH).optional(),
    deviceId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
    client: z.enum(['web', 'mobile']),
    platform: z.enum(['ios', 'android']).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.client === 'mobile' && !value.platform) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mobile OTP requests must include a platform',
        path: ['platform'],
      });
    }
  });

type HeadersLike =
  | Headers
  | Map<string, string>
  | Record<string, string | null>;

interface OtpRequestContext {
  client: OtpClient;
  endpoint: string;
  headers: HeadersLike;
  platform?: MobilePlatform;
  request?: Pick<Request, 'headers'>;
}

interface OtpFailureResult {
  body: Record<string, unknown>;
  status: number;
}

interface OtpAvailabilityResult {
  otpEnabled: boolean;
}

interface VerifyOtpSuccessResult {
  body: Record<string, unknown>;
  status: 200;
}

interface AllowedUserAgentResult {
  classification: ReturnType<typeof classifyPotentialSpamUserAgent>;
  failure?: never;
  ipAddress: string;
  userAgent: string | null;
}

interface BlockedUserAgentResult {
  classification?: never;
  failure: OtpFailureResult;
  ipAddress?: never;
  userAgent?: never;
}

function buildOtpMetadata(options: {
  client: OtpClient;
  deviceId?: string;
  locale: string;
  platform?: MobilePlatform;
}) {
  const metadata: Record<string, string> = {
    auth_client: options.client,
    locale: options.locale,
    origin: 'TUTURUUU',
  };

  if (options.deviceId) {
    metadata.device_id = options.deviceId;
  }

  if (options.platform) {
    metadata.platform = options.platform;
  }

  return metadata;
}

async function getOtpAvailability({
  client,
  platform,
}: {
  client: OtpClient;
  platform?: MobilePlatform;
}): Promise<OtpAvailabilityResult> {
  const policies = await getMobileVersionPolicies();

  if (client === 'web') {
    return { otpEnabled: policies.webOtpEnabled };
  }

  if (!platform) {
    return { otpEnabled: false };
  }

  return { otpEnabled: policies[platform].otpEnabled };
}

async function rejectSuspiciousUserAgent(
  context: OtpRequestContext
): Promise<AllowedUserAgentResult | BlockedUserAgentResult> {
  const ipAddress = extractIPFromHeaders(context.headers);
  const userAgent = extractUserAgentFromHeaders(context.headers);
  const classification = classifyPotentialSpamUserAgent(userAgent, {
    allowNativeAppUserAgents: context.client === 'mobile',
  });

  if (classification.riskLevel !== 'block') {
    return {
      classification,
      ipAddress,
      userAgent,
    };
  }

  await logAbuseEvent(ipAddress, 'api_abuse', {
    endpoint: context.endpoint,
    success: false,
    userAgent: userAgent || undefined,
    metadata: {
      client: context.client,
      platform: context.platform,
      stage: 'user_agent_block',
      uaMatchedPattern: classification.matchedPattern,
      uaReason: classification.reason,
      uaRiskLevel: classification.riskLevel,
    },
  });

  return {
    failure: {
      body: { error: OTP_SPAM_BLOCK_ERROR },
      status: 403,
    } satisfies OtpFailureResult,
  };
}

function createUnavailableResult(): OtpFailureResult {
  return {
    body: { error: OTP_UNAVAILABLE_ERROR },
    status: 403,
  };
}

function createGenericSendErrorResult(status = 400): OtpFailureResult {
  return {
    body: { error: OTP_SEND_GENERIC_ERROR },
    status,
  };
}

function createGenericVerifyErrorResult(status = 400): OtpFailureResult {
  return {
    body: { error: OTP_VERIFY_GENERIC_ERROR },
    status,
  };
}

export async function getPublicOtpSettings({
  client,
  platform,
}: {
  client: OtpClient;
  platform?: MobilePlatform;
}) {
  const availability = await getOtpAvailability({ client, platform });
  return { otpEnabled: availability.otpEnabled };
}

export async function sendOtp(
  input: z.infer<typeof OtpSendRequestSchema>,
  context: OtpRequestContext
): Promise<OtpFailureResult | VerifyOtpSuccessResult> {
  const suspiciousAgentCheck = await rejectSuspiciousUserAgent(context);
  if (suspiciousAgentCheck.failure) {
    return suspiciousAgentCheck.failure;
  }

  const availability = await getOtpAvailability({
    client: input.client,
    platform: input.platform,
  });
  if (!availability.otpEnabled) {
    return createUnavailableResult();
  }

  const normalizedLocale = input.locale || 'en';
  let validatedEmail: string;
  try {
    validatedEmail = await validateEmail(input.email);
  } catch (error) {
    return {
      body: {
        error: error instanceof Error ? error.message : 'Invalid email address',
      },
      status: 400,
    };
  }
  const ipAddress = suspiciousAgentCheck.ipAddress;
  const userAgent = suspiciousAgentCheck.userAgent;

  const abuseCheck = await checkOTPSendAllowed(ipAddress, validatedEmail);
  if (!abuseCheck.allowed) {
    return {
      body: {
        error:
          abuseCheck.reason || 'Too many requests. Please try again later.',
        retryAfter: abuseCheck.retryAfter,
      },
      status: 429,
    };
  }

  const infrastructureCheck =
    await checkEmailInfrastructureBlocked(validatedEmail);
  if (infrastructureCheck.isBlocked) {
    await logAbuseEvent(ipAddress, 'otp_send', {
      email: validatedEmail,
      endpoint: context.endpoint,
      success: false,
      userAgent: userAgent || undefined,
      metadata: {
        blockType: infrastructureCheck.blockType,
        client: input.client,
        platform: input.platform,
        stage: 'infrastructure_block',
        uaMatchedPattern: suspiciousAgentCheck.classification.matchedPattern,
        uaReason: suspiciousAgentCheck.classification.reason,
        uaRiskLevel: suspiciousAgentCheck.classification.riskLevel,
      },
    });
    return createGenericSendErrorResult();
  }

  const turnstile = resolveTurnstileToken({
    token: input.captchaToken,
    requireConfiguration: true,
  });
  const sbAdmin = await createAdminClient();
  const supabase = turnstile.shouldBypassForDev
    ? sbAdmin
    : await createClient(context.request);
  const metadata = buildOtpMetadata({
    client: input.client,
    deviceId: input.deviceId,
    locale: normalizedLocale,
    platform: input.platform,
  });
  const userId = await checkIfUserExists({ email: validatedEmail });

  if (userId) {
    const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: metadata,
      }
    );

    if (updateError) {
      await logAbuseEvent(ipAddress, 'otp_send', {
        email: validatedEmail,
        endpoint: context.endpoint,
        success: false,
        userAgent: userAgent || undefined,
        metadata: {
          client: input.client,
          message: updateError.message,
          platform: input.platform,
          stage: 'update_user',
        },
      });
      return createGenericSendErrorResult(500);
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: validatedEmail,
      options: {
        data: metadata,
        ...turnstile.captchaOptions,
      },
    });

    if (error) {
      await logAbuseEvent(ipAddress, 'otp_send', {
        email: validatedEmail,
        endpoint: context.endpoint,
        success: false,
        userAgent: userAgent || undefined,
        metadata: {
          client: input.client,
          code: error.code,
          message: error.message,
          platform: input.platform,
          stage: 'sign_in_with_otp',
          status: error.status,
        },
      });
      return createGenericSendErrorResult();
    }
  } else {
    const { error } = await supabase.auth.signUp({
      email: validatedEmail,
      password: generateRandomPassword(),
      options: {
        data: metadata,
        ...turnstile.captchaOptions,
      },
    });

    if (error) {
      await logAbuseEvent(ipAddress, 'otp_send', {
        email: validatedEmail,
        endpoint: context.endpoint,
        success: false,
        userAgent: userAgent || undefined,
        metadata: {
          client: input.client,
          code: error.code,
          message: error.message,
          platform: input.platform,
          stage: 'sign_up',
          status: error.status,
        },
      });
      return createGenericSendErrorResult();
    }
  }

  await recordOTPSendSuccess(ipAddress, validatedEmail);

  return {
    body: { success: true },
    status: 200,
  };
}

export async function verifyOtp(
  input: z.infer<typeof OtpVerifyRequestSchema>,
  context: OtpRequestContext
): Promise<OtpFailureResult | VerifyOtpSuccessResult> {
  const suspiciousAgentCheck = await rejectSuspiciousUserAgent(context);
  if (suspiciousAgentCheck.failure) {
    return suspiciousAgentCheck.failure;
  }

  const availability = await getOtpAvailability({
    client: input.client,
    platform: input.platform,
  });
  if (!availability.otpEnabled) {
    return createUnavailableResult();
  }

  const normalizedLocale = input.locale || 'en';
  let validatedEmail: string;
  try {
    validatedEmail = await validateEmail(input.email);
  } catch (error) {
    return {
      body: {
        error: error instanceof Error ? error.message : 'Invalid email address',
      },
      status: 400,
    };
  }
  const ipAddress = suspiciousAgentCheck.ipAddress;
  const abuseCheck = await checkOTPVerifyLimit(ipAddress, validatedEmail);
  if (!abuseCheck.allowed) {
    return {
      body: {
        error:
          abuseCheck.reason || 'Too many attempts. Please try again later.',
        retryAfter: abuseCheck.retryAfter,
      },
      status: 429,
    };
  }

  let validatedCode: string;
  try {
    validatedCode = await validateOtp(input.otp);
  } catch (error) {
    return {
      body: {
        error:
          error instanceof Error ? error.message : 'Invalid verification code',
      },
      status: 400,
    };
  }
  const supabase =
    input.client === 'mobile'
      ? createDetachedClient()
      : await createClient(context.request);

  const { data, error } = await supabase.auth.verifyOtp({
    email: validatedEmail,
    token: validatedCode,
    type: 'email',
  });

  if (error) {
    await recordOTPVerifyFailure(ipAddress, validatedEmail);
    return createGenericVerifyErrorResult();
  }

  await clearOTPVerifyFailures(ipAddress, validatedEmail);

  const session =
    data.session ||
    (input.client === 'web'
      ? (await supabase.auth.getSession()).data.session
      : null);

  if (!session) {
    return {
      body: { error: 'Session not found' },
      status: 500,
    };
  }

  const user = data.user || session.user;
  if (user) {
    const { error: updateError } = await (
      await createAdminClient()
    ).auth.admin.updateUserById(user.id, {
      user_metadata: buildOtpMetadata({
        client: input.client,
        deviceId: input.deviceId,
        locale: normalizedLocale,
        platform: input.platform,
      }),
    });

    if (updateError) {
      return {
        body: { error: updateError.message },
        status: 500,
      };
    }
  }

  if (input.client === 'mobile') {
    return {
      body: {
        session: {
          access_token: session.access_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          refresh_token: session.refresh_token,
          token_type: session.token_type,
        },
        success: true,
      },
      status: 200,
    };
  }

  return {
    body: { success: true },
    status: 200,
  };
}

export function toOtpErrorResult(error: unknown, fallback: 'send' | 'verify') {
  if (isTurnstileError(error)) {
    return {
      body: { error: error.message },
      status: 400,
    } satisfies OtpFailureResult;
  }

  return fallback === 'send'
    ? {
        body: { error: OTP_SEND_GENERIC_ERROR },
        status: 500,
      }
    : {
        body: { error: OTP_VERIFY_GENERIC_ERROR },
        status: 500,
      };
}
