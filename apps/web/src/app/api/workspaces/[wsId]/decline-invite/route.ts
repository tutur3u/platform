import { NextResponse } from 'next/server';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/app/api/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export const POST = withSessionAuth<{ wsId: string }>(
  async (_request, { supabase, user }, { wsId }) => {
    const { error: workspaceInvitesError } = await supabase
      .from('workspace_invites')
      .delete()
      .eq('ws_id', wsId)
      .eq('user_id', user.id);

    let userEmail = user.email;

    if (!userEmail) {
      const { data: userData } = await supabase
        .from('users')
        .select('email:user_private_details(email)')
        .eq('id', user.id)
        .single();

      userEmail = (userData?.email as { email?: string }[] | undefined)?.[0]
        ?.email;
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
      serverLogger.error('Error declining invite:', {
        workspaceInvitesError,
        workspaceEmailInvitesError,
      });
      return NextResponse.json(
        {
          error:
            workspaceInvitesError?.message ||
            workspaceEmailInvitesError?.message,
          errorCode: 'DECLINE_INVITE_FAILED',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Invites declined successfully',
    });
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);
