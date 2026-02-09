import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { createCustomerSession } from '@/utils/customer-helper';

// PATCH: Reactivate subscription (cancel_at_period_end = false)
export async function PATCH(
  _req: NextRequest,
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
    .from('workspace_subscriptions')
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
      `You are not authorized to reactivate subscription for subscriptionId: ${subscriptionId}`
    );
    return NextResponse.json(
      {
        error:
          'Unauthorized: You are not authorized to reactivate subscription',
      },
      { status: 403 }
    );
  }

  try {
    const polar = createPolarClient();

    const session = await createCustomerSession({
      polar,
      supabase,
      wsId: subscription.ws_id,
    });

    // Only allow reactivation (cancel_at_period_end = false)
    const result = await polar.customerPortal.subscriptions.update(
      {
        customerSession: session.token,
      },
      {
        id: subscription.polar_subscription_id,
        customerSubscriptionUpdate: {
          cancelAtPeriodEnd: false,
        },
      }
    );

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to reactivate subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
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
    .from('workspace_subscriptions')
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
      `You are not authorized to reactivate subscription for subscriptionId: ${subscriptionId}`
    );
    return NextResponse.json(
      {
        error:
          'Unauthorized: You are not authorized to reactivate subscription',
      },
      { status: 403 }
    );
  }

  try {
    const polar = createPolarClient();

    const session = await createCustomerSession({
      polar,
      supabase,
      wsId: subscription.ws_id,
    });

    const result = await polar.customerPortal.subscriptions.cancel(
      {
        customerSession: session.token,
      },
      {
        id: subscription.polar_subscription_id,
      }
    );

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to cancel subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
