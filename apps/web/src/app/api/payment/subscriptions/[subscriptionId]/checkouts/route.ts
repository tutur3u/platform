import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { PORT } from '@/constants/common';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> }
) {
  const BASE_URL =
    process.env.NODE_ENV === 'development'
      ? `http://localhost:${PORT}`
      : 'https://tuturuuu.com';

  const { subscriptionId } = await params;

  const { wsId, productId } = await request.json();

  // Validate that you have the info you need
  if (!subscriptionId || !productId || !wsId) {
    return NextResponse.json(
      { error: 'Subscription ID, Product ID and Workspace ID are required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    data: hasManageSubscriptionPermission,
    error: hasManageSubscriptionPermissionError,
  } = await supabase.rpc('has_workspace_permission', {
    p_user_id: user.id,
    p_ws_id: wsId,
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
      `You are not authorized to create subscription for wsId: ${wsId}`
    );
    return NextResponse.json(
      { error: 'Unauthorized: You are not authorized to create subscription' },
      { status: 403 }
    );
  }

  // Get subscription from database
  const { data: subscription, error: subscriptionError } = await supabase
    .from('workspace_subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (subscriptionError) {
    console.error('Error fetching subscription:', subscriptionError);
    return NextResponse.json(
      { error: 'An error occurred while fetching the subscription' },
      { status: 500 }
    );
  }

  if (!subscription) {
    return NextResponse.json(
      { error: 'Subscription not found' },
      { status: 404 }
    );
  }

  const { count: memberCount, error: memberCountError } = await supabase
    .from('workspace_members')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  if (memberCountError) {
    return NextResponse.json(
      { error: memberCountError.message },
      { status: 500 }
    );
  }

  const seats = memberCount || 0;

  if (seats && !Number.isInteger(seats)) {
    return NextResponse.json(
      { error: 'Seats must be an integer' },
      { status: 400 }
    );
  }

  if (seats < 1 || seats > 1000) {
    return NextResponse.json(
      { error: 'Seats must be between 1 and 1000' },
      { status: 400 }
    );
  }

  // HERE is where you add the metadata
  try {
    const polar = createPolarClient();

    const checkoutSession = await polar.checkouts.create({
      subscriptionId: subscription.polar_subscription_id,
      metadata: { wsId },
      products: [productId],
      requireBillingAddress: true,
      seats,
      embedOrigin: BASE_URL,
      successUrl: `${BASE_URL}/${wsId}/billing/success?checkoutId={CHECKOUT_ID}`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Failed to create checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
