import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  checkOTPSendLimit,
  extractIPFromHeaders,
} from '@tuturuuu/utils/abuse-protection';
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
  locale: z.string().optional(),
  deviceId: z.string().optional(),
});

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = SendOtpSchema.safeParse(body);

    if (!parsed.success) {
      return jsonWithCors({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email, locale, deviceId } = parsed.data;
    const normalizedLocale = locale || 'en';

    const headersList = await headers();
    const ipAddress = extractIPFromHeaders(headersList);

    const abuseCheck = await checkOTPSendLimit(ipAddress, email);
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

    const infrastructureCheck =
      await checkEmailInfrastructureBlocked(validatedEmail);
    if (infrastructureCheck.isBlocked) {
      return jsonWithCors(
        { error: 'Unable to send verification code to this email address.' },
        { status: 400 }
      );
    }

    const userId = await checkIfUserExists({ email: validatedEmail });

    const sbAdmin = await createAdminClient();
    const supabase = await createClient();
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
        return jsonWithCors({ error: updateError.message }, { status: 500 });
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: validatedEmail,
        options: { data: metadata },
      });

      if (error) {
        return jsonWithCors({ error: error.message }, { status: 400 });
      }
    } else {
      const randomPassword = generateRandomPassword();

      const { error } = await supabase.auth.signUp({
        email: validatedEmail,
        password: randomPassword,
        options: { data: metadata },
      });

      if (error) {
        return jsonWithCors({ error: error.message }, { status: 400 });
      }
    }

    return jsonWithCors({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to send OTP';
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
