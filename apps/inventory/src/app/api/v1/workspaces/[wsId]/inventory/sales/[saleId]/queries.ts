import type { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import { getInventorySale } from '@tuturuuu/inventory-core/sales-rpc';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import type {
  InventoryStockRow,
  SaleInvoiceProductRow,
  SaleInvoiceRow,
  UpdateSaleProductInput,
} from './types';

export async function loadSale(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  saleId: string
) {
  try {
    const data = await getInventorySale<SaleInvoiceRow>({
      saleId,
      sbAdmin,
      wsId,
    });

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export function normalizeSaleDetail(data: SaleInvoiceRow) {
  const wallet = Array.isArray(data.wallet) ? data.wallet[0] : data.wallet;
  const category = Array.isArray(data.category)
    ? data.category[0]
    : data.category;
  const customer = Array.isArray(data.customer)
    ? data.customer[0]
    : data.customer;
  const creator = Array.isArray(data.creator) ? data.creator[0] : data.creator;
  const platformCreator = Array.isArray(data.platform_creator)
    ? data.platform_creator[0]
    : data.platform_creator;
  const linkedTransaction = Array.isArray(data.linked_transaction)
    ? data.linked_transaction[0]
    : data.linked_transaction;
  const lines = Array.isArray(data.finance_invoice_products)
    ? data.finance_invoice_products
    : [];

  return {
    id: data.id,
    notice: data.notice,
    note: data.note,
    paid_amount: data.paid_amount,
    created_at: data.created_at,
    completed_at: data.completed_at,
    wallet_id: data.wallet_id,
    wallet_name: wallet?.name ?? null,
    category_id: data.category_id,
    category_name: category?.name ?? null,
    transaction_id: data.transaction_id,
    transaction_missing: Boolean(data.transaction_id) && !linkedTransaction?.id,
    customer_id: data.customer_id ?? null,
    customer_name: customer?.full_name ?? customer?.display_name ?? null,
    creator_name:
      creator?.full_name ??
      creator?.display_name ??
      platformCreator?.display_name ??
      null,
    items_count: lines.length,
    total_quantity: lines.reduce(
      (sum: number, line: SaleInvoiceProductRow) =>
        sum + Number(line.amount ?? 0),
      0
    ),
    owners: [
      ...new Set(
        lines.map(
          (line: SaleInvoiceProductRow) => line.owner_name ?? 'Unassigned'
        )
      ),
    ],
    source: 'finance_invoice' as const,
    lines: lines.map((line: SaleInvoiceProductRow) => ({
      product_id: line.product_id ?? '',
      product_name: line.product_name ?? '',
      owner_id: line.owner_id,
      owner_name: line.owner_name ?? '',
      unit_id: line.unit_id,
      unit_name: line.product_unit ?? '',
      warehouse_id: line.warehouse_id,
      warehouse_name: line.warehouse ?? '',
      quantity: Number(line.amount ?? 0),
      price: Number(line.price ?? 0),
    })),
  };
}

export function makeSaleLineKey(input: {
  productId: string | null | undefined;
  unitId: string | null | undefined;
  warehouseId: string | null | undefined;
}) {
  return [
    input.productId ?? '',
    input.unitId ?? '',
    input.warehouseId ?? '',
  ].join('|');
}

export async function resolveInventorySaleCategoryId(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  explicitCategoryId: string | null,
  fallbackCategoryId: string | null,
  productIds: string[]
) {
  let linkedCategoryIds: string[] = [];

  if (productIds.length > 0) {
    const { data: productRows, error: productError } = await sbAdmin
      .from('workspace_products')
      .select('id, finance_category_id')
      .in('id', productIds)
      .eq('ws_id', wsId)
      .eq('archived', false);

    if (productError) {
      throw new Error('Failed to validate sold products');
    }

    if ((productRows ?? []).length !== productIds.length) {
      return {
        errorResponse: NextResponse.json(
          { message: 'One or more sold products are invalid' },
          { status: 400 }
        ),
      };
    }

    linkedCategoryIds = [
      ...new Set(
        (productRows ?? [])
          .map((row) => row.finance_category_id)
          .filter((value): value is string => Boolean(value))
      ),
    ];
  }

  let resolvedCategoryId = explicitCategoryId?.trim() || fallbackCategoryId;

  if (!resolvedCategoryId && linkedCategoryIds.length === 1) {
    resolvedCategoryId = linkedCategoryIds[0] ?? null;
  }

  if (!resolvedCategoryId && linkedCategoryIds.length > 1) {
    return {
      errorResponse: NextResponse.json(
        {
          message:
            'This cart contains products with different linked finance categories. Please choose a category override.',
        },
        { status: 400 }
      ),
    };
  }

  if (!resolvedCategoryId) {
    return {
      errorResponse: NextResponse.json(
        { message: 'Missing required field: category_id' },
        { status: 400 }
      ),
    };
  }

  const { data: category, error: categoryError } = await sbAdmin
    .from('transaction_categories')
    .select('id')
    .eq('id', resolvedCategoryId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (categoryError) {
    throw new Error('Failed to validate category');
  }

  if (!category) {
    return {
      errorResponse: NextResponse.json(
        { message: 'Invalid category' },
        { status: 400 }
      ),
    };
  }

  return { categoryId: resolvedCategoryId };
}

export async function buildUpdatedInvoiceProducts(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  products: UpdateSaleProductInput[],
  invoiceId: string
) {
  const productMap = new Map<string, UpdateSaleProductInput>();

  for (const product of products) {
    const key = makeSaleLineKey({
      productId: product.product_id,
      unitId: product.unit_id,
      warehouseId: product.warehouse_id,
    });
    const existing = productMap.get(key);
    if (existing) {
      existing.quantity += product.quantity;
    } else {
      productMap.set(key, { ...product });
    }
  }

  const productValues = [...productMap.values()];
  const productIds = [
    ...new Set(productValues.map((product) => product.product_id)),
  ];
  const unitIds = [...new Set(productValues.map((product) => product.unit_id))];
  const warehouseIds = [
    ...new Set(productValues.map((product) => product.warehouse_id)),
  ];
  const inventory = sbAdmin.schema('private');

  const [productsResult, unitsResult, warehousesResult] = await Promise.all([
    sbAdmin
      .from('workspace_products')
      .select('id, name, owner_id, finance_category_id')
      .in('id', productIds)
      .eq('ws_id', wsId)
      .eq('archived', false),
    inventory
      .from('inventory_units')
      .select('id, name')
      .in('id', unitIds)
      .eq('ws_id', wsId),
    inventory
      .from('inventory_warehouses')
      .select('id, name')
      .in('id', warehouseIds)
      .eq('ws_id', wsId),
  ]);

  if (productsResult.error) {
    throw new Error('Failed to validate sold products');
  }
  if (unitsResult.error) {
    throw new Error('Failed to validate units');
  }
  if (warehousesResult.error) {
    throw new Error('Failed to validate warehouses');
  }

  if ((productsResult.data ?? []).length !== productIds.length) {
    return {
      errorResponse: NextResponse.json(
        { message: 'One or more sold products are invalid' },
        { status: 400 }
      ),
    };
  }

  if ((unitsResult.data ?? []).length !== unitIds.length) {
    return {
      errorResponse: NextResponse.json(
        { message: 'One or more product units are invalid' },
        { status: 400 }
      ),
    };
  }

  if ((warehousesResult.data ?? []).length !== warehouseIds.length) {
    return {
      errorResponse: NextResponse.json(
        { message: 'One or more warehouses are invalid' },
        { status: 400 }
      ),
    };
  }

  const { data: inventoryRows, error: inventoryError } = await inventory
    .from('inventory_products')
    .select('product_id, unit_id, warehouse_id, price')
    .in('product_id', productIds)
    .in('unit_id', unitIds)
    .in('warehouse_id', warehouseIds);

  if (inventoryError) {
    throw new Error('Failed to validate inventory products');
  }

  const inventoryByKey = new Map(
    ((inventoryRows ?? []) as InventoryStockRow[]).map((row) => [
      makeSaleLineKey({
        productId: row.product_id,
        unitId: row.unit_id,
        warehouseId: row.warehouse_id,
      }),
      row,
    ])
  );

  if (
    productValues.some(
      (product) =>
        !inventoryByKey.has(
          makeSaleLineKey({
            productId: product.product_id,
            unitId: product.unit_id,
            warehouseId: product.warehouse_id,
          })
        )
    )
  ) {
    return {
      errorResponse: NextResponse.json(
        { message: 'One or more sold product inventory records are invalid' },
        { status: 400 }
      ),
    };
  }

  const ownerIds = [
    ...new Set(
      (productsResult.data ?? [])
        .map((row) => row.owner_id)
        .filter((value): value is string => !!value)
    ),
  ];
  const { data: ownersData, error: ownersError } =
    ownerIds.length > 0
      ? await inventory
          .from('inventory_owners')
          .select('id, name')
          .in('id', ownerIds)
          .eq('ws_id', wsId)
      : { data: [], error: null };

  if (ownersError) {
    throw new Error('Failed to validate inventory owners');
  }

  const productInfoById = new Map(
    (productsResult.data ?? []).map((row) => [
      row.id,
      {
        name: row.name ?? '',
        ownerId: row.owner_id ?? null,
        ownerName:
          ownersData?.find((owner) => owner.id === row.owner_id)?.name ?? '',
      },
    ])
  );
  const unitNameById = new Map(
    (unitsResult.data ?? []).map((row) => [row.id, row.name ?? ''])
  );
  const warehouseNameById = new Map(
    (warehousesResult.data ?? []).map((row) => [row.id, row.name ?? ''])
  );

  const invoiceProducts = productValues.map((product) => {
    const productInfo = productInfoById.get(product.product_id);
    const inventoryProduct = inventoryByKey.get(
      makeSaleLineKey({
        productId: product.product_id,
        unitId: product.unit_id,
        warehouseId: product.warehouse_id,
      })
    );
    return {
      invoice_id: invoiceId,
      product_name: productInfo?.name ?? '',
      product_unit: unitNameById.get(product.unit_id) ?? '',
      product_id: product.product_id,
      unit_id: product.unit_id,
      warehouse_id: product.warehouse_id,
      warehouse: warehouseNameById.get(product.warehouse_id) ?? '',
      amount: product.quantity,
      price: Math.round(Number(inventoryProduct?.price ?? 0)),
      owner_id: productInfo?.ownerId ?? null,
      owner_name: productInfo?.ownerName ?? '',
    };
  });

  return {
    invoiceProducts,
    totalPaidAmount: invoiceProducts.reduce(
      (sum, line) => sum + Number(line.amount ?? 0) * Number(line.price ?? 0),
      0
    ),
    productIds,
  };
}

export type BuildUpdatedInvoiceProductsResult = Awaited<
  ReturnType<typeof buildUpdatedInvoiceProducts>
>;

export async function syncInvoiceTransaction(
  sbAdmin: TypedSupabaseClient,
  params: {
    sale: SaleInvoiceRow;
    saleId: string;
    walletId: string;
    categoryId: string;
    paidAmount: number;
    notice: string | null;
    actor: Awaited<ReturnType<typeof getInventoryActorContext>>;
  }
) {
  const { sale, saleId, walletId, categoryId, paidAmount, notice, actor } =
    params;
  const fallbackDescription = notice?.trim().length
    ? notice.trim()
    : 'Inventory sale';

  const existingTransactionId = sale.transaction_id;
  const { data: transactionRow } = existingTransactionId
    ? await sbAdmin
        .from('wallet_transactions')
        .select('id, taken_at')
        .eq('id', existingTransactionId)
        .maybeSingle()
    : await sbAdmin
        .from('wallet_transactions')
        .select('id, taken_at')
        .eq('invoice_id', saleId)
        .maybeSingle();

  let linkedTransactionId = transactionRow?.id ?? null;

  if (linkedTransactionId) {
    const { error: transactionUpdateError } = await sbAdmin
      .from('wallet_transactions')
      .update({
        wallet_id: walletId,
        category_id: categoryId,
        amount: paidAmount,
        description: fallbackDescription,
      })
      .eq('id', linkedTransactionId);

    if (transactionUpdateError) {
      throw new Error('Failed to update linked finance transaction');
    }
  } else {
    const { data: createdTransaction, error: transactionInsertError } =
      await sbAdmin
        .from('wallet_transactions')
        .insert({
          wallet_id: walletId,
          category_id: categoryId,
          amount: paidAmount,
          description: fallbackDescription,
          invoice_id: saleId,
          creator_id: sale.creator_id ?? actor.workspaceUserId ?? null,
          platform_creator_id:
            sale.platform_creator_id ?? actor.authUserId ?? null,
          taken_at:
            sale.completed_at ??
            sale.created_at ??
            transactionRow?.taken_at ??
            new Date().toISOString(),
          report_opt_in: false,
        })
        .select('id')
        .single();

    if (transactionInsertError || !createdTransaction) {
      throw new Error('Failed to restore linked finance transaction');
    }

    linkedTransactionId = createdTransaction.id;
  }

  if (linkedTransactionId && sale.transaction_id !== linkedTransactionId) {
    const { error: invoiceTransactionError } = await sbAdmin
      .from('finance_invoices')
      .update({ transaction_id: linkedTransactionId })
      .eq('id', saleId);

    if (invoiceTransactionError) {
      throw new Error('Failed to relink finance transaction');
    }
  }

  return linkedTransactionId;
}
