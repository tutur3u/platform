import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { listPendingWorkspaceInvitations } from '@/lib/workspace-invitations/status';
import type { CurrentUserReadContext, SectionOutcome } from './context';

/** Body of `GET /api/workspaces/invitations`: the caller's own pending invites. */
export async function readPendingInvitations(
  ctx: Pick<CurrentUserReadContext, 'user'>
): Promise<SectionOutcome> {
  const { user } = ctx;
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;

  try {
    const invitations = await listPendingWorkspaceInvitations(admin, {
      authEmail: user.email ?? null,
      userId: user.id,
    });

    return {
      body: { invitations },
      headers: { 'Cache-Control': 'private, no-store' },
      status: 200,
    };
  } catch (error) {
    return {
      body: {
        error: 'Failed to list workspace invitations',
        errorCode: 'WORKSPACE_INVITATIONS_LOOKUP_FAILED',
      },
      log: [
        'Failed to list workspace invitations:',
        { error, userId: user.id },
      ],
      status: 500,
    };
  }
}
