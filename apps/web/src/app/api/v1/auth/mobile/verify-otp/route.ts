import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  checkOTPVerifyLimit,
  clearOTPVerifyFailures,
  extractIPFromHeaders,
  recordOTPVerifyFailure,
} from '@tuturuuu/utils/abuse-protection';
import { validateEmail, validateOtp } from '@tuturuuu/utils/email/server';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonWithCors, optionsWithCors } from '../shared';

const VerifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string(),
  locale: z.string().optional(),
  deviceId: z.string().optional(),
});

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = VerifyOtpSchema.safeParse(body);

    if (!parsed.success) {
      return jsonWithCors({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email, otp, locale, deviceId } = parsed.data;
    const normalizedLocale = locale || 'en';

    const headersList = await headers();
    const ipAddress = extractIPFromHeaders(headersList);

    let validatedEmail: string;

    try {
      validatedEmail = await validateEmail(email);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error || 'Invalid email');
      return jsonWithCors({ error: message }, { status: 400 });
    }
    const abuseCheck = await checkOTPVerifyLimit(ipAddress, validatedEmail);
    if (!abuseCheck.allowed) {
      return jsonWithCors(
        {
          error:
            abuseCheck.reason || 'Too many attempts. Please try again later.',
          retryAfter: abuseCheck.retryAfter,
        },
        { status: 429 }
      );
    }

    let validatedOtp: string;

    try {
      validatedOtp = await validateOtp(otp);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error || 'Invalid verification code');
      return jsonWithCors({ error: message }, { status: 400 });
    }
    const supabase = await createClient();

    const { data, error } = await supabase.auth.verifyOtp({
      email: validatedEmail,
      token: validatedOtp,
      type: 'email',
    });

    if (error) {
      void recordOTPVerifyFailure(ipAddress, validatedEmail);
      return jsonWithCors({ error: error.message }, { status: 400 });
    }

    void clearOTPVerifyFailures(ipAddress, validatedEmail);

    const session = data.session
      ? data.session
      : (await supabase.auth.getSession()).data.session;

    if (!session) {
      return jsonWithCors({ error: 'Session not found' }, { status: 500 });
    }

    const sbAdmin = await createAdminClient();
    if (data.user) {
      const metadata: Record<string, string> = {
        locale: normalizedLocale,
        origin: 'TUTURUUU',
      };

      if (deviceId) {
        metadata.device_id = deviceId;
      }

      const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
        data.user.id,
        {
          user_metadata: metadata,
        }
      );

      if (updateError) {
        return jsonWithCors({ error: updateError.message }, { status: 500 });
      }
    }

    return jsonWithCors({
      success: true,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to verify OTP';
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
