import { validateCrossAppToken } from '@tuturuuu/auth/cross-app';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { generateRandomPassword } from '@tuturuuu/utils/email';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get the request body
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Missing required parameter: token' },
        { status: 400 }
      );
    }

    // Validate the cross-app token
    const userId = await validateCrossAppToken(supabase, token, 'nova');

    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const randomPassword = generateRandomPassword();

    const {
      data: { user },
    } = await sbAdmin.auth.admin.getUserById(userId);

    if (!user?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    await sbAdmin.auth.admin.updateUserById(userId, {
      password: randomPassword,
    });

    const {
      data: { session },
    } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: randomPassword,
    });

    // Return the user ID
    return NextResponse.json({ userId, user, session, valid: true });
  } catch (error) {
    console.error('Error validating cross-app token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
