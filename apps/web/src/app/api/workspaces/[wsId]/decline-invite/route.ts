import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Delete workspace_invites for this user
  const { error: workspaceInvitesError } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('ws_id', wsId)
    .eq('user_id', user.id);

  // Delete workspace_email_invites for this user's email
  // Get email from auth (more reliable)
  let userEmail = user.email;

  // Fallback: try from user_private_details
  if (!userEmail) {
    const { data: userData } = await supabase
      .from('users')
      .select('email:user_private_details(email)')
      .eq('id', user.id)
      .single();

    userEmail = (userData?.email as any)?.[0]?.email;
  }

  let workspaceEmailInvitesError = null;

  if (userEmail) {
    const { error } = await supabase
      .from('workspace_email_invites')
      .delete()
      .eq('ws_id', wsId)
      .eq('email', userEmail);
    workspaceEmailInvitesError = error;
  }

  if (workspaceInvitesError || workspaceEmailInvitesError) {
    console.error(
      'Error declining invite:',
      workspaceInvitesError || workspaceEmailInvitesError
    );
    return NextResponse.json(
      {
        error:
          workspaceInvitesError?.message || workspaceEmailInvitesError?.message,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    message: 'Invites declined successfully',
  });
}
