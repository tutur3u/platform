import { createAdminClient } from '@tuturuuu/supabase/next/server';
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
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Get admin client for privileged operations
    const sbAdmin = await createAdminClient();

    // Get user by email
    const { data: users, error: userError } =
      await sbAdmin.auth.admin.listUsers();

    if (userError) {
      console.error('Error listing users:', userError);
      return NextResponse.json(
        { error: 'Failed to find user' },
        { status: 500 }
      );
    }

    const user = users.users.find((u) => u.email === email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate session for user using admin privileges
    // This creates a new session token that can be used client-side
    const { data: sessionData, error: sessionError } =
      await sbAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email!,
        options: {
          redirectTo: `${request.headers.get('origin')}/auth/callback`,
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
  } catch (error) {
    console.error('Dev login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
