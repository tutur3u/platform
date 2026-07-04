import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { canUseRequestedFinanceWalletOnCreate } from '@tuturuuu/utils/finance';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { isGroupBlockedForSubscriptionInvoices } from '@/utils/workspace-config';
import {
  type CalculatedValues,
  getCalculatedInvoiceValuesFromRpc,
  validateInvoiceCustomer,
} from '../route';

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

interface CreateSubscriptionInvoiceRequest {
  customer_id: string;
  group_id?: string;
  group_ids?: string[];
  selected_month: string; // YYYY-MM
  prepaid_month_count?: number;
  content: string;
  notes?: string;
  wallet_id: string;
  promotion_id?: string;
  products: InvoiceProduct[];
  category_id?: string;
  frontend_subtotal?: number;
  frontend_discount_amount?: number;
  frontend_total?: number;
}

const MAX_SUBSCRIPTION_PREPAID_MONTH_COUNT = 12;
const SELECTED_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function parseSelectedMonthStart(selectedMonth: string): Date | null {
  const monthMatch = SELECTED_MONTH_PATTERN.exec(selectedMonth);
  if (!monthMatch) return null;

  const [, yearValue, monthValue] = monthMatch;
  const year = Number(yearValue);
  const month = Number(monthValue);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, 1));
}

function formatMonthValue(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

export function resolveSubscriptionCoverageRange({
  prepaidMonthCount,
  selectedMonth,
}: {
  prepaidMonthCount?: number;
  selectedMonth: string;
}):
  | {
      coverageEndMonth: string;
      prepaidMonthCount: number;
      validUntil: Date;
    }
  | { error: string } {
  const startOfMonth = parseSelectedMonthStart(selectedMonth);
  if (!startOfMonth) {
    return { error: 'selected_month must be formatted as YYYY-MM' };
  }

  const resolvedMonthCount = prepaidMonthCount ?? 1;
  if (
    !Number.isInteger(resolvedMonthCount) ||
    resolvedMonthCount < 1 ||
    resolvedMonthCount > MAX_SUBSCRIPTION_PREPAID_MONTH_COUNT
  ) {
    return {
      error: `prepaid_month_count must be an integer between 1 and ${MAX_SUBSCRIPTION_PREPAID_MONTH_COUNT}`,
    };
  }

  const coverageEnd = new Date(startOfMonth);
  coverageEnd.setUTCMonth(coverageEnd.getUTCMonth() + resolvedMonthCount - 1);

  const validUntil = new Date(startOfMonth);
  validUntil.setUTCMonth(validUntil.getUTCMonth() + resolvedMonthCount);

  return {
    coverageEndMonth: formatMonthValue(coverageEnd),
    prepaidMonthCount: resolvedMonthCount,
    validUntil,
  };
}

export function resolveSubscriptionInvoiceCategoryId({
  linkedCategoryIds,
  requestedCategoryId,
}: {
  linkedCategoryIds: string[];
  requestedCategoryId?: string | null;
}):
  | { categoryId: string; error?: never }
  | { categoryId?: never; error: string } {
  const trimmedRequestedCategoryId = requestedCategoryId?.trim();
  if (trimmedRequestedCategoryId) {
    return { categoryId: trimmedRequestedCategoryId };
  }

  const uniqueLinkedCategoryIds = [
    ...new Set(linkedCategoryIds.filter(Boolean)),
  ];

  if (uniqueLinkedCategoryIds.length === 1 && uniqueLinkedCategoryIds[0]) {
    return { categoryId: uniqueLinkedCategoryIds[0] };
  }

  if (uniqueLinkedCategoryIds.length > 1) {
    return {
      error:
        'This cart contains products with different linked finance categories. Please choose a category override.',
    };
  }

  return { error: 'Missing required field: category_id' };
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin, user } = access.context;

  let createdInvoiceId: string | null = null;

  const { withoutPermission } = permissions;

  if (withoutPermission('create_invoices')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const defaultWalletId = await getWorkspaceConfig(wsId, 'default_wallet_id');

  try {
    const {
      customer_id,
      group_id,
      group_ids,
      selected_month,
      prepaid_month_count,
      content,
      notes,
      wallet_id,
      promotion_id,
      products,
      category_id,
      frontend_subtotal,
      frontend_discount_amount,
      frontend_total,
    }: CreateSubscriptionInvoiceRequest = await req.json();

    const groupIds = Array.isArray(group_ids)
      ? Array.from(new Set(group_ids.filter(Boolean)))
      : group_id
        ? [group_id]
        : [];

    if (
      !customer_id ||
      groupIds.length === 0 ||
      !selected_month ||
      !products ||
      products.length === 0 ||
      !wallet_id
    ) {
      return NextResponse.json(
        {
          message:
            'Missing required fields: customer_id, group_id(s), selected_month, products, and wallet_id',
        },
        { status: 400 }
      );
    }

    const coverageRange = resolveSubscriptionCoverageRange({
      prepaidMonthCount: prepaid_month_count,
      selectedMonth: selected_month,
    });

    if ('error' in coverageRange) {
      return NextResponse.json(
        { message: coverageRange.error },
        { status: 400 }
      );
    }

    if (
      !canUseRequestedFinanceWalletOnCreate({
        permissions,
        defaultWalletId,
        requestedWalletId: wallet_id,
      })
    ) {
      return NextResponse.json(
        {
          message:
            'Insufficient permissions to override the default wallet for new invoices',
        },
        { status: 403 }
      );
    }

    // Block creating subscription invoices for groups configured as blocked
    for (const groupId of groupIds) {
      if (await isGroupBlockedForSubscriptionInvoices(wsId, groupId)) {
        return NextResponse.json(
          {
            message:
              'Creating subscription invoices is disabled for one or more groups in workspace settings.',
          },
          { status: 403 }
        );
      }
    }

    const uniqueProductIds = [
      ...new Set(products.map((product) => product.product_id)),
    ];
    const { data: productRows, error: productRowsError } = await sbAdmin
      .from('workspace_products')
      .select('id, finance_category_id')
      .in('id', uniqueProductIds)
      .eq('ws_id', wsId)
      .filter('archived', 'eq', 'false');

    if (productRowsError) {
      return NextResponse.json(
        { message: 'Failed to validate sold products' },
        { status: 500 }
      );
    }

    if ((productRows ?? []).length !== uniqueProductIds.length) {
      return NextResponse.json(
        { message: 'One or more sold products are invalid' },
        { status: 400 }
      );
    }

    const resolvedCategory = resolveSubscriptionInvoiceCategoryId({
      linkedCategoryIds: (productRows ?? [])
        .map((row) => row.finance_category_id)
        .filter((value): value is string => !!value),
      requestedCategoryId: category_id,
    });

    if ('error' in resolvedCategory) {
      return NextResponse.json(
        { message: resolvedCategory.error },
        { status: 400 }
      );
    }

    const resolvedCategoryId = resolvedCategory.categoryId;
    const { data: categoryCheck, error: categoryCheckError } = await sbAdmin
      .from('transaction_categories')
      .select('id')
      .eq('id', resolvedCategoryId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (categoryCheckError || !categoryCheck) {
      return NextResponse.json(
        { message: 'Invalid invoice category' },
        { status: 400 }
      );
    }

    const customerValidation = await validateInvoiceCustomer({
      customerId: customer_id,
      sbAdmin,
      wsId,
    });
    if (!customerValidation.ok) {
      if (customerValidation.status === 500) {
        console.error(customerValidation.message, customerValidation.error);
      }
      return NextResponse.json(
        { message: customerValidation.message },
        { status: customerValidation.status }
      );
    }
    const resolvedCustomerId = customerValidation.customerId;
    if (!resolvedCustomerId) {
      return NextResponse.json(
        { message: 'Missing required fields: customer_id' },
        { status: 400 }
      );
    }

    // Calculate values through the private database RPC
    let calculatedValues: CalculatedValues;

    try {
      calculatedValues = await getCalculatedInvoiceValuesFromRpc({
        frontendValues: {
          subtotal: frontend_subtotal,
          discount_amount: frontend_discount_amount,
          total: frontend_total,
        },
        isSubscriptionInvoice: true,
        products,
        promotionId: promotion_id,
        supabase: sbAdmin,
        wsId,
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'PROMOTION_LIMIT_REACHED') {
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
      promotion,
    } = calculatedValues;

    // Map platform user to workspace virtual user
    let workspaceUserId: string | null = null;
    if (user) {
      const { data: workspaceUser } = await sbAdmin
        .from('workspace_user_linked_users')
        .select('virtual_user_id ')
        .eq('platform_user_id', user.id)
        .eq('ws_id', wsId)
        .single();

      workspaceUserId = workspaceUser?.virtual_user_id || null;
    }

    // Round values first to avoid floating-point precision issues
    const roundedTotal = Math.round(total);
    const roundedRounding = Math.round(rounding_applied);
    const roundedPrice = roundedTotal - roundedRounding;

    const invoiceData: any = {
      ws_id: wsId,
      customer_id: resolvedCustomerId,
      price: roundedPrice, // Calculate from rounded values for consistency
      total_diff: roundedRounding,
      note: notes,
      notice: content,
      wallet_id,
      category_id: resolvedCategoryId,
      completed_at: new Date().toISOString(),
      valid_until: coverageRange.validUntil.toISOString(),
      paid_amount: roundedTotal,
      platform_creator_id: user.id,
    };

    if (workspaceUserId) {
      invoiceData.creator_id = workspaceUserId;
    }

    const { data: invoice, error: invoiceError } = await sbAdmin
      .from('finance_invoices')
      .insert(invoiceData)
      .select('id')
      .single();

    if (invoiceError) {
      console.error('Error creating subscription invoice:', invoiceError);
      return NextResponse.json(
        {
          message: 'Error creating subscription invoice',
          details: invoiceError.message,
        },
        { status: 500 }
      );
    }

    const invoiceId = invoice.id;
    createdInvoiceId = invoiceId;

    const cleanupInvoice = async (): Promise<void> => {
      if (!createdInvoiceId) return;

      // Best-effort rollback: delete children first, then the invoice itself.
      await Promise.all([
        sbAdmin
          .from('finance_invoice_promotions')
          .delete()
          .eq('invoice_id', createdInvoiceId),
        sbAdmin
          .from('finance_invoice_products')
          .delete()
          .eq('invoice_id', createdInvoiceId),
        sbAdmin
          .from('finance_invoice_user_groups')
          .delete()
          .eq('invoice_id', createdInvoiceId),
      ]);

      await sbAdmin
        .from('finance_invoices')
        .delete()
        .eq('id', createdInvoiceId);
    };

    const invoiceGroupRows = groupIds.map((groupId) => ({
      invoice_id: invoiceId,
      user_group_id: groupId,
    }));

    const { error: invoiceGroupsError } = await sbAdmin
      .from('finance_invoice_user_groups')
      .insert(invoiceGroupRows);

    if (invoiceGroupsError) {
      console.error('Error creating invoice groups:', invoiceGroupsError);
      await cleanupInvoice();
      return NextResponse.json(
        {
          message: 'Error linking invoice to groups',
          details: invoiceGroupsError.message,
        },
        { status: 500 }
      );
    }

    // Deduplicate products
    const productMap = new Map<string, InvoiceProduct>();
    products.forEach((product) => {
      const key = `${product.product_id}-${product.unit_id}-${product.warehouse_id}-${product.price}`;
      if (productMap.has(key)) {
        const existing = productMap.get(key);
        if (existing) existing.quantity += product.quantity;
      } else {
        productMap.set(key, { ...product });
      }
    });

    const productValues = Array.from(productMap.values());

    // Fetch product and unit names
    const { data: productsData, error: productsError } = await sbAdmin
      .from('workspace_products')
      .select('name, id')
      .in(
        'id',
        productValues.map((product) => product.product_id)
      )
      .filter('archived', 'eq', 'false')
      .eq('ws_id', wsId);

    if (productsError) {
      console.error('Error getting products information:', productsError);
      await cleanupInvoice();
      return NextResponse.json(
        {
          message: 'Error getting products information',
          details: productsError.message,
        },
        { status: 500 }
      );
    }

    const unitIds = productValues.map((product) => product.unit_id);
    const { data: unitsData, error: unitsError } = await sbAdmin
      .schema('private')
      .from('inventory_units')
      .select('name, id')
      .in('id', unitIds)
      .eq('ws_id', wsId);

    if (unitsError) {
      console.error('Error getting units information:', unitsError);
      await cleanupInvoice();
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
      price: Math.round(product.price),
    }));

    const { error: invoiceProductsError } = await sbAdmin
      .from('finance_invoice_products')
      .insert(invoiceProducts);

    if (invoiceProductsError) {
      console.error(
        'Error creating subscription invoice products:',
        invoiceProductsError
      );
      await cleanupInvoice();
      return NextResponse.json(
        {
          message: 'Error creating invoice products',
          details: invoiceProductsError.message,
        },
        { status: 500 }
      );
    }

    // Promotion linkage
    if (
      promotion_id &&
      promotion_id !== 'none' &&
      discount_amount > 0 &&
      promotion
    ) {
      const { error: promotionError } = await sbAdmin
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
        console.error('Error creating invoice promotion:', promotionError);
        await cleanupInvoice();
        return NextResponse.json(
          {
            message: 'Error applying promotion to invoice',
            details: promotionError.message,
          },
          { status: 500 }
        );
      }
    }

    // Stock changes (sell)
    const stockChanges = productValues.map((product) => ({
      product_id: product.product_id,
      unit_id: product.unit_id,
      warehouse_id: product.warehouse_id,
      amount: -product.quantity,
      creator_id: workspaceUserId || resolvedCustomerId,
      beneficiary_id: resolvedCustomerId,
    }));

    const { error: stockError } = await sbAdmin
      .from('product_stock_changes')
      .insert(stockChanges);

    if (stockError) {
      console.error('Error creating stock changes:', stockError);
      await cleanupInvoice();
      return NextResponse.json(
        {
          message: 'Error updating product stock',
          details: stockError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Subscription invoice created successfully',
      invoice_id: invoiceId,
      data: {
        id: invoiceId,
        customer_id: resolvedCustomerId,
        group_ids: groupIds,
        selected_month,
        prepaid_month_count: coverageRange.prepaidMonthCount,
        coverage_start_month: selected_month,
        coverage_end_month: coverageRange.coverageEndMonth,
        valid_until: coverageRange.validUntil.toISOString(),
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
    console.error('Unexpected error creating subscription invoice:', error);
    if (createdInvoiceId) {
      await Promise.allSettled([
        sbAdmin
          .from('finance_invoice_promotions')
          .delete()
          .eq('invoice_id', createdInvoiceId),
        sbAdmin
          .from('finance_invoice_products')
          .delete()
          .eq('invoice_id', createdInvoiceId),
        sbAdmin
          .from('finance_invoice_user_groups')
          .delete()
          .eq('invoice_id', createdInvoiceId),
        sbAdmin.from('finance_invoices').delete().eq('id', createdInvoiceId),
      ]);
    }
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
