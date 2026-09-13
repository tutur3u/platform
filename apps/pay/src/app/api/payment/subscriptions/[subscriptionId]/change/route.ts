import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { syncSubscriptionToDatabase } from '@tuturuuu/payment-core/polar-subscription-helper';
import {
  getSelfServePlanChangeError,
  isSelfServeWorkspaceProduct,
} from '@tuturuuu/payment-core/self-serve-products';
import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { type NextRequest, NextResponse } from 'next/server';
import { getSubscriptionTransitionSeats } from '@/lib/subscription-seats';

// POST: Change subscription to a different product with immediate proration
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> }
) {
  const { subscriptionId } = await params;

  if (!subscriptionId) {
    return NextResponse.json(
      { error: 'Subscription ID is required' },
      { status: 400 }
    );
  }

  const { productId, expectedSeats, expectedPricePerSeat } = await req.json();

  if (!productId) {
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    );
  }

  const actor = await resolveSatelliteRequestActor(req, ['pay', 'platform']);
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { admin: supabase, user } = actor;

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

  // Check if the user is trying to change to the same product
  if (subscription.product_id === productId) {
    return NextResponse.json(
      { error: 'Cannot change to the same product' },
      { status: 400 }
    );
  }

  // Check permission
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
      `You are not authorized to change subscription for subscriptionId: ${subscriptionId}`
    );
    return NextResponse.json(
      {
        error: 'Unauthorized: You are not authorized to change subscription',
      },
      { status: 403 }
    );
  }

  // Verify the target product exists in our database
  const sbAdmin = supabase;
  const { data: targetProduct, error: targetProductError } = await sbAdmin
    .schema('private')
    .from('workspace_subscription_products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();

  if (targetProductError) {
    console.error('Error fetching target product:', targetProductError);
    return NextResponse.json(
      {
        error: 'An error occurred while fetching the target product',
      },
      { status: 500 }
    );
  }

  if (!targetProduct || !isSelfServeWorkspaceProduct(targetProduct)) {
    return NextResponse.json(
      { error: 'Target product not found' },
      { status: 404 }
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
    .select('pricing_model,tier')
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
  if (currentProduct.pricing_model !== targetProduct.pricing_model) {
    return NextResponse.json(
      { error: 'Changing a paid billing model requires an assisted migration' },
      { status: 409 }
    );
  }

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
    if (capacity.seats !== subscription.seat_count)
      return NextResponse.json(
        {
          error: 'Adjust purchased seats before confirming this plan change',
        },
        { status: 409 }
      );
  }

  if (
    targetProduct.pricing_model === 'seat_based' &&
    (expectedSeats !== subscription.seat_count ||
      expectedPricePerSeat !== targetProduct.price_per_seat)
  )
    return NextResponse.json(
      {
        error:
          'Price or purchased quantity changed. Reload billing and review the plan again.',
      },
      { status: 409 }
    );

  try {
    const polar = createPolarClient();

    // Reconcile an already-applied update instead of invoicing a retry while
    // the asynchronous webhook projection is still behind.
    const live = await polar.subscriptions.get({
      id: subscription.polar_subscription_id,
    });
    if (
      live.productId !== productId &&
      (live.productId !== subscription.product_id ||
        live.seats !== subscription.seat_count)
    )
      return NextResponse.json(
        {
          error:
            'Subscription changed. Reload billing before confirming again.',
        },
        { status: 409 }
      );
    const result =
      live.productId === productId
        ? live
        : await polar.subscriptions.update({
            id: subscription.polar_subscription_id,
            subscriptionUpdate: { productId, prorationBehavior: 'invoice' },
          });
    let syncPending = false;
    try {
      const projection = await syncSubscriptionToDatabase(supabase, {
        ...result,
        metadata: { ...result.metadata, wsId: subscription.ws_id },
      });
      if (!('subscriptionData' in projection) || !projection.subscriptionData)
        syncPending = true;
    } catch {
      // The charge may already have succeeded: never turn this into a retryable
      // billing failure. Webhooks will retry the projection independently.
      syncPending = true;
      console.error('Paid plan changed but billing projection is pending');
    }
    return NextResponse.json({ success: true, syncPending });
  } catch {
    console.error('Error changing subscription');
    return NextResponse.json(
      {
        error: 'Failed to change subscription',
      },
      { status: 500 }
    );
  }
}
