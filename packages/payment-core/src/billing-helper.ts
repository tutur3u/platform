import type { CustomerSeat, Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  isAiCreditPackProduct,
  parseWorkspaceProductTier,
} from './polar-product-metadata';

function privateSchema(supabase: TypedSupabaseClient) {
  return supabase.schema('private');
}

export async function fetchProducts(polar: Polar) {
  try {
    const res = await polar.products.list({ isArchived: false });
    return (res.result.items ?? []).filter(
      (product) =>
        !isAiCreditPackProduct(product.metadata) &&
        parseWorkspaceProductTier(product.metadata) != null
    );
  } catch (err) {
    console.error('Failed to fetch products:', err);
    return [];
  }
}

export interface CreditPackListItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  tokens: number;
  expiryDays: number;
  archived: boolean;
}

export async function fetchCreditPacks(supabase: TypedSupabaseClient) {
  try {
    const { data, error } = await privateSchema(supabase)
      .from('workspace_credit_packs')
      .select('*')
      .eq('archived', false)
      .order('price', { ascending: true });

    if (error) {
      console.error('Error fetching credit packs:', error);
      return [] as CreditPackListItem[];
    }

    return (data ?? []).map((pack) => ({
      id: pack.id,
      name: pack.name ?? '',
      description: pack.description,
      price: Number(pack.price ?? 0),
      currency: (pack.currency ?? 'usd').toLowerCase(),
      tokens: Number(pack.tokens ?? 0),
      expiryDays: Number(pack.expiry_days ?? 0),
      archived: Boolean(pack.archived),
    }));
  } catch (error) {
    console.error('Error fetching credit packs:', error);
    return [] as CreditPackListItem[];
  }
}

export async function fetchWorkspaceOrders(
  supabase: TypedSupabaseClient,
  wsId: string
) {
  try {
    const { data: orders, error } = await supabase
      .from('workspace_orders')
      .select('*')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching workspace orders:', error);
      return [];
    }

    const orderRows = orders ?? [];
    const subscriptionProductIds = [
      ...new Set(
        orderRows
          .map((order) => order.product_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const creditPackIds = [
      ...new Set(
        orderRows
          .map((order) => order.credit_pack_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const { data: subscriptionProducts, error: productsError } =
      subscriptionProductIds.length > 0
        ? await privateSchema(supabase)
            .from('workspace_subscription_products')
            .select('id, name, price')
            .in('id', subscriptionProductIds)
        : { data: [], error: null };
    const { data: creditPacks, error: creditPacksError } =
      creditPackIds.length > 0
        ? await privateSchema(supabase)
            .from('workspace_credit_packs')
            .select('id, name, price')
            .in('id', creditPackIds)
        : { data: [], error: null };

    if (productsError) {
      console.error('Error fetching workspace order subscription products:', {
        error: productsError,
      });
      return [];
    }

    if (creditPacksError) {
      console.error('Error fetching workspace order credit packs:', {
        error: creditPacksError,
      });
      return [];
    }

    const subscriptionProductsById = new Map(
      (subscriptionProducts ?? []).map((product) => [product.id, product])
    );
    const creditPacksById = new Map(
      (creditPacks ?? []).map((creditPack) => [creditPack.id, creditPack])
    );

    return orderRows.map((order) => {
      const creditPack = order.credit_pack_id
        ? creditPacksById.get(order.credit_pack_id)
        : null;
      const subscriptionProduct = order.product_id
        ? subscriptionProductsById.get(order.product_id)
        : null;

      return {
        id: order.id,
        createdAt: order.created_at,
        billingReason: order.billing_reason ?? 'unknown',
        totalAmount: order.total_amount ?? 0,
        originalAmount: subscriptionProduct?.price ?? creditPack?.price ?? 0,
        currency: order.currency ?? 'usd',
        status: order.status,
        productName: subscriptionProduct?.name ?? creditPack?.name ?? 'N/A',
      };
    });
  } catch (error) {
    console.error('Error fetching workspace orders:', error);
    return [];
  }
}

export async function checkManageSubscriptionPermission(
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  const { data, error } = await supabase.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: userId,
    p_permission: 'manage_subscription',
  });

  if (error) {
    console.error('Error checking manage_subscription permission:', error);
    return false;
  }

  return data ?? false;
}

export async function fetchSubscription(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string
) {
  const { data: dbSub, error } = await supabase
    .from('workspace_subscriptions')
    .select('*')
    .eq('ws_id', wsId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }

  if (!dbSub) {
    return null;
  }

  if (!dbSub.product_id) return null;

  const { data: product, error: productError } = await privateSchema(supabase)
    .from('workspace_subscription_products')
    .select(
      'id, name, description, price, recurring_interval, tier, pricing_model, price_per_seat, max_seats'
    )
    .eq('id', dbSub.product_id)
    .maybeSingle();

  if (productError) {
    console.error('Error fetching subscription product:', productError);
    return null;
  }

  if (!product) return null;

  let seatList: CustomerSeat[] = [];

  try {
    const { seats } = await polar.customerSeats.listSeats({
      subscriptionId: dbSub.polar_subscription_id,
    });

    seatList = seats;
  } catch (err) {
    console.error('Failed to fetch seat list:', err);
  }

  return {
    id: dbSub.id,
    status: dbSub.status,
    createdAt: dbSub.created_at,
    currentPeriodStart: dbSub.current_period_start,
    currentPeriodEnd: dbSub.current_period_end,
    cancelAtPeriodEnd: dbSub.cancel_at_period_end,
    product,
    // Seat-based pricing fields
    seatCount: dbSub.seat_count,
    seatList,
  };
}
