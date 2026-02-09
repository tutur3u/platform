import { createClient } from '@tuturuuu/supabase/next/server';
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

    // Fetch all billing data in parallel
    const [
      isPersonal,
      products,
      subscriptionResult,
      orders,
      hasManagePermission,
    ] = await Promise.all([
      isPersonalWorkspace(wsId),
      fetchProducts(),
      ensureSubscription(wsId),
      fetchWorkspaceOrders(wsId),
      checkManageSubscriptionPermission(wsId, user.id),
    ]);

    // Handle subscription creation failure
    if (!subscriptionResult.subscription) {
      return NextResponse.json(
        { error: subscriptionResult.error || 'SUBSCRIPTION_NOT_FOUND' },
        { status: 404 }
      );
    }

    const subscription = subscriptionResult.subscription;

    // Get seat status for the workspace
    const seatStatus = await getSeatStatus(supabase, wsId);

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
