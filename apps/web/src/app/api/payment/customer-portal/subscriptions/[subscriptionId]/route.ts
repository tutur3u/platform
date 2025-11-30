import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  req: NextRequest,
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

    // Parse request body to check for product update
    const body = await req.json().catch(() => ({}));
    const { productId } = body;

    const polar = createPolarClient({
      sandbox: process.env.NODE_ENV === 'development',
    });

    const session = await polar.customerSessions.create({
      externalCustomerId: user.id,
    });

    // Prepare the subscription update payload
    const customerSubscriptionUpdate: any = {
      cancelAtPeriodEnd: false,
    };

    // If productId is provided, update the product
    if (productId) {
      // Get the product from Polar to find the correct price ID
      const polarProduct = await polar.products.get({ id: productId });

      if (!polarProduct || polarProduct.isArchived) {
        return NextResponse.json(
          { error: 'No product found' },
          { status: 400 }
        );
      }

      customerSubscriptionUpdate.productId = polarProduct.id;
      // Note: Proration is automatically handled by Polar based on organization settings.
    }

    const result = await polar.customerPortal.subscriptions.update(
      {
        customerSession: session.token,
      },
      {
        id: subscription.polar_subscription_id,
        customerSubscriptionUpdate,
      }
    );

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update subscription',
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

    const polar = createPolarClient({
      sandbox: process.env.NODE_ENV === 'development',
    });

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
