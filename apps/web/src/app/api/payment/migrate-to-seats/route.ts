import { createPolarClient } from '@tuturuuu/payment/polar/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/payment/migrate-to-seats
 * Migrate from fixed pricing to seat-based pricing
 * This creates a new seat-based subscription and cancels the old fixed one
 */
export async function POST(req: Request) {
  try {
    const { wsId } = await req.json();

    if (!wsId) {
      return NextResponse.json(
        { error: 'Missing wsId parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is the workspace creator (has billing permission)
    const { data: workspace } = await sbAdmin
      .from('workspaces')
      .select('creator_id')
      .eq('id', wsId)
      .single();

    if (!workspace || workspace.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the workspace owner can migrate to seat-based pricing' },
        { status: 403 }
      );
    }

    // Get current subscription
    const { data: currentSubscription } = await sbAdmin
      .from('workspace_subscriptions')
      .select(
        `
        *,
        workspace_subscription_products (
          id,
          name,
          tier,
          price,
          recurring_interval
        )
      `
      )
      .eq('ws_id', wsId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentSubscription) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      );
    }

    // Check if already seat-based
    if (currentSubscription.pricing_model === 'seat_based') {
      return NextResponse.json(
        { error: 'Subscription is already using seat-based pricing' },
        { status: 400 }
      );
    }

    // Count current members - this will be the initial seat count
    const { count: memberCount } = await sbAdmin
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId);

    const initialSeats = Math.max(1, memberCount ?? 1);
    const tier =
      currentSubscription.workspace_subscription_products?.tier || 'FREE';
    const recurringInterval =
      currentSubscription.workspace_subscription_products?.recurring_interval ||
      'monthly';

    // Find the corresponding seat-based product
    // This assumes seat-based products have pricing_model = 'seat_based'
    const { data: seatBasedProduct } = await sbAdmin
      .from('workspace_subscription_products')
      .select('*')
      .eq('tier', tier)
      .eq('pricing_model', 'seat_based')
      .eq('recurring_interval', recurringInterval)
      .eq('archived', false)
      .limit(1)
      .maybeSingle();

    if (!seatBasedProduct) {
      return NextResponse.json(
        {
          error: `No seat-based product found for tier ${tier}. Please contact support.`,
        },
        { status: 400 }
      );
    }

    const polar = createPolarClient();

    // Create a checkout session for the seat-based product
    const checkout = await polar.checkouts.create({
      products: [seatBasedProduct.id],
      externalCustomerId: user.id,
      metadata: {
        wsId,
        migrationType: 'fixed_to_seat_based',
        previousSubscriptionId: currentSubscription.polar_subscription_id,
      },
      seats: initialSeats,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/${wsId}/billing/success?migration=true`,
      // Cancel the old subscription after successful checkout via webhook
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: checkout.url,
      migrationDetails: {
        currentTier: tier,
        currentMemberCount: memberCount,
        initialSeats,
        pricePerSeat: seatBasedProduct.price_per_seat,
        newProductName: seatBasedProduct.name,
      },
    });
  } catch (error) {
    console.error('Error migrating to seat-based pricing:', error);
    return NextResponse.json(
      { error: 'Failed to initiate migration' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payment/migrate-to-seats?wsId=xxx
 * Get migration preview (what will happen if user migrates)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const wsId = url.searchParams.get('wsId');

    if (!wsId) {
      return NextResponse.json(
        { error: 'Missing wsId parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Verify user has access
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current subscription
    const { data: currentSubscription } = await sbAdmin
      .from('workspace_subscriptions')
      .select(
        `
        *,
        workspace_subscription_products (
          id,
          name,
          tier,
          price,
          recurring_interval
        )
      `
      )
      .eq('ws_id', wsId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentSubscription) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      );
    }

    // Check if already seat-based
    if (currentSubscription.pricing_model === 'seat_based') {
      return NextResponse.json({
        canMigrate: false,
        reason: 'already_seat_based',
        message: 'Your subscription is already using seat-based pricing',
      });
    }

    // Count current members
    const { count: memberCount } = await sbAdmin
      .from('workspace_users')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId);

    const tier =
      currentSubscription.workspace_subscription_products?.tier || 'FREE';
    const recurringInterval =
      currentSubscription.workspace_subscription_products?.recurring_interval ||
      'monthly';

    // Find the corresponding seat-based product
    const { data: seatBasedProduct } = await sbAdmin
      .from('workspace_subscription_products')
      .select('*')
      .eq('tier', tier)
      .eq('pricing_model', 'seat_based')
      .eq('recurring_interval', recurringInterval)
      .eq('archived', false)
      .limit(1)
      .maybeSingle();

    if (!seatBasedProduct) {
      return NextResponse.json({
        canMigrate: false,
        reason: 'no_seat_product',
        message: `No seat-based product available for your current tier (${tier})`,
      });
    }

    const initialSeats = Math.max(1, memberCount ?? 1);
    const newPrice = (seatBasedProduct.price_per_seat ?? 0) * initialSeats;

    return NextResponse.json({
      canMigrate: true,
      preview: {
        currentPlan: {
          name: currentSubscription.workspace_subscription_products?.name,
          tier,
          price: currentSubscription.workspace_subscription_products?.price,
          pricingModel: 'fixed',
        },
        newPlan: {
          name: seatBasedProduct.name,
          tier: seatBasedProduct.tier,
          pricePerSeat: seatBasedProduct.price_per_seat,
          pricingModel: 'seat_based',
        },
        memberCount: memberCount ?? 0,
        initialSeats,
        estimatedMonthlyPrice: newPrice,
        billingCycle:
          currentSubscription.workspace_subscription_products
            ?.recurring_interval,
      },
    });
  } catch (error) {
    console.error('Error getting migration preview:', error);
    return NextResponse.json(
      { error: 'Failed to get migration preview' },
      { status: 500 }
    );
  }
}
