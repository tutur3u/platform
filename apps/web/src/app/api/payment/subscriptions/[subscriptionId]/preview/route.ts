import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';

export interface ProrationPreview {
  currentPlan: {
    id: string;
    name: string;
    price: number;
    billingCycle: string;
    remainingValue: number;
    pricingModel: 'fixed' | 'seat_based';
    seatCount?: number;
    pricePerSeat?: number;
  };
  newPlan: {
    id: string;
    name: string;
    price: number;
    billingCycle: string;
    proratedCharge: number;
    pricingModel: 'fixed' | 'seat_based';
    seatCount?: number;
    pricePerSeat?: number;
  };
  netAmount: number; // Positive = charge, Negative = credit
  daysRemaining: number;
  totalDaysInPeriod: number;
  isUpgrade: boolean;
  nextBillingDate: string;
  billingCycleChanged: boolean; // true when switching between monthly/yearly
}

// POST: Calculate proration preview for a plan change
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

  // Get subscription from database with product details
  const { data: subscription, error: subscriptionError } = await supabase
    .from('workspace_subscriptions')
    .select(
      `
      *,
      workspace_subscription_products (
        id,
        name,
        price,
        recurring_interval,
        pricing_model,
        price_per_seat,
        min_seats,
        max_seats
      )
    `
    )
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
    return NextResponse.json(
      {
        error:
          'Unauthorized: You are not authorized to view subscription details',
      },
      { status: 403 }
    );
  }

  // Get target product details
  const { data: targetProduct, error: targetProductError } = await supabase
    .from('workspace_subscription_products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();

  if (targetProductError) {
    console.error('Error fetching target product:', targetProductError);
    return NextResponse.json(
      { error: 'An error occurred while fetching the target product' },
      { status: 500 }
    );
  }

  if (!targetProduct) {
    return NextResponse.json(
      { error: 'Target product not found' },
      { status: 404 }
    );
  }

  const currentProduct = subscription.workspace_subscription_products;

  if (!currentProduct) {
    return NextResponse.json(
      { error: 'Current product not found' },
      { status: 404 }
    );
  }

  // Get current seat count from subscription
  const currentSeatCount = subscription.seat_count || 1;

  // Calculate actual prices based on pricing model
  const currentActualPrice =
    currentProduct.pricing_model === 'seat_based' &&
    currentProduct.price_per_seat
      ? currentProduct.price_per_seat * currentSeatCount
      : (currentProduct.price ?? 0);

  const targetActualPrice =
    targetProduct.pricing_model === 'seat_based' && targetProduct.price_per_seat
      ? targetProduct.price_per_seat * currentSeatCount
      : (targetProduct.price ?? 0);

  // Calculate proration
  if (!subscription.current_period_start || !subscription.current_period_end) {
    return NextResponse.json(
      { error: 'Subscription billing period is missing' },
      { status: 500 }
    );
  }

  const currentPeriodStart = new Date(subscription.current_period_start);
  const currentPeriodEnd = new Date(subscription.current_period_end);
  const now = new Date();

  // Total days in current billing period
  const totalDaysInPeriod = Math.ceil(
    (currentPeriodEnd.getTime() - currentPeriodStart.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  // Days remaining in current period
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )
  );

  // Proration factor (0 to 1)
  const prorationFactor =
    totalDaysInPeriod > 0
      ? Math.min(1, Math.max(0, daysRemaining / totalDaysInPeriod))
      : 0;

  // Calculate prorated amounts
  // Current plan: credit for unused portion (using actual price based on seats)
  const currentPlanRemainingValue = Math.round(
    currentActualPrice * prorationFactor
  );

  let newPlanProratedCharge: number;
  const billingCycleChanged =
    currentProduct.recurring_interval !== targetProduct.recurring_interval;

  if (!billingCycleChanged) {
    // Same billing cycle - simple proration (using actual price based on seats)
    newPlanProratedCharge = Math.round(targetActualPrice * prorationFactor);
  } else {
    // Different billing cycle - charge full price for new cycle (using actual price based on seats)
    newPlanProratedCharge = targetActualPrice;
  }

  // Calculate next billing date
  let nextBillingDate: Date;
  if (billingCycleChanged) {
    // When switching cycles, next billing is based on new cycle from now
    const newCycleInterval = targetProduct.recurring_interval ?? 'month';
    nextBillingDate = new Date(now);

    if (newCycleInterval === 'year') {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    } else {
      // Default to month
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }
  } else {
    // Same cycle - next billing is at end of current period
    nextBillingDate = currentPeriodEnd;
  }

  // Calculate net amount (what user pays or receives as credit)
  const netAmount = newPlanProratedCharge - currentPlanRemainingValue;

  const isUpgrade = targetActualPrice > currentActualPrice;

  const preview: ProrationPreview = {
    currentPlan: {
      id: currentProduct.id,
      name: currentProduct.name ?? '',
      price: currentActualPrice,
      billingCycle: currentProduct.recurring_interval ?? 'month',
      remainingValue: currentPlanRemainingValue,
      pricingModel:
        (currentProduct.pricing_model as 'fixed' | 'seat_based') ?? 'fixed',
      seatCount:
        currentProduct.pricing_model === 'seat_based'
          ? currentSeatCount
          : undefined,
      pricePerSeat:
        currentProduct.pricing_model === 'seat_based'
          ? (currentProduct.price_per_seat ?? undefined)
          : undefined,
    },
    newPlan: {
      id: targetProduct.id,
      name: targetProduct.name ?? '',
      price: targetActualPrice,
      billingCycle: targetProduct.recurring_interval ?? 'month',
      proratedCharge: newPlanProratedCharge,
      pricingModel:
        (targetProduct.pricing_model as 'fixed' | 'seat_based') ?? 'fixed',
      seatCount:
        targetProduct.pricing_model === 'seat_based'
          ? currentSeatCount
          : undefined,
      pricePerSeat:
        targetProduct.pricing_model === 'seat_based'
          ? (targetProduct.price_per_seat ?? undefined)
          : undefined,
    },
    netAmount,
    daysRemaining,
    totalDaysInPeriod,
    isUpgrade,
    nextBillingDate: nextBillingDate.toISOString(),
    billingCycleChanged,
  };

  return NextResponse.json(preview);
}
