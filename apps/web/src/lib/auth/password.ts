import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  isTurnstileError,
  resolveTurnstileToken,
} from '@tuturuuu/turnstile/server';
import {
  checkPasswordLoginLimit,
  classifyPotentialSpamUserAgent,
  clearPasswordLoginFailures,
  extractIPFromHeaders,
  extractUserAgentFromHeaders,
  logAbuseEvent,
  recordPasswordLoginFailure,
} from '@tuturuuu/utils/abuse-protection';
import {
  MAX_CODE_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LONG_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { validateEmail } from '@tuturuuu/utils/email/server';
import { z } from 'zod';
import { OTP_SPAM_BLOCK_ERROR } from '@/lib/auth/otp';

export const PASSWORD_LOGIN_GENERIC_ERROR = 'Invalid login credentials';

export type PasswordLoginClient = 'mobile' | 'web';

export const PasswordLoginRequestSchema = z.object({
  captchaToken: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  client: z.enum(['web', 'mobile']),
  deviceId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  email: z.string().email().max(MAX_EMAIL_LENGTH),
  locale: z.string().max(MAX_CODE_LENGTH).optional(),
  password: z.string().max(MAX_LONG_TEXT_LENGTH).min(6),
});

type HeadersLike =
  | Headers
  | Map<string, string>
  | Record<string, string | null>;

interface PasswordLoginContext {
  client: PasswordLoginClient;
  endpoint: string;
  headers: HeadersLike;
  request?: Pick<Request, 'headers'>;
}

interface PasswordLoginFailureResult {
  body: Record<string, unknown>;
  status: number;
}

interface PasswordLoginSuccessResult {
  body: Record<string, unknown>;
  status: 200;
}

interface AllowedUserAgentResult {
  failure?: never;
  ipAddress: string;
  userAgent: string | null;
}

interface BlockedUserAgentResult {
  failure: PasswordLoginFailureResult;
  ipAddress?: never;
  userAgent?: never;
}

function buildPasswordLoginMetadata(options: {
  client: PasswordLoginClient;
  deviceId?: string;
  locale: string;
}) {
  const metadata: Record<string, string> = {
    auth_client: options.client,
    locale: options.locale,
    origin: 'TUTURUUU',
  };

  if (options.deviceId) {
    metadata.device_id = options.deviceId;
  }

  return metadata;
}

async function rejectSuspiciousUserAgent(
  context: PasswordLoginContext
): Promise<AllowedUserAgentResult | BlockedUserAgentResult> {
  const ipAddress = extractIPFromHeaders(context.headers);
  const userAgent = extractUserAgentFromHeaders(context.headers);
  const classification = classifyPotentialSpamUserAgent(userAgent, {
    allowNativeAppUserAgents: context.client === 'mobile',
  });

  if (classification.riskLevel !== 'block') {
    return { ipAddress, userAgent };
  }

  await logAbuseEvent(ipAddress, 'api_abuse', {
    endpoint: context.endpoint,
    success: false,
    userAgent: userAgent || undefined,
    metadata: {
      client: context.client,
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
    },
  };
}

export async function passwordLogin(
  input: z.infer<typeof PasswordLoginRequestSchema>,
  context: PasswordLoginContext
): Promise<PasswordLoginFailureResult | PasswordLoginSuccessResult> {
  const suspiciousAgentCheck = await rejectSuspiciousUserAgent(context);
  if (suspiciousAgentCheck.failure) {
    return suspiciousAgentCheck.failure;
  }

  const abuseCheck = await checkPasswordLoginLimit(
    suspiciousAgentCheck.ipAddress
  );
  if (!abuseCheck.allowed) {
    return {
      body: {
        error:
          abuseCheck.reason ||
          'Too many failed attempts. Please try again later.',
        retryAfter: abuseCheck.retryAfter,
      },
      status: 429,
    };
  }

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

  const turnstile = resolveTurnstileToken({
    token: input.captchaToken,
    requireConfiguration: true,
  });
  const sbAdmin = await createAdminClient();
  const supabase = await createClient(context.request);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: validatedEmail,
    password: input.password,
    options: {
      ...turnstile.captchaOptions,
    },
  });

  if (error) {
    await recordPasswordLoginFailure(
      suspiciousAgentCheck.ipAddress,
      validatedEmail
    );
    return {
      body: {
        error: PASSWORD_LOGIN_GENERIC_ERROR,
        remainingAttempts: abuseCheck.remainingAttempts
          ? abuseCheck.remainingAttempts - 1
          : undefined,
      },
      status: 401,
    };
  }

  await clearPasswordLoginFailures(suspiciousAgentCheck.ipAddress);

  const session =
    data.session ||
    (input.client === 'web'
      ? (await supabase.auth.getSession()).data.session
      : null);

  if (!data.user || !session) {
    return {
      body: { error: 'Session not found' },
      status: 500,
    };
  }

  const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
    data.user.id,
    {
      user_metadata: buildPasswordLoginMetadata({
        client: input.client,
        deviceId: input.deviceId,
        locale: input.locale || 'en',
      }),
    }
  );

  if (updateError) {
    return {
      body: { error: updateError.message },
      status: 500,
    };
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

export function toPasswordLoginErrorResult(error: unknown) {
  if (isTurnstileError(error)) {
    return {
      body: { error: error.message },
      status: 400,
    } satisfies PasswordLoginFailureResult;
  }

  return {
    body: { error: 'Failed to login' },
    status: 500,
  } satisfies PasswordLoginFailureResult;
}
