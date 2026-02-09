import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  if (!orderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: order } = await supabase
    .from('workspace_orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const {
    data: hasManageSubscriptionPermission,
    error: hasManageSubscriptionPermissionError,
  } = await supabase.rpc('has_workspace_permission', {
    p_user_id: user.id,
    p_ws_id: order.ws_id,
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
      `You are not authorized to get invoice for order: ${orderId}`
    );
    return NextResponse.json(
      {
        error: 'Unauthorized: You are not authorized to get invoice',
      },
      { status: 403 }
    );
  }

  try {
    const polar = createPolarClient();
    const invoice = await polar.orders.invoice({
      id: order.polar_order_id,
    });

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch invoice',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  if (!orderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: order } = await supabase
    .from('workspace_orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const {
    data: hasManageSubscriptionPermission,
    error: hasManageSubscriptionPermissionError,
  } = await supabase.rpc('has_workspace_permission', {
    p_user_id: user.id,
    p_ws_id: order.ws_id,
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
      `You are not authorized to create invoice for orderId: ${orderId}`
    );
    return NextResponse.json(
      {
        error: 'Unauthorized: You are not authorized to create invoice',
      },
      { status: 403 }
    );
  }

  try {
    const polar = createPolarClient();
    const result = await polar.orders.generateInvoice({
      id: order.polar_order_id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating invoice:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate invoice',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
