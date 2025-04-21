import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const challengeId = url.pathname.split('/').filter(Boolean).at(-2);

  if (!challengeId) {
    return NextResponse.json(
      { message: 'Challenge ID missing in URL' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Authenticate user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user has permission to add managers
  const { data: userRole } = await sbAdmin
    .from('nova_roles')
    .select(
      'allow_challenge_management, allow_manage_all_challenges, allow_role_management'
    )
    .eq('email', user.email)
    .single();

  if (
    !userRole?.allow_challenge_management &&
    !userRole?.allow_manage_all_challenges &&
    !userRole?.allow_role_management
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { adminEmail } = body;

    if (!adminEmail) {
      return NextResponse.json(
        { message: 'Admin email is required' },
        { status: 400 }
      );
    }

    // Verify admin exists and can actually manage challenges
    const { data: adminData, error: adminError } = await sbAdmin
      .from('nova_roles')
      .select('email, enabled, allow_challenge_management')
      .eq('email', adminEmail)
      .eq('enabled', true)
      .single();

    if (adminError || !adminData?.allow_challenge_management) {
      return NextResponse.json(
        { message: 'Invalid admin email' },
        { status: 400 }
      );
    }

    // Verify the challenge exists
    const { data: challengeExists, error: challengeError } = await sbAdmin
      .from('nova_challenges')
      .select('id')
      .eq('id', challengeId)
      .single();

    if (challengeError || !challengeExists) {
      console.error(`Challenge with ID ${challengeId} not found`);
      return NextResponse.json(
        { message: 'Challenge not found' },
        { status: 404 }
      );
    }

    // Insert into nova_challenge_manager_emails
    const { data, error } = await sbAdmin
      .from('nova_challenge_manager_emails')
      .insert({
        challenge_id: challengeId,
        email: adminEmail,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique constraint error - admin is already managing this challenge
        return NextResponse.json(
          { message: 'Admin is already managing this challenge' },
          { status: 400 }
        );
      }
      console.error('Error adding admin manager:', error);
      return NextResponse.json(
        { message: 'Failed to add admin manager' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const challengeId = url.pathname.split('/').filter(Boolean).at(-2);
  const adminEmail = url.searchParams.get('adminEmail');

  if (!challengeId || !adminEmail) {
    return NextResponse.json(
      { message: 'Challenge ID or admin email missing' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Authentication checks (similar to your POST method)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Permission checks (similar to your POST method)
  const { data: userRole } = await sbAdmin
    .from('nova_roles')
    .select(
      'allow_challenge_management, allow_manage_all_challenges, allow_role_management'
    )
    .eq('email', user.email)
    .single();

  if (
    !userRole?.allow_challenge_management &&
    !userRole?.allow_manage_all_challenges &&
    !userRole?.allow_role_management
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    // Delete the admin manager relation
    const { error } = await sbAdmin
      .from('nova_challenge_manager_emails')
      .delete()
      .eq('challenge_id', challengeId)
      .eq('email', adminEmail);

    if (error) {
      console.error('Error removing admin manager:', error);
      return NextResponse.json(
        { message: 'Failed to remove admin manager' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Admin manager removed successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
