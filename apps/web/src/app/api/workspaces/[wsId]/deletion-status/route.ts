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
    const [secrets, billing] = await Promise.all([
      admin
        .from('workspace_secrets')
        .select('value')
        .eq('ws_id', workspaceId)
        .eq('name', 'PREVENT_WORKSPACE_DELETION'),
      admin.schema('private').rpc('workspace_has_blocking_subscription', {
        p_ws_id: workspaceId,
      }),
    ]);
    if (secrets.error || billing.error || billing.data === null) {
      console.error('Workspace deletion status lookup failed', {
        code: secrets.error?.code ?? billing.error?.code,
      });
      const { body, status } = workspaceDeletionResponse('failed');
      return NextResponse.json(body, { status });
    }

    const protectedWorkspace = secrets.data.some(
      (secret) => secret.value?.trim().toLowerCase() === 'true'
    );
    const status: WorkspaceDeletionStatus = protectedWorkspace
      ? 'protected'
      : billing.data
        ? 'subscription_active'
        : 'ready';
    return NextResponse.json({ status });
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);
