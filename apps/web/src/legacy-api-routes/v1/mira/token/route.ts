/**
 * Retired Mira voice token API.
 * POST /api/v1/mira/token
 *
 * Mira Live tokens are minted only by `/api/v1/live/token` and
 * `/api/v1/assistant/live/token`, which share eligibility, the mint cap and
 * credit reservation. This staff-only path minted provider tokens without
 * those fences, so it never mints. The staff and membership gates stay so an
 * unauthorized caller learns nothing new.
 */

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wsId } = body as { wsId?: string };

    if (!wsId) {
      return Response.json(
        { error: 'Missing wsId parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: await normalizeWorkspaceId(wsId),
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return Response.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return Response.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    if (!isVerifiedTuturuuuStaffSession(user)) {
      return Response.json(
        { error: 'Mira is limited to @tuturuuu.com accounts' },
        { status: 403 }
      );
    }

    return Response.json(
      {
        code: 'LIVE_ROUTE_RETIRED',
        error: 'Use Mira Live from the Assistant.',
      },
      { status: 410 }
    );
  } catch {
    console.error('Retired Mira token route failed');
    return Response.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
