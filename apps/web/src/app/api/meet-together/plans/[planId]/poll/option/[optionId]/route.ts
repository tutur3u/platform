import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function DELETE(req: Request) {
  const { optionId, userType } = await req.json();
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  // Optional: For extra safety, only allow platform users (creators/admins) to delete
  if (userType === 'PLATFORM') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    // Optionally: Check if user is creator/admin (not just any user)
    // ...you can fetch poll/plan by optionId here if you want fine-grained checks
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
