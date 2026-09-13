import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  getSelfServePlanChangeError,
  isSelfServeWorkspaceProduct,
} from '@tuturuuu/payment-core/self-serve-products';
import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { type NextRequest, NextResponse } from 'next/server';
import { PORT } from '@/constants/common';
import { getSubscriptionTransitionSeats } from '@/lib/subscription-seats';

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

  const actor = await resolveSatelliteRequestActor(request, [
    'pay',
    'platform',
  ]);
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { admin: supabase, user } = actor;

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

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', wsId)
    .maybeSingle();

  if (workspaceError) {
    console.error('Error fetching workspace:', workspaceError);
    return NextResponse.json(
      { error: 'An error occurred while fetching the workspace' },
      { status: 500 }
    );
  }

  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  // Get subscription from database
  const { data: subscription, error: subscriptionError } = await supabase
    .from('workspace_subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('ws_id', wsId)
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

  const { data: targetProduct, error: targetError } = await supabase
    .schema('private')
    .from('workspace_subscription_products')
    .select('tier, pricing_model, archived, price, min_seats, max_seats')
    .eq('id', productId)
    .maybeSingle();
  if (targetError)
    return NextResponse.json(
      { error: 'Product availability could not be verified' },
      { status: 503 }
    );
  if (!targetProduct || !isSelfServeWorkspaceProduct(targetProduct)) {
    return NextResponse.json(
      { error: 'This product is not available for new purchases' },
      { status: 400 }
    );
  }
  if (!subscription.product_id)
    return NextResponse.json(
      { error: 'Current pricing model unavailable' },
      { status: 503 }
    );
  const { data: currentProduct, error: currentError } = await supabase
    .schema('private')
    .from('workspace_subscription_products')
    .select('tier, pricing_model')
    .eq('id', subscription.product_id)
    .maybeSingle();
  if (currentError || !currentProduct)
    return NextResponse.json(
      { error: 'Current pricing model unavailable' },
      { status: 503 }
    );
  const transitionError = getSelfServePlanChangeError(
    currentProduct.tier,
    targetProduct.tier
  );
  if (transitionError)
    return NextResponse.json({ error: transitionError }, { status: 400 });
  let seats: number | undefined;
  if (targetProduct.pricing_model === 'seat_based') {
    const capacity = await getSubscriptionTransitionSeats(
      supabase,
      subscription,
      currentProduct.pricing_model,
      targetProduct
    );
    if (!capacity.ok)
      return NextResponse.json(
        { error: capacity.error },
        { status: capacity.status }
      );
    seats = capacity.seats;
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
