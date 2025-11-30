import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';

// PATCH: Reactivate subscription (cancel_at_period_end = false)
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> }
) {
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { subscriptionId } = await params;

  if (!subscriptionId) {
    return NextResponse.json(
      { error: 'Subscription ID is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();

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

    const polar = createPolarClient();

    const session = await polar.customerSessions.create({
      externalCustomerId: user.id,
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
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { subscriptionId } = await params;

  if (!subscriptionId) {
    return NextResponse.json(
      { error: 'Subscription ID is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();

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

    const polar = createPolarClient();

    const session = await polar.customerSessions.create({
      externalCustomerId: user.id,
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
