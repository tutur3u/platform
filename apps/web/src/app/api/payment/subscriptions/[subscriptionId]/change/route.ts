import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';

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

  const { productId } = await req.json();

  if (!productId) {
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  const { data: targetProduct, error: targetProductError } = await supabase
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

  if (!targetProduct) {
    return NextResponse.json(
      { error: 'Target product not found' },
      { status: 404 }
    );
  }

  try {
    const polar = createPolarClient();

    // Use Admin API to update subscription with proration control
    // The Admin API allows setting prorationBehavior
    const result = await polar.subscriptions.update({
      id: subscription.polar_subscription_id,
      subscriptionUpdate: {
        productId: productId,
        // 'invoice' creates a separate invoice for the prorated amount immediately
        prorationBehavior: 'invoice',
      },
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Error changing subscription:', error);
    return NextResponse.json(
      {
        error: 'Failed to change subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
