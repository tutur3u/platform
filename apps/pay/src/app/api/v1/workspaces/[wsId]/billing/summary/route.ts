import type { WorkspaceBillingSummary } from '@tuturuuu/internal-api';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  checkManageSubscriptionPermission,
  fetchSubscription,
} from '@tuturuuu/payment-core/billing-helper';
import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import {
  getPermissions,
  isPersonalWorkspace,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const actor = await resolveSatelliteRequestActor(request, [
      'pay',
      'platform',
    ]);
    if (!actor) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const permissions = await getPermissions({
      user: actor.user,
      wsId: rawWsId,
    });
    if (!permissions) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    const { admin: sbAdmin, user } = actor;
    const wsId = permissions.wsId;
    const canManageBilling = await checkManageSubscriptionPermission(
      sbAdmin,
      wsId,
      user.id
    );

    if (!canManageBilling) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const polar = createPolarClient();
    const [personal, subscription] = await Promise.all([
      isPersonalWorkspace(wsId),
      fetchSubscription(polar, sbAdmin, wsId),
    ]);
    const response: WorkspaceBillingSummary = {
      isPersonalWorkspace: personal,
      subscription: subscription
        ? {
            billingCycle: subscription.product.recurring_interval ?? null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
            currentPeriodEnd: subscription.currentPeriodEnd ?? null,
            maxSeats: subscription.product.max_seats ?? null,
            name: subscription.product.name || 'Unnamed plan',
            seatCount: subscription.seatCount ?? null,
            status: subscription.status || 'unknown',
            tier: subscription.product.tier ?? null,
          }
        : null,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching workspace billing summary:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
