import { createPolarClient } from '@tuturuuu/payment/polar/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authorizeRequest } from '@/lib/api-auth';
import { revokeSeatFromMember } from '@/utils/polar-seat-helper';

const DeleteAccountSchema = z.object({
  email: z.string().email(),
});

// --- Types ---

type WorkspaceSubscriptionInfo = {
  wsId: string;
  wsName: string;
  wsPersonal: boolean;
  tier: string;
  memberCount: number;
  polarSubscriptionId: string | null;
  pricingModel: string | null;
};

type CategorizedWorkspaces = {
  blocking: WorkspaceSubscriptionInfo[];
  singleMemberFree: WorkspaceSubscriptionInfo[];
  multiMember: WorkspaceSubscriptionInfo[];
};

// --- Shared helper using RPC ---

async function getUserWorkspaceSubscriptionInfo(
  sbAdmin: TypedSupabaseClient,
  userId: string
): Promise<CategorizedWorkspaces> {
  const { data, error } = await sbAdmin.rpc(
    'get_user_workspace_subscription_info',
    { _user_id: userId }
  );

  if (error) throw error;

  const result: CategorizedWorkspaces = {
    blocking: [],
    singleMemberFree: [],
    multiMember: [],
  };

  for (const row of data ?? []) {
    const isSoleMember = (row.member_count ?? 0) <= 1;
    const hasPaidSubscription =
      row.subscription_tier != null && row.subscription_tier !== 'FREE';

    const info: WorkspaceSubscriptionInfo = {
      wsId: row.ws_id,
      wsName: row.ws_name ?? 'Unnamed Workspace',
      wsPersonal: row.ws_personal ?? false,
      tier: row.subscription_tier ?? 'FREE',
      memberCount: Number(row.member_count ?? 0),
      polarSubscriptionId: row.polar_subscription_id ?? null,
      pricingModel: row.pricing_model ?? null,
    };

    if (isSoleMember && hasPaidSubscription) {
      // Personal workspaces are auto-cleaned, don't block deletion
      if (row.ws_personal) {
        result.singleMemberFree.push(info);
      } else {
        result.blocking.push(info);
      }
    } else if (isSoleMember) {
      result.singleMemberFree.push(info);
    } else {
      result.multiMember.push(info);
    }
  }

  return result;
}

// --- GET: Pre-check endpoint ---

export async function GET(req: NextRequest) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user } = authData;

  try {
    const sbAdmin = await createAdminClient();
    const categorized = await getUserWorkspaceSubscriptionInfo(
      sbAdmin,
      user.id
    );

    const canDelete = categorized.blocking.length === 0;

    return NextResponse.json({
      canDelete,
      blockingWorkspaces: categorized.blocking.map((ws) => ({
        wsId: ws.wsId,
        wsName: ws.wsName,
        tier: ws.tier,
        memberCount: ws.memberCount,
      })),
      cleanupSummary: {
        workspacesToDelete: categorized.singleMemberFree.length,
        seatsToRevoke: categorized.multiMember.length,
      },
    });
  } catch (error) {
    // Fail-closed: if we can't check, block deletion
    console.error('Pre-check error:', error);
    return NextResponse.json(
      { message: 'Failed to check subscription status' },
      { status: 500 }
    );
  }
}

// --- POST: Delete account with subscription cleanup ---

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

    const sbAdmin = await createAdminClient();

    // Re-validate subscription status (guards against race conditions)
    const categorized = await getUserWorkspaceSubscriptionInfo(
      sbAdmin,
      user.id
    );

    if (categorized.blocking.length > 0) {
      return NextResponse.json(
        {
          message: 'Cannot delete account with active paid subscriptions',
          blockingWorkspaces: categorized.blocking.map((ws) => ({
            wsName: ws.wsName,
            tier: ws.tier,
          })),
        },
        { status: 409 }
      );
    }

    // --- Subscription cleanup (best-effort) ---
    const polar = createPolarClient();

    // Revoke seats in multi-member workspaces
    const seatRevocations = categorized.multiMember.map(async (ws) => {
      try {
        await revokeSeatFromMember(polar, sbAdmin, ws.wsId, user.id);
      } catch (error) {
        console.error(`Failed to revoke seat in workspace ${ws.wsId}:`, error);
      }
    });

    // Cancel subscriptions in single-member workspaces (will be orphaned)
    const subscriptionCancellations = categorized.singleMemberFree
      .filter((ws) => ws.polarSubscriptionId)
      .map(async (ws) => {
        try {
          await polar.subscriptions.revoke({
            id: ws.polarSubscriptionId!,
          });
          console.log(
            `Revoked subscription ${ws.polarSubscriptionId} for workspace ${ws.wsId}`
          );
        } catch (error) {
          console.error(
            `Failed to revoke subscription for workspace ${ws.wsId}:`,
            error
          );
        }
      });

    await Promise.allSettled([
      ...seatRevocations,
      ...subscriptionCancellations,
    ]);

    // Delete the user from auth.users
    // This fires the existing on_delete_user trigger which:
    // 1. Sets public.users.deleted = true (soft-delete)
    // 2. Deletes from workspace_members (hard-delete memberships)
    const { error: deleteError } = await sbAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return NextResponse.json(
        { message: 'Failed to delete account' },
        { status: 500 }
      );
    }

    // Post-deletion: hard-delete single-member non-personal workspaces
    const workspaceDeletions = categorized.singleMemberFree
      .filter((ws) => !ws.wsPersonal)
      .map(async (ws) => {
        try {
          const { error } = await sbAdmin
            .from('workspaces')
            .delete()
            .eq('id', ws.wsId);

          if (error) {
            console.error(`Failed to delete workspace ${ws.wsId}:`, error);
          } else {
            console.log(`Deleted orphaned workspace ${ws.wsId}`);
          }
        } catch (error) {
          console.error(`Error deleting workspace ${ws.wsId}:`, error);
        }
      });

    await Promise.allSettled(workspaceDeletions);

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
