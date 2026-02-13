import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspacePromotion } from '@tuturuuu/types/db';
import {
  type FullInvoiceData,
  transformInvoiceData,
  transformInvoiceSearchResults,
} from '@tuturuuu/utils/finance/transform-invoice-results';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isPromotionAllowedForWorkspace } from '@/utils/workspace-config';

const SearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(10),
  start: z.string().optional(),
  end: z.string().optional(),
  userIds: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val ? [val] : []))
    .default([]),
  walletIds: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val ? [val] : []))
    .default([]),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

interface InvoiceProduct {
  product_id: string;
  unit_id: string;
  warehouse_id: string;
  quantity: number;
  price: number;
  category_id: string;
}

interface CreateInvoiceRequest {
  customer_id: string;
  content: string;
  notes?: string;
  wallet_id: string;
  promotion_id?: string;
  products: InvoiceProduct[];
  category_id: string;
  // Optional frontend calculated values for comparison
  frontend_subtotal?: number;
  frontend_discount_amount?: number;
  frontend_total?: number;
}

export interface CalculatedValues {
  subtotal: number;
  discount_amount: number;
  total: number;
  values_recalculated: boolean;
  rounding_applied: number;
  allowPromotions: boolean;
  promotion?: WorkspacePromotion;
}

// Backend calculation functions

export async function calculateInvoiceValues(
  wsId: string,
  products: InvoiceProduct[],
  promotion_id?: string,
  frontendValues?: {
    subtotal?: number;
    discount_amount?: number;
    total?: number;
  },
  isSubscriptionInvoice: boolean = false
): Promise<CalculatedValues> {
  const supabase = await createClient();
  // Calculate subtotal from products
  let subtotal = 0;
  const productIds = products.map((p) => p.product_id);
  const unitIds = products.map((p) => p.unit_id);
  const warehouseIds = products.map((p) => p.warehouse_id);

  // Get current product prices and validate products exist
  const { data: productData, error: productError } = await supabase
    .from('inventory_products')
    .select(`
      product_id,
      unit_id,
      warehouse_id,
      price,
      workspace_products!inner(name, ws_id)
    `)
    .in('product_id', productIds)
    .in('unit_id', unitIds)
    .in('warehouse_id', warehouseIds)
    .eq('workspace_products.ws_id', wsId);

  if (productError) {
    throw new Error(`Error fetching product data: ${productError.message}`);
  }

  // Create a map for quick lookup
  const productMap = new Map();
  productData.forEach((item) => {
    const key = `${item.product_id}-${item.unit_id}-${item.warehouse_id}`;
    productMap.set(key, item);
  });

  // Calculate subtotal using backend prices
  for (const product of products) {
    const key = `${product.product_id}-${product.unit_id}-${product.warehouse_id}`;
    const productInfo = productMap.get(key);

    if (!productInfo) {
      throw new Error(
        `Product not found or not available: ${product.product_id}`
      );
    }
    subtotal += productInfo.price * product.quantity;
  }

  // Calculate discount amount
  let discount_amount = 0;
  let promotionData: WorkspacePromotion | undefined;
  const allowPromotions = await isPromotionAllowedForWorkspace(
    wsId,
    isSubscriptionInvoice
  );

  if (promotion_id && promotion_id !== 'none') {
    if (allowPromotions) {
      const { data: promotion, error: promotionError } = await supabase
        .from('workspace_promotions')
        // NOTE: column types land after migration + typegen; keep TS unblocked
        .select('*')
        .eq('id', promotion_id)
        .eq('ws_id', wsId)
        .single();

      if (promotionError) {
        throw new Error(`Invalid promotion: ${promotionError.message}`);
      }

      if (promotion) {
        if (
          promotion.max_uses !== null &&
          promotion.max_uses !== undefined &&
          Number(promotion.current_uses ?? 0) >= Number(promotion.max_uses)
        ) {
          const err = new Error('Promotion usage limit reached');
          (err as any).code = 'PROMOTION_LIMIT_REACHED';
          throw err;
        }

        promotionData = promotion;
        if (promotion.use_ratio) {
          discount_amount = subtotal * (promotion.value / 100);
        } else {
          discount_amount = Math.min(promotion.value, subtotal);
        }
      }
    }
  }

  const total_before_rounding = subtotal - discount_amount;

  // Use frontend's rounded total if provided, otherwise use calculated total
  let total: number;
  let rounding_applied: number;

  if (frontendValues?.total !== undefined) {
    // Use frontend's rounding decision
    total = frontendValues.total;
    rounding_applied = total - total_before_rounding;
  } else {
    // No frontend rounding, use exact calculation
    total = total_before_rounding;
    rounding_applied = 0;
  }

  // Check if values were recalculated (excluding rounding)
  const values_recalculated = frontendValues
    ? Math.abs(subtotal - (frontendValues.subtotal || 0)) > 0.01 ||
      Math.abs(discount_amount - (frontendValues.discount_amount || 0)) > 0.01
    : true;

  return {
    subtotal,
    discount_amount,
    total,
    values_recalculated,
    rounding_applied,
    allowPromotions,
    promotion: promotionData,
  };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId: id } = await params;

    // Resolve workspace ID
    const wsId = await normalizeWorkspaceId(id);

    // Check permissions
    const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { containsPermission } = permissions;
    const canViewInvoices = containsPermission('view_invoices');

    if (!canViewInvoices) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const params_obj: Record<string, string | string[]> = {};

    searchParams.forEach((value, key) => {
      const existing = params_obj[key];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          params_obj[key] = [existing, value];
        }
      } else {
        params_obj[key] = value;
      }
    });

    const parsed = SearchParamsSchema.safeParse(params_obj);
    if (!parsed.success) {
      console.error('Invalid query parameters:', parsed.error);
      return NextResponse.json(
        { message: 'Invalid query parameters' },
        { status: 400 }
      );
    }
    const sp = parsed.data;
    const q = sp.q;

    // If there's a search query, use the RPC function for customer name search
    if (q) {
      const { data: searchResults, error: rpcError } = await supabase.rpc(
        'search_finance_invoices',
        {
          p_ws_id: wsId,
          p_search_query: q,
          p_start_date: sp.start || undefined,
          p_end_date: sp.end || undefined,
          p_user_ids: sp.userIds.length > 0 ? sp.userIds : undefined,
          p_wallet_ids: sp.walletIds.length > 0 ? sp.walletIds : undefined,
          p_limit: sp.pageSize,
          p_offset: (sp.page - 1) * sp.pageSize,
        }
      );

      if (rpcError) {
        console.error('Error searching invoices:', rpcError);
        return NextResponse.json(
          { message: 'Error searching invoices' },
          { status: 500 }
        );
      }

      // Extract count from first row (all rows have same count)
      const count = searchResults?.[0]?.total_count || 0;

      // Fetch additional data for legacy/platform creators and wallet info
      const invoiceIds = searchResults.map((r) => r.id);

      // Guard: skip query if invoiceIds is empty to avoid SQL error
      let fullInvoices:
        | ReturnType<typeof transformInvoiceSearchResults>
        | undefined;
      if (invoiceIds.length === 0) {
        fullInvoices = transformInvoiceSearchResults(searchResults, []);
      } else {
        const { data: invoicesData } = await supabase
          .from('finance_invoices')
          .select(
            `*, 
             legacy_creator:workspace_users!creator_id(id, full_name, display_name, email, avatar_url), 
             platform_creator:users!platform_creator_id(id, display_name, avatar_url, user_private_details(full_name, email)),
             wallet_transactions!finance_invoices_transaction_id_fkey(wallet:workspace_wallets(name))`
          )
          .in('id', invoiceIds);
        fullInvoices = transformInvoiceSearchResults(
          searchResults,
          invoicesData || []
        );
      }

      return NextResponse.json({ data: fullInvoices, count });
    }

    // No search query - use regular query builder
    let selectQuery = `*, customer:workspace_users!finance_invoices_customer_id_fkey(full_name, avatar_url), legacy_creator:workspace_users!finance_invoices_creator_id_fkey(id, full_name, display_name, email, avatar_url), platform_creator:users!finance_invoices_platform_creator_id_fkey(id, display_name, avatar_url, user_private_details(full_name, email))`;

    // Join wallet_transactions, using !inner if walletIds filter is present
    const walletJoinType = sp.walletIds.length > 0 ? '!inner' : '';
    selectQuery += `, wallet_transactions!finance_invoices_transaction_id_fkey${walletJoinType}(wallet:workspace_wallets(name))`;

    let queryBuilder = supabase
      .from('finance_invoices')
      .select(selectQuery, {
        count: 'exact',
      })
      .eq('ws_id', wsId);

    queryBuilder = queryBuilder.order('created_at', { ascending: false });

    // Apply date range filter (independently to allow one-sided ranges)
    if (sp.start) {
      queryBuilder = queryBuilder.gte('created_at', sp.start);
    }
    if (sp.end) {
      queryBuilder = queryBuilder.lte('created_at', sp.end);
    }

    // Apply user IDs filter
    if (sp.userIds.length > 0) {
      queryBuilder = queryBuilder.in('creator_id', sp.userIds);
    }

    // Apply wallet IDs filter
    if (sp.walletIds.length > 0) {
      queryBuilder = queryBuilder.in(
        'wallet_transactions.wallet_id',
        sp.walletIds
      );
    }

    // Apply pagination
    const start = (sp.page - 1) * sp.pageSize;
    const end = sp.page * sp.pageSize - 1;
    queryBuilder = queryBuilder.range(start, end);

    const {
      data: rawData,
      error,
      count,
    } = await queryBuilder.returns<FullInvoiceData[]>();

    if (error) {
      console.error('Error fetching invoices:', error);
      return NextResponse.json(
        { message: 'Error fetching invoices' },
        { status: 500 }
      );
    }

    // Transform data to match expected Invoice type
    const data = transformInvoiceData(rawData || []);

    return NextResponse.json({
      data,
      count: count ?? 0,
    });
  } catch (error) {
    console.error('Error in workspace invoices API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  const permissions = await getPermissions({
    wsId,
  });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;
  if (withoutPermission('create_invoices')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      customer_id,
      content,
      notes,
      wallet_id,
      promotion_id,
      products,
      category_id,
      frontend_subtotal,
      frontend_discount_amount,
      frontend_total,
    }: CreateInvoiceRequest = await req.json();

    // Validate required fields
    if (
      !customer_id ||
      !products ||
      products.length === 0 ||
      !wallet_id ||
      !category_id
    ) {
      return NextResponse.json(
        {
          message:
            'Missing required fields: customer_id, products, wallet_id, and category_id',
        },
        { status: 400 }
      );
    }

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get user workspace ID
    const { data: workspaceUser } = await supabase
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('platform_user_id', user.id)
      .eq('ws_id', wsId)
      .single();

    const workspaceUserId = workspaceUser?.virtual_user_id || null;
    const isSubscriptionInvoice = false;

    // Calculate values using backend logic
    let calculatedValues: CalculatedValues;
    try {
      calculatedValues = await calculateInvoiceValues(
        wsId,
        products,
        promotion_id,
        {
          subtotal: frontend_subtotal,
          discount_amount: frontend_discount_amount,
          total: frontend_total,
        },
        isSubscriptionInvoice
      );
    } catch (e) {
      if ((e as any)?.code === 'PROMOTION_LIMIT_REACHED') {
        return NextResponse.json(
          { message: 'Promotion usage limit reached' },
          { status: 400 }
        );
      }
      throw e;
    }

    const {
      subtotal,
      discount_amount,
      total,
      values_recalculated,
      rounding_applied,
      allowPromotions,
      promotion,
    } = calculatedValues;

    // Round values first to avoid floating-point precision issues
    const roundedTotal = Math.round(total);
    const roundedRounding = Math.round(rounding_applied);
    const roundedPrice = roundedTotal - roundedRounding;

    const invoiceData: any = {
      ws_id: wsId,
      customer_id,
      price: roundedPrice, // Calculate from rounded values for consistency
      total_diff: roundedRounding, // Store the rounding applied
      note: notes,
      notice: content,
      wallet_id,
      category_id,
      completed_at: new Date().toISOString(),
      valid_until: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 30
      ).toISOString(),
      paid_amount: roundedTotal, // Convert to integer
      platform_creator_id: user.id, // Store the platform user ID who created the invoice
    };

    // Only add optional fields if they have values
    if (workspaceUserId) {
      invoiceData.creator_id = workspaceUserId;
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('finance_invoices')
      .insert(invoiceData)
      .select('id')
      .single();

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError);
      return NextResponse.json(
        { message: 'Error creating invoice', details: invoiceError.message },
        { status: 500 }
      );
    }

    const invoiceId = invoice.id;

    // Insert invoice products with correct field mapping
    // First, deduplicate products by creating a unique key and combining quantities if duplicates exist
    const productMap = new Map<string, InvoiceProduct>();

    products.forEach((product) => {
      const key = `${product.product_id}-${product.unit_id}-${product.warehouse_id}-${product.price}`;
      if (productMap.has(key)) {
        // If duplicate exists, combine quantities
        const existing = productMap.get(key);
        if (existing) {
          existing.quantity += product.quantity;
        }
      } else {
        productMap.set(key, { ...product });
      }
    });

    // Get product name  from workspace_products
    const productValues = Array.from(productMap.values());
    const { data: productsData, error: productsError } = await supabase
      .from('workspace_products')
      .select('name, id')
      .in(
        'id',
        productValues.map((product) => product.product_id)
      )
      .eq('ws_id', wsId);

    if (productsError) {
      console.error('Error getting products information:', productsError);
      return NextResponse.json(
        {
          message: 'Error getting products information',
          details: productsError.message,
        },
        { status: 500 }
      );
    }

    const unitIds = productValues.map((product) => product.unit_id);

    // Get unit from inventory_units
    const { data: unitsData, error: unitsError } = await supabase
      .from('inventory_units')
      .select('name, id')
      .in('id', unitIds)
      .eq('ws_id', wsId);

    if (unitsError) {
      console.error('Error getting units information:', unitsError);
      return NextResponse.json(
        {
          message: 'Error getting units information',
          details: unitsError.message,
        },
        { status: 500 }
      );
    }

    const invoiceProducts = productValues.map((product) => ({
      invoice_id: invoiceId,
      product_name:
        productsData.find((p) => p.id === product.product_id)?.name || '',
      product_unit:
        unitsData.find((unit) => unit.id === product.unit_id)?.name || '',
      product_id: product.product_id,
      unit_id: product.unit_id,
      warehouse_id: product.warehouse_id,
      amount: product.quantity,
      price: Math.round(product.price), // Convert to integer
    }));

    const { error: invoiceProductsError } = await supabase
      .from('finance_invoice_products')
      .insert(invoiceProducts);

    if (invoiceProductsError) {
      console.error('Error creating invoice products:', invoiceProductsError);
      // Rollback: delete the created invoice and transaction
      await Promise.all([
        supabase.from('finance_invoices').delete().eq('id', invoiceId),
      ]);
      return NextResponse.json(
        {
          message: 'Error creating invoice products',
          details: invoiceProductsError.message,
        },
        { status: 500 }
      );
    }

    // Insert promotion if provided
    if (
      promotion_id &&
      promotion_id !== 'none' &&
      discount_amount > 0 &&
      allowPromotions &&
      promotion
    ) {
      const { error: promotionError } = await supabase
        .from('finance_invoice_promotions')
        .insert({
          invoice_id: invoiceId,
          promo_id: promotion_id,
          value: promotion.value,
          use_ratio: promotion.use_ratio ?? true,
          name: promotion.name || '',
          code: promotion.code || '',
          description: promotion.description || '',
        });

      if (promotionError) {
        const isLimitReached =
          promotionError.code === '23514' ||
          promotionError.message?.toLowerCase().includes('usage limit');

        // Rollback: delete all created records
        await Promise.all([
          supabase
            .from('finance_invoice_products')
            .delete()
            .eq('invoice_id', invoiceId),
          supabase.from('finance_invoices').delete().eq('id', invoiceId),
        ]);

        if (isLimitReached) {
          return NextResponse.json(
            { message: 'Promotion usage limit reached' },
            { status: 400 }
          );
        }

        console.error('Error creating invoice promotion:', promotionError);
        return NextResponse.json(
          {
            message: 'Error applying promotion to invoice',
            details: promotionError.message,
          },
          { status: 500 }
        );
      }
    }

    // Create stock changes for each product (using deduplicated products)
    const stockChanges = productValues.map((product) => ({
      product_id: product.product_id,
      unit_id: product.unit_id,
      warehouse_id: product.warehouse_id,
      amount: -product.quantity, // Negative because it's being sold
      creator_id: workspaceUserId || customer_id,
      beneficiary_id: customer_id,
    }));

    const { error: stockError } = await supabase
      .from('product_stock_changes')
      .insert(stockChanges);

    if (stockError) {
      console.error('Error creating stock changes:', stockError);
      // Rollback: delete all created records
      await Promise.all([
        supabase
          .from('finance_invoice_promotions')
          .delete()
          .eq('invoice_id', invoiceId),
        supabase
          .from('finance_invoice_products')
          .delete()
          .eq('invoice_id', invoiceId),
        supabase.from('finance_invoices').delete().eq('id', invoiceId),
      ]);
      return NextResponse.json(
        {
          message: 'Error updating product stock',
          details: stockError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Invoice created successfully',
      invoice_id: invoiceId,
      data: {
        id: invoiceId,
        customer_id,
        total,
        subtotal,
        discount_amount,
        products_count: products.length,
        values_recalculated,
        calculated_values: {
          subtotal,
          discount_amount,
          total,
          rounding_applied,
        },
        ...(values_recalculated &&
        frontend_subtotal &&
        frontend_discount_amount &&
        frontend_total
          ? {
              frontend_values: {
                subtotal: frontend_subtotal,
                discount_amount: frontend_discount_amount,
                total: frontend_total,
              },
            }
          : {}),
      },
    });
  } catch (error) {
    console.error('Unexpected error creating invoice:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
