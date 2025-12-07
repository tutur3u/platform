import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ subscriptionId: string }> }
) {
  const { subscriptionId } = await params;

  if (!subscriptionId) {
    return NextResponse.json(
      { error: 'Subscription ID is required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: subscription } = await supabase
    .from('workspace_subscription')
    .select('*')
    .eq('id', subscriptionId)
    .single();

  if (!subscription) {
    return NextResponse.json(
      { error: 'Subscription not found' },
      { status: 404 }
    );
  }

  const {
    data: hasManageSubscriptionPermission,
    error: hasManageSubscriptionPermissionError,
  } = await supabase.rpc('has_workspace_permission', {
    p_user_id: user.id,
    p_ws_id: subscription.ws_id,
    p_permission: 'manage_subscription',
  });

  if (hasManageSubscriptionPermissionError) {
    console.error(
      'Error checking manage subscription permission:',
      hasManageSubscriptionPermissionError
    );
    return NextResponse.json(
      {
        error: `Error checking manage subscription permission: ${hasManageSubscriptionPermissionError.message}`,
      },
      { status: 500 }
    );
  }

  if (!hasManageSubscriptionPermission) {
    console.error(
      `You are not authorized to view orders for subscriptionId: ${subscriptionId}`
    );
    return NextResponse.json(
      {
        error:
          'Unauthorized: You are not authorized to view orders for this subscription',
      },
      { status: 403 }
    );
  }

  try {
    // Create customer session and fetch orders
    const polar = createPolarClient();

    // Create customer session to get authenticated access
    const customerSession = await polar.customerSessions.create({
      externalCustomerId: user.id,
    });

    if (!customerSession) {
      return NextResponse.json(
        { error: 'Failed to create customer session' },
        { status: 500 }
      );
    }

    // Fetch orders for this subscription
    const orders = await polar.customerPortal.orders.list(
      {
        customerSession: customerSession.token,
      },
      {
        subscriptionId: subscription.polar_subscription_id,
      }
    );

    return NextResponse.json({
      orders: orders.result?.items ?? [],
    });
  } catch (error) {
    console.error('Error fetching subscription orders:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
