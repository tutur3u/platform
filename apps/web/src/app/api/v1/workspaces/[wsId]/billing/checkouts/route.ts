import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { PORT } from '@/constants/common';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const BASE_URL =
    process.env.NODE_ENV === 'development'
      ? `http://localhost:${PORT}`
      : 'https://tuturuuu.com';

  const { wsId } = await params;
  const { productId, seats } = await request.json();

  if (!productId || !wsId) {
    return NextResponse.json(
      { error: 'Product ID and Workspace ID are required' },
      { status: 400 }
    );
  }

  if (seats && typeof seats !== 'number') {
    return NextResponse.json(
      { error: 'Seats must be a number' },
      { status: 400 }
    );
  }

  if (seats < 1 || seats > 1000) {
    return NextResponse.json(
      { error: 'Seats must be between 1 and 1000' },
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
    return NextResponse.json(
      { error: hasManageSubscriptionPermissionError.message },
      { status: 500 }
    );
  }

  if (!hasManageSubscriptionPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (seats) {
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

    if (memberCount && seats < memberCount) {
      return NextResponse.json(
        {
          error: `Seat count (${seats}) cannot be less than current active members (${memberCount})`,
        },
        { status: 400 }
      );
    }
  }

  try {
    const polar = createPolarClient();

    const customer = await getOrCreatePolarCustomer({ polar, supabase, wsId });

    const checkoutSession = await polar.checkouts.create({
      metadata: { wsId },
      products: [productId],
      successUrl: `${BASE_URL}/${wsId}/billing/success?checkoutId={CHECKOUT_ID}`,
      isBusinessCustomer: true,
      customerId: customer.id,
      seats,
    });

    return NextResponse.json(checkoutSession);
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
