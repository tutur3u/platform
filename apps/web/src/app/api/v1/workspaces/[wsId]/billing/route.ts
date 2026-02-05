import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ensureSubscription } from '@/app/[locale]/(dashboard)/[wsId]/billing/page';
import { getSeatStatus } from '@/utils/seat-limits';

const fetchProducts = async () => {
  try {
    const polar = createPolarClient();
    const res = await polar.products.list({ isArchived: false });
    return res.result.items ?? [];
  } catch (err) {
    console.error('Failed to fetch products:', err);
    return [];
  }
};

const fetchWorkspaceOrders = async (wsId: string) => {
  try {
    const supabase = await createClient();
    const { data: orders, error } = await supabase
      .from('workspace_orders')
      .select('*, workspace_subscription_products (name, price)')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching workspace orders:', error);
      return [];
    }

    return orders.map((order) => ({
      id: order.id,
      createdAt: order.created_at,
      billingReason: order.billing_reason ?? 'unknown',
      totalAmount: order.total_amount ?? 0,
      originalAmount: order.workspace_subscription_products?.price ?? 0,
      currency: order.currency ?? 'usd',
      status: order.status,
      productName: order.workspace_subscription_products?.name ?? 'N/A',
    }));
  } catch (error) {
    console.error('Error fetching workspace orders:', error);
    return [];
  }
};

const checkManageSubscriptionPermission = async (
  wsId: string,
  userId: string
) => {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: userId,
    p_permission: 'manage_subscription',
  });

  if (error) {
    console.error('Error checking manage_subscription permission:', error);
    return false;
  }

  return data ?? false;
};

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
    const [products, subscriptionResult, orders, hasManagePermission] =
      await Promise.all([
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
      subscription,
      products,
      orders,
      seatStatus,
      hasManagePermission,
    });
  } catch (error) {
    console.error('Error fetching workspace billing:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
