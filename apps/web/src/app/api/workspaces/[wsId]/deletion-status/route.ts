import type { WorkspaceDeletionStatus } from '@tuturuuu/internal-api/workspaces';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import {
  readWorkspaceDeletionOwner,
  workspaceDeletionResponse,
} from '@/lib/workspaces/workspace-deletion';
import { readWorkspaceDeletionEligibility } from '@/lib/workspaces/workspace-deletion-billing';

export const GET = withSessionAuth<{ wsId: string }>(
  async (_request, { supabase, user }, { wsId: id }) => {
    await connection();
    const workspaceId = await normalizeWorkspaceId(id, supabase);
    const owner = await readWorkspaceDeletionOwner({
      actorId: user.id,
      workspaceId,
      supabase,
    });
    if (owner.code !== 'allowed') {
      const { body, status } = workspaceDeletionResponse(owner.code);
      return NextResponse.json(body, { status });
    }

    const admin = await createAdminClient({ noCookie: true });
    const status = await readWorkspaceDeletionEligibility(admin, workspaceId);
    if (status === 'failed') {
      const { body, status: code } = workspaceDeletionResponse('failed');
      return NextResponse.json(body, { status: code });
    }
    return NextResponse.json({
      status: status satisfies WorkspaceDeletionStatus,
    });
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);
