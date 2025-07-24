import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ optionId: string }> }
) {
  const { optionId } = await params;
  const { userType } = await req.json();
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  // Validate userType
  const validUserTypes = ['PLATFORM', 'GUEST'] as const;
  if (!validUserTypes.includes(userType as any)) {
    return NextResponse.json({ message: 'Invalid user type' }, { status: 400 });
  }

  // Optional: For extra safety, only allow platform users (creators/admins) to delete
  if (userType === 'PLATFORM') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    // TODO: Implement proper role-based authorization
    // Verify user has permission to delete this specific option
  } else {
    // For guest users, implement appropriate authorization logic
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // If guest deletion is allowed, you can remove this check

  // Delete poll option (cascades to votes due to FK constraint)
  const { error } = await sbAdmin
    .from('poll_options')
    .delete()
    .eq('id', optionId);

  if (error) {
    return NextResponse.json(
      { message: 'Failed to delete option', error },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Option deleted', optionId });
}
