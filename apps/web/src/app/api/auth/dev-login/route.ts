import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { checkIfUserExists, validateEmail } from '@tuturuuu/utils/email/server';
import { NextResponse } from 'next/server';
import { DEV_MODE } from '@/constants/common';

export async function POST(request: Request) {
  // Only allow in development mode
  if (!DEV_MODE) {
    return NextResponse.json(
      { error: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const { email, locale } = await request.json();

    const validatedEmail = await validateEmail(email);

    const userId = await checkIfUserExists({ email: validatedEmail });

    // Get and validate origin for redirect URL
    const origin =
      request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL;

    if (
      !origin ||
      (!origin.startsWith('http://') && !origin.startsWith('https://'))
    ) {
      return NextResponse.json(
        { error: 'Invalid or missing origin for redirect URL' },
        { status: 400 }
      );
    }

    const redirectTo = `${origin}/auth/callback`;

    // Get admin client for privileged operations
    const sbAdmin = await createAdminClient();

    if (userId) {
      const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
        userId,
        {
          user_metadata: { locale, origin: 'TUTURUUU' },
        }
      );

      if (updateError) {
        console.error('Error updating user:', updateError);
        return NextResponse.json(
          { error: 'Failed to update user' },
          { status: 500 }
        );
      }

      // Generate session for user using admin privileges
      // This creates a new session token that can be used client-side
      const { data: sessionData, error: sessionError } =
        await sbAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: validatedEmail,
          options: {
            redirectTo,
          },
        });

      if (sessionError) {
        console.error('Error generating session:', sessionError);
        return NextResponse.json(
          { error: 'Failed to generate session' },
          { status: 500 }
        );
      }

      // Return the session properties from the link
      // The client will use the hashed_token from the URL
      return NextResponse.json({
        properties: sessionData.properties,
      });
    } else {
      const { error: signUpError } = await sbAdmin.auth.admin.createUser({
        email: validatedEmail,
        email_confirm: true, // Auto-confirm email in dev mode
        user_metadata: { locale, origin: 'TUTURUUU' },
      });

      if (signUpError) {
        console.error('Error creating user:', signUpError);
        return NextResponse.json(
          { error: 'Failed to create user:' },
          { status: 500 }
        );
      }

      const { data: sessionData, error: sessionError } =
        await sbAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: validatedEmail,
          options: {
            redirectTo,
          },
        });

      if (sessionError) {
        console.error('Error generating session:', sessionError);
        return NextResponse.json(
          { error: 'Failed to generate session' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        properties: sessionData.properties,
      });
    }
  } catch (error) {
    console.error('Dev login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
