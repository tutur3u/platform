import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { checkIfUserExists, validateEmail } from '@tuturuuu/utils/email/server';
import { type NextRequest, NextResponse } from 'next/server';
import { DEV_MODE } from '@/constants/common';

export async function POST(request: NextRequest) {
  if (!DEV_MODE) {
    return NextResponse.json(
      { error: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const { email, locale } = await request.json();
    const validatedEmail = await validateEmail(email);
    const normalizedLocale =
      typeof locale === 'string' && locale.trim().length > 0
        ? locale.trim()
        : 'en';

    const metadata = {
      locale: normalizedLocale,
      origin: 'TUTURUUU',
    };
    const sbAdmin = await createAdminClient();
    const userId = await checkIfUserExists({ email: validatedEmail });

    if (userId) {
      const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
        userId,
        {
          user_metadata: metadata,
        }
      );

      if (updateError) {
        console.error('[auth/dev-session] Failed to update user:', updateError);
        return NextResponse.json(
          { error: 'Failed to update user' },
          { status: 500 }
        );
      }
    } else {
      const { error: createError } = await sbAdmin.auth.admin.createUser({
        email: validatedEmail,
        email_confirm: true,
        user_metadata: metadata,
      });

      if (createError) {
        console.error('[auth/dev-session] Failed to create user:', createError);
        return NextResponse.json(
          { error: 'Failed to create user' },
          { status: 500 }
        );
      }
    }

    const { data: linkData, error: linkError } =
      await sbAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: validatedEmail,
      });

    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error(
        '[auth/dev-session] Failed to generate magic link:',
        linkError
      );
      return NextResponse.json(
        { error: 'Failed to generate session' },
        { status: 500 }
      );
    }

    const supabase = await createClient(request);
    const { data: verifyData, error: verifyError } =
      await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      });

    if (verifyError || !verifyData.session) {
      console.error(
        '[auth/dev-session] Failed to verify magic link:',
        verifyError
      );
      return NextResponse.json(
        { error: 'Failed to establish session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/dev-session] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
