import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function PUT(req: NextRequest) {
  const { email, enabled } = (await req.json()) as {
    email: string;
    enabled: boolean;
  };

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  const supabase = await createClient();

  const updateData = {
    email,
    enabled: enabled ?? false,
  };

  const { error } = await supabase
    .from('platform_email_roles')
    .update(updateData)
    .eq('email', email);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating email in whitelist' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email } = await params;

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();

  const { data: roleData, error: roleError } = await sbAdmin
    .from('platform_user_roles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (roleError) {
    console.log(roleError);
    return NextResponse.json(
      { message: 'Error fetching user role' },
      { status: 500 }
    );
  }

  if (!roleData) {
    return NextResponse.json(
      { message: 'User role not found' },
      { status: 404 }
    );
  }

  if (!roleData.allow_role_management) {
    return NextResponse.json(
      { message: 'User does not have permission to manage roles' },
      { status: 403 }
    );
  }

  const { error } = await sbAdmin
    .from('platform_email_roles')
    .delete()
    .eq('email', email)
    .select('*')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting email from whitelist' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
