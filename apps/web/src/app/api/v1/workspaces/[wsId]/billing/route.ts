import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  checkManageSubscriptionPermission,
  fetchSubscription,
  fetchCreditPacks,
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
    const [
      isPersonal,
      subscription,
      products,
      creditPacks,
      seatStatus,
      orders,
    ] = await Promise.all([
      isPersonalWorkspace(wsId),
      fetchSubscription(polar, sbAdmin, wsId),
      fetchProducts(polar),
      fetchCreditPacks(sbAdmin),
      getSeatStatus(sbAdmin, wsId),
      fetchWorkspaceOrders(sbAdmin, wsId),
    ]);

    // Handle subscription creation failure
    if (!subscription) {
      return NextResponse.json(
        { error: 'SUBSCRIPTION_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      isPersonalWorkspace: isPersonal,
      hasManagePermission,
      subscription,
      products,
      creditPacks,
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
