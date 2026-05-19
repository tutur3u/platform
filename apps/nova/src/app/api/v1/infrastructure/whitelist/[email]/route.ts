import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import { canManageNovaRolesGlobally } from '@/lib/challenge-management-auth';

export async function PUT(req: NextRequest) {
  const user = getNovaAppSessionUserFromRequest(req);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  if (!(await canManageNovaRolesGlobally(user, sbAdmin))) {
    return NextResponse.json(
      { message: 'User does not have permission to manage roles' },
      { status: 403 }
    );
  }

  const { email, enabled } = (await req.json()) as {
    email: string;
    enabled: boolean;
  };

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  const updateData = {
    email,
    enabled: enabled ?? false,
  };

  const { error } = await sbAdmin
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
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email } = await params;

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  if (!(await canManageNovaRolesGlobally(user, sbAdmin))) {
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
