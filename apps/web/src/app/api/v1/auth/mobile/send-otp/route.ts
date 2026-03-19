import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  isTurnstileError,
  resolveTurnstileToken,
} from '@tuturuuu/turnstile/server';
import {
  checkOTPSendAllowed,
  extractIPFromHeaders,
  logAbuseEvent,
  recordOTPSendSuccess,
} from '@tuturuuu/utils/abuse-protection';
import {
  MAX_CODE_LENGTH,
  MAX_LONG_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  checkEmailInfrastructureBlocked,
  checkIfUserExists,
  generateRandomPassword,
  validateEmail,
} from '@tuturuuu/utils/email/server';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonWithCors, optionsWithCors } from '../shared';

const SendOtpSchema = z.object({
  email: z.string().email(),
  locale: z.string().max(MAX_CODE_LENGTH).optional(),
  deviceId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  captchaToken: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
});

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  let ipAddress = 'unknown';
  let validatedEmail: string | undefined;

  try {
    const body = await request.json().catch(() => null);
    const parsed = SendOtpSchema.safeParse(body);

    if (!parsed.success) {
      return jsonWithCors({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email, locale, deviceId, captchaToken } = parsed.data;
    const normalizedLocale = locale || 'en';

    console.log('[mobile/send-otp] Request:', {
      locale: normalizedLocale,
      hasDeviceId: !!deviceId,
      hasCaptchaToken: !!captchaToken,
    });

    const headersList = await headers();
    ipAddress = extractIPFromHeaders(headersList);

    try {
      validatedEmail = await validateEmail(email);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error || 'Invalid email');
      return jsonWithCors({ error: message }, { status: 400 });
    }

    const abuseCheck = await checkOTPSendAllowed(ipAddress, validatedEmail);
    if (!abuseCheck.allowed) {
      return jsonWithCors(
        {
          error:
            abuseCheck.reason || 'Too many requests. Please try again later.',
          retryAfter: abuseCheck.retryAfter,
        },
        { status: 429 }
      );
    }

    const infrastructureCheck =
      await checkEmailInfrastructureBlocked(validatedEmail);
    if (infrastructureCheck.isBlocked) {
      void logAbuseEvent(ipAddress, 'otp_send', {
        email: validatedEmail,
        success: false,
        metadata: {
          stage: 'infrastructure_block',
          blockType: infrastructureCheck.blockType,
        },
      });
      return jsonWithCors(
        { error: 'Unable to send verification code to this email address.' },
        { status: 400 }
      );
    }

    const userId = await checkIfUserExists({ email: validatedEmail });

    const sbAdmin = await createAdminClient();
    const turnstile = resolveTurnstileToken({
      token: captchaToken,
      requireConfiguration: true,
    });
    const useAdminAuth = turnstile.shouldBypassForDev;
    const supabase = useAdminAuth ? sbAdmin : await createClient();

    const metadata: Record<string, string> = {
      locale: normalizedLocale,
      origin: 'TUTURUUU',
    };

    if (deviceId) {
      metadata.device_id = deviceId;
    }

    if (userId) {
      const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
        userId,
        { user_metadata: metadata }
      );

      if (updateError) {
        void logAbuseEvent(ipAddress, 'otp_send', {
          email: validatedEmail,
          success: false,
          metadata: {
            stage: 'update_user',
            message: updateError.message,
          },
        });
        console.error('[mobile/send-otp] updateUserById error:', updateError);
        return jsonWithCors({ error: updateError.message }, { status: 500 });
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: validatedEmail,
        options: { data: metadata, ...turnstile.captchaOptions },
      });

      if (error) {
        void logAbuseEvent(ipAddress, 'otp_send', {
          email: validatedEmail,
          success: false,
          metadata: {
            stage: 'sign_in_with_otp',
            message: error.message,
            code: error.code,
            status: error.status,
          },
        });
        console.error(
          '[mobile/send-otp] signInWithOtp error:',
          JSON.stringify({
            message: error.message,
            status: error.status,
            code: error.code,
          })
        );
        return jsonWithCors({ error: error.message }, { status: 400 });
      }
    } else {
      const randomPassword = generateRandomPassword();

      const { error } = await supabase.auth.signUp({
        email: validatedEmail,
        password: randomPassword,
        options: { data: metadata, ...turnstile.captchaOptions },
      });

      if (error) {
        void logAbuseEvent(ipAddress, 'otp_send', {
          email: validatedEmail,
          success: false,
          metadata: {
            stage: 'sign_up',
            message: error.message,
            code: error.code,
            status: error.status,
          },
        });
        console.error(
          '[mobile/send-otp] signUp error:',
          JSON.stringify({
            message: error.message,
            status: error.status,
            code: error.code,
          })
        );
        return jsonWithCors({ error: error.message }, { status: 400 });
      }
    }

    await recordOTPSendSuccess(ipAddress, validatedEmail);
    return jsonWithCors({ success: true });
  } catch (error) {
    if (isTurnstileError(error)) {
      if (validatedEmail) {
        void logAbuseEvent(ipAddress, 'otp_send', {
          email: validatedEmail,
          success: false,
          metadata: {
            stage: 'captcha',
            message: error.message,
          },
        });
      }
      return jsonWithCors({ error: error.message }, { status: 400 });
    }

    const message =
      error instanceof Error ? error.message : 'Failed to send OTP';
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
