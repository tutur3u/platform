import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  checkManageSubscriptionPermission,
  ensureSubscription,
  fetchProducts,
  fetchWorkspaceOrders,
} from '@/utils/billing-helper';
import { getSeatStatus } from '@/utils/seat-limits';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;

    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();

    const hasManagePermission = await checkManageSubscriptionPermission(
      sbAdmin,
      wsId,
      user.id
    );

    if (!hasManagePermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const polar = createPolarClient();

    // Fetch all billing data in parallel
    const [isPersonal, subscriptionResult, products, seatStatus, orders] =
      await Promise.all([
        isPersonalWorkspace(wsId),
        ensureSubscription(polar, sbAdmin, wsId),
        fetchProducts(polar),
        getSeatStatus(sbAdmin, wsId),
        fetchWorkspaceOrders(sbAdmin, wsId),
      ]);

    // Handle subscription creation failure
    if (!subscriptionResult.subscription) {
      return NextResponse.json(
        { error: subscriptionResult.error || 'SUBSCRIPTION_NOT_FOUND' },
        { status: 404 }
      );
    }

    const subscription = subscriptionResult.subscription;

    return NextResponse.json({
      isPersonalWorkspace: isPersonal,
      hasManagePermission,
      subscription,
      products,
      orders,
      seatList: subscription.seatList,
      seatStatus,
    });
  } catch (error) {
    console.error('Error fetching workspace billing:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
