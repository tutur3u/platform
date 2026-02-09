import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  checkPasswordLoginLimit,
  clearPasswordLoginFailures,
  extractIPFromHeaders,
  recordPasswordLoginFailure,
} from '@tuturuuu/utils/abuse-protection';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { validateEmail } from '@tuturuuu/utils/email/server';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonWithCors, optionsWithCors } from '../shared';

const PasswordLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  locale: z.string().optional(),
  deviceId: z.string().optional(),
  captchaToken: z.string().optional(),
});

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = PasswordLoginSchema.safeParse(body);

    if (!parsed.success) {
      return jsonWithCors({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email, password, locale, deviceId, captchaToken } = parsed.data;
    const normalizedLocale = locale || 'en';

    const headersList = await headers();
    const ipAddress = extractIPFromHeaders(headersList);

    const abuseCheck = await checkPasswordLoginLimit(ipAddress);
    if (!abuseCheck.allowed) {
      return jsonWithCors(
        {
          error:
            abuseCheck.reason ||
            'Too many failed attempts. Please try again later.',
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
    const sbAdmin = await createAdminClient();
    const captchaOptions = captchaToken ? { captchaToken } : {};

    // In development, when no captcha token is provided, use the admin client
    // which bypasses GoTrue's captcha validation. In production, always use the
    // regular client to enforce captcha.
    const useAdminAuth = DEV_MODE && !captchaToken;
    const supabase = useAdminAuth ? sbAdmin : await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: validatedEmail,
      password,
      options: { ...captchaOptions },
    });

    if (error) {
      console.error(
        '[mobile/password-login] signInWithPassword error:',
        error.message
      );
      void recordPasswordLoginFailure(ipAddress, validatedEmail);
      return jsonWithCors(
        {
          error: 'Invalid login credentials',
          remainingAttempts: abuseCheck.remainingAttempts
            ? abuseCheck.remainingAttempts - 1
            : undefined,
        },
        { status: 401 }
      );
    }

    void clearPasswordLoginFailures(ipAddress);

    if (!data.session || !data.user) {
      return jsonWithCors({ error: 'Session not found' }, { status: 500 });
    }

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

    return jsonWithCors({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to login';
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
