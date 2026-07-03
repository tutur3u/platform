import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  isWorkspaceUuidLiteral,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export const POST = withSessionAuth<{ wsId: string }>(
  async (_request, { supabase, user }, { wsId: rawWsId }) => {
    let wsId: string;
    if (isWorkspaceUuidLiteral(rawWsId)) {
      wsId = rawWsId;
    } else {
      try {
        wsId = await normalizeWorkspaceId(rawWsId, supabase);
      } catch {
        return NextResponse.json(
          {
            error: 'Workspace not found',
            errorCode: 'WORKSPACE_NOT_FOUND',
          },
          { status: 404 }
        );
      }
    }

    if (!isWorkspaceUuidLiteral(wsId)) {
      return NextResponse.json(
        {
          error: 'Workspace not found',
          errorCode: 'WORKSPACE_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    const sbAdmin = await createAdminClient();
    const authEmail = user.email?.trim().toLowerCase() || null;
    const { data: privateDetails, error: privateDetailsError } = await sbAdmin
      .from('user_private_details')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (privateDetailsError) {
      serverLogger.error('Failed to read invite recipient private email:', {
        error: privateDetailsError,
        userId: user.id,
        wsId,
      });
    }

    const privateEmail = privateDetails?.email?.trim().toLowerCase() || null;
    const candidateEmails = [...new Set([authEmail, privateEmail])].filter(
      (email): email is string => typeof email === 'string' && email.length > 0
    );

    const { error: workspaceInvitesError } = await sbAdmin
      .from('workspace_invites')
      .delete()
      .eq('ws_id', wsId)
      .eq('user_id', user.id);

    let workspaceEmailInvitesError = null;

    if (candidateEmails.length) {
      const { error } = await sbAdmin
        .from('workspace_email_invites')
        .delete()
        .eq('ws_id', wsId)
        .in('email', candidateEmails);
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
            workspaceEmailInvitesError?.message ||
            'Failed to decline invite',
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
