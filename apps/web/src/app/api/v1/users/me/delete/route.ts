import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/api-auth';

const DeleteAccountSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData;

  try {
    const body = await req.json();
    const { email } = DeleteAccountSchema.parse(body);

    // Fetch user's actual email from user_private_details
    const { data: privateDetails, error: detailsError } = await supabase
      .from('user_private_details')
      .select('email')
      .eq('user_id', user.id)
      .single();

    if (detailsError || !privateDetails?.email) {
      return NextResponse.json(
        { message: 'Could not verify account email' },
        { status: 400 }
      );
    }

    // Case-insensitive email comparison
    if (privateDetails.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { message: 'Email address does not match your account' },
        { status: 400 }
      );
    }

    // Use admin client to delete the user from auth.users
    // This fires the existing on_delete_user trigger which:
    // 1. Sets public.users.deleted = true (soft-delete)
    // 2. Deletes from workspace_members (hard-delete memberships)
    const sbAdmin = await createAdminClient();
    const { error: deleteError } = await sbAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return NextResponse.json(
        { message: 'Failed to delete account' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Account deleted successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid email format', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Delete account error:', error);
    return NextResponse.json(
      { message: 'Error processing request' },
      { status: 500 }
    );
  }
}
