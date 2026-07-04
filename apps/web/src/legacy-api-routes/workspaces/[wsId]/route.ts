import {
  loadTaskBoardGuestSharesForWorkspace,
  summarizeTaskBoardGuestShares,
} from '@tuturuuu/apis/tu-do/board-access';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_ID_LENGTH,
  MAX_WORKSPACE_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';

const UpdateWorkspaceSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(1)
    .max(MAX_ID_LENGTH)
    .regex(/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/)
    .optional(),
  name: z.string().min(1).max(MAX_WORKSPACE_NAME_LENGTH),
});

export const GET = withSessionAuth<{ wsId: string }>(
  async (_request, { supabase, user }, { wsId: id }) => {
    const wsId = await normalizeWorkspaceId(id, supabase);

    const { data, error } = await supabase
      .from('workspaces')
      .select('*, workspace_members!inner(user_id)')
      .eq('id', wsId)
      .eq('workspace_members.user_id', user.id)
      .single();

    if (error || !data?.workspace_members[0]?.user_id) {
      const sbAdmin = await createAdminClient({ noCookie: true });
      const guestShares = await loadTaskBoardGuestSharesForWorkspace({
        sbAdmin,
        user,
        workspaceId: wsId,
      });
      const guestSummary = summarizeTaskBoardGuestShares(guestShares);

      if (guestSummary.boardCount > 0) {
        const { data: guestWorkspace, error: guestWorkspaceError } =
          await sbAdmin.from('workspaces').select('*').eq('id', wsId).single();

        if (!guestWorkspaceError && guestWorkspace) {
          return NextResponse.json(
            {
              ...guestWorkspace,
              access_type: 'guest',
              guest_board_count: guestSummary.boardCount,
              guest_highest_permission: guestSummary.highestPermission,
              guest_landing_path: guestSummary.landingPath,
              guest_products: ['tasks'],
            },
            {
              headers: {
                'Cache-Control':
                  'private, max-age=60, stale-while-revalidate=30',
              },
            }
          );
        }
      }

      return NextResponse.json(
        { message: 'Error fetching workspaces' },
        { status: 500 }
      );
    }

    const { workspace_members: workspaceMembers, ...workspaceData } = data;

    void workspaceMembers;

    return NextResponse.json(workspaceData, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
      },
    });
  },
  {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    cache: { maxAge: 60, swr: 30 },
  }
);

export const PUT = withSessionAuth<{ wsId: string }>(
  async (request, { supabase, user }, { wsId: id }) => {
    try {
      const wsId = await normalizeWorkspaceId(id, supabase);

      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id, personal, workspace_members!inner(user_id)')
        .eq('id', wsId)
        .eq('workspace_members.user_id', user.id)
        .maybeSingle();

      if (workspaceError) {
        return NextResponse.json(
          { message: 'Error verifying workspace access' },
          { status: 500 }
        );
      }

      if (!workspace) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      if (!workspace.personal) {
        const permissions = await getPermissions({ wsId, request });

        if (!permissions?.containsPermission('manage_workspace_settings')) {
          return NextResponse.json(
            { message: 'Insufficient permissions to update workspace' },
            { status: 403 }
          );
        }
      }

      const body = await request.json();
      const parsedBody = UpdateWorkspaceSchema.parse(body);
      const nextHandle = parsedBody.handle?.toLowerCase();

      if (
        nextHandle &&
        ['internal', 'onboarding', 'home', 'login', 'personal'].includes(
          nextHandle
        )
      ) {
        return NextResponse.json(
          { message: 'Workspace handle is reserved' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('workspaces')
        .update({
          handle: nextHandle,
          name: parsedBody.name,
        })
        .select('id')
        .eq('id', wsId);

      if (error?.code === '23505') {
        return NextResponse.json(
          { message: 'Workspace handle already exists' },
          { status: 409 }
        );
      }

      if (error) {
        return NextResponse.json(
          { message: 'Error updating workspace' },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) {
        return NextResponse.json(
          { message: 'Workspace not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ message: 'success' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: error.issues },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { message: 'Error updating workspace' },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withSessionAuth<{ wsId: string }>(
  async (request, { supabase }, { wsId: id }) => {
    const wsId = await normalizeWorkspaceId(id, supabase);

    const { data: wsData } = await supabase
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .single();

    if (wsData?.personal) {
      return NextResponse.json(
        { message: 'Personal workspaces cannot be manually deleted.' },
        { status: 403 }
      );
    }

    const permissions = await getPermissions({ wsId, request });

    if (!permissions?.containsPermission('manage_workspace_settings')) {
      return NextResponse.json(
        { message: 'Insufficient permissions to delete workspace' },
        { status: 403 }
      );
    }

    const preventDeletion = await verifyHasSecrets(wsId, [
      'PREVENT_WORKSPACE_DELETION',
    ]);

    if (preventDeletion) {
      return NextResponse.json(
        { message: 'Workspace deletion is disabled for this workspace.' },
        { status: 403 }
      );
    }

    try {
      const { data: subscription, error: subError } = await supabase
        .from('workspace_subscriptions')
        .select('polar_subscription_id')
        .eq('ws_id', wsId)
        .neq('status', 'canceled')
        .maybeSingle();

      if (subError) throw subError;

      if (subscription?.polar_subscription_id) {
        const polar = createPolarClient();
        await polar.subscriptions.revoke({
          id: subscription.polar_subscription_id,
        });
      }
    } catch {
      // Continue with workspace deletion even if subscription cancellation fails
    }

    const { error } = await supabase.from('workspaces').delete().eq('id', wsId);

    if (error) {
      return NextResponse.json(
        { message: 'Error deleting workspace' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);
