import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  inventoryNotFoundResponse,
  isInventoryEnabled,
} from '@/lib/inventory/access';
import { getInventoryActorContext } from '@/lib/inventory/actor';
import {
  createInventoryAuditLog,
  diffInventoryAuditFields,
} from '@/lib/inventory/audit';
import {
  canDeleteInventorySales,
  canUpdateInventorySales,
  canViewInventorySales,
} from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{
    wsId: string;
    saleId: string;
  }>;
}

interface NamedRelation {
  name: string | null;
}

interface TransactionRelation {
  id: string | null;
  taken_at: string | null;
}

interface WorkspaceUserRelation {
  id: string;
  full_name: string | null;
  display_name: string | null;
}

interface PlatformUserRelation {
  id: string;
  display_name: string | null;
}

interface SaleInvoiceProductRow {
  amount: number | null;
  price: number | null;
  owner_id: string | null;
  owner_name: string | null;
  product_id: string | null;
  product_name: string | null;
  product_unit: string | null;
  unit_id: string;
  warehouse_id: string;
  warehouse: string | null;
}

interface SaleInvoiceRow {
  id: string;
  notice: string | null;
  note: string | null;
  paid_amount: number;
  created_at: string | null;
  completed_at: string | null;
  wallet_id: string | null;
  category_id: string | null;
  customer_id: string | null;
  creator_id: string | null;
  platform_creator_id: string | null;
  transaction_id: string | null;
  wallet: NamedRelation | NamedRelation[] | null;
  category: NamedRelation | NamedRelation[] | null;
  customer: WorkspaceUserRelation | WorkspaceUserRelation[] | null;
  creator: WorkspaceUserRelation | WorkspaceUserRelation[] | null;
  platform_creator: PlatformUserRelation | PlatformUserRelation[] | null;
  linked_transaction: TransactionRelation | TransactionRelation[] | null;
  finance_invoice_products: SaleInvoiceProductRow[] | null;
}

const UpdateSaleProductSchema = z.object({
  product_id: z.guid(),
  unit_id: z.guid(),
  warehouse_id: z.guid(),
  quantity: z.number().positive(),
  price: z.number().min(0),
});

const UpdateSaleSchema = z.object({
  notice: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  wallet_id: z.guid().nullable().optional(),
  category_id: z.guid().nullable().optional(),
  products: z.array(UpdateSaleProductSchema).min(1).optional(),
});

async function loadSale(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  saleId: string
) {
  const { data, error } = await sbAdmin
    .from('finance_invoices')
    .select(
      'id, notice, note, paid_amount, created_at, completed_at, wallet_id, category_id, customer_id, creator_id, platform_creator_id, transaction_id, wallet:workspace_wallets(name), category:transaction_categories(name), customer:workspace_users!finance_invoices_customer_id_fkey(id, full_name, display_name), creator:workspace_users!finance_invoices_creator_id_fkey(id, full_name, display_name), platform_creator:users!finance_invoices_platform_creator_id_fkey(id, display_name), linked_transaction:wallet_transactions!finance_invoices_transaction_id_fkey(id, taken_at), finance_invoice_products!inner(amount, price, owner_id, owner_name, product_id, product_name, product_unit, unit_id, warehouse_id, warehouse)'
    )
    .eq('ws_id', wsId)
    .eq('id', saleId)
    .maybeSingle();

  return { data, error };
}

function normalizeSaleDetail(data: SaleInvoiceRow) {
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

function makeSaleLineKey(input: {
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

async function resolveInventorySaleCategoryId(
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

async function buildUpdatedInvoiceProducts(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  products: z.infer<typeof UpdateSaleProductSchema>[],
  invoiceId: string
) {
  const productMap = new Map<string, z.infer<typeof UpdateSaleProductSchema>>();

  for (const product of products) {
    const key = `${product.product_id}-${product.unit_id}-${product.warehouse_id}-${product.price}`;
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

  const [productsResult, unitsResult, warehousesResult] = await Promise.all([
    sbAdmin
      .from('workspace_products')
      .select('id, name, owner_id, inventory_owners(name), finance_category_id')
      .in('id', productIds)
      .eq('ws_id', wsId)
      .eq('archived', false),
    sbAdmin
      .from('inventory_units')
      .select('id, name')
      .in('id', unitIds)
      .eq('ws_id', wsId),
    sbAdmin
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

  const productInfoById = new Map(
    (productsResult.data ?? []).map((row) => [
      row.id,
      {
        name: row.name ?? '',
        ownerId: row.owner_id ?? null,
        ownerName: Array.isArray(row.inventory_owners)
          ? (row.inventory_owners[0]?.name ?? '')
          : (row.inventory_owners?.name ?? ''),
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
    return {
      invoice_id: invoiceId,
      product_name: productInfo?.name ?? '',
      product_unit: unitNameById.get(product.unit_id) ?? '',
      product_id: product.product_id,
      unit_id: product.unit_id,
      warehouse_id: product.warehouse_id,
      warehouse: warehouseNameById.get(product.warehouse_id) ?? '',
      amount: product.quantity,
      price: Math.round(product.price),
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

type BuildUpdatedInvoiceProductsResult = Awaited<
  ReturnType<typeof buildUpdatedInvoiceProducts>
>;

async function syncInvoiceTransaction(
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

export async function GET(req: Request, { params }: Params) {
  const { wsId: id, saleId } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
  if (!(await isInventoryEnabled(wsId))) {
    return inventoryNotFoundResponse();
  }
  const permissions = await getPermissions({ wsId: id, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canViewInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await loadSale(sbAdmin, wsId, saleId);

  if (error) {
    console.error('Error fetching inventory sale detail', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory sale detail' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
  }

  return NextResponse.json({ data: normalizeSaleDetail(data) });
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: id, saleId } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
  if (!(await isInventoryEnabled(wsId))) {
    return inventoryNotFoundResponse();
  }
  const permissions = await getPermissions({ wsId: id, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canUpdateInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = UpdateSaleSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data: existing, error: loadError } = await loadSale(
    sbAdmin,
    wsId,
    saleId
  );

  if (loadError) {
    console.error('Error loading inventory sale detail', loadError);
    return NextResponse.json(
      { message: 'Failed to fetch inventory sale detail' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
  }

  const payload = parsed.data;

  const before = normalizeSaleDetail(existing);
  const actor = await getInventoryActorContext(req, wsId);
  const nextWalletId =
    'wallet_id' in payload ? payload.wallet_id : existing.wallet_id;

  if (!nextWalletId) {
    return NextResponse.json(
      { message: 'Wallet is required for inventory sales' },
      { status: 400 }
    );
  }

  const { data: wallet, error: walletError } = await sbAdmin
    .from('workspace_wallets')
    .select('id')
    .eq('id', nextWalletId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (walletError) {
    return NextResponse.json(
      { message: 'Failed to validate wallet' },
      { status: 500 }
    );
  }

  if (!wallet) {
    return NextResponse.json({ message: 'Invalid wallet' }, { status: 400 });
  }

  let nextCategoryId =
    'category_id' in payload ? (payload.category_id ?? null) : null;
  let nextPaidAmount = existing.paid_amount;

  if (payload.products) {
    let builtProducts: BuildUpdatedInvoiceProductsResult;
    try {
      builtProducts = await buildUpdatedInvoiceProducts(
        sbAdmin,
        wsId,
        payload.products,
        saleId
      );
    } catch (error) {
      console.error('Error validating updated inventory sale products', error);
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : 'Failed to update sale products',
        },
        { status: 500 }
      );
    }

    if ('errorResponse' in builtProducts) {
      return builtProducts.errorResponse;
    }

    const categoryResolution = await resolveInventorySaleCategoryId(
      sbAdmin,
      wsId,
      nextCategoryId,
      existing.category_id,
      builtProducts.productIds
    );

    if ('errorResponse' in categoryResolution) {
      return categoryResolution.errorResponse;
    }

    nextCategoryId = categoryResolution.categoryId ?? null;
    nextPaidAmount = Math.round(builtProducts.totalPaidAmount);

    const previousAmounts = new Map<string, number>();
    for (const line of before.lines) {
      if (!line.product_id) continue;
      const lineKey = makeSaleLineKey({
        productId: line.product_id,
        unitId: line.unit_id,
        warehouseId: line.warehouse_id,
      });
      previousAmounts.set(
        lineKey,
        (previousAmounts.get(lineKey) ?? 0) + line.quantity
      );
    }

    const nextAmounts = new Map<string, number>();
    for (const line of builtProducts.invoiceProducts) {
      nextAmounts.set(
        makeSaleLineKey({
          productId: line.product_id,
          unitId: line.unit_id,
          warehouseId: line.warehouse_id,
        }),
        (nextAmounts.get(
          makeSaleLineKey({
            productId: line.product_id,
            unitId: line.unit_id,
            warehouseId: line.warehouse_id,
          })
        ) ?? 0) + Number(line.amount ?? 0)
      );
    }

    const stockCreatorId = actor.workspaceUserId ?? existing.creator_id ?? null;
    if (!stockCreatorId) {
      return NextResponse.json(
        { message: 'Failed to resolve inventory actor' },
        { status: 500 }
      );
    }

    const stockAdjustments = [
      ...new Set([...previousAmounts.keys(), ...nextAmounts.keys()]),
    ].flatMap((key) => {
      const [productId = '', unitId = '', warehouseId = ''] = key.split('|');
      const delta =
        (previousAmounts.get(key) ?? 0) - (nextAmounts.get(key) ?? 0);

      if (!productId || !unitId || !warehouseId || delta === 0) {
        return [];
      }

      return [
        {
          product_id: productId,
          unit_id: unitId,
          warehouse_id: warehouseId,
          amount: delta,
        },
      ];
    });

    if (stockAdjustments.length > 0) {
      const { error: stockError } = await sbAdmin
        .from('product_stock_changes')
        .insert(
          stockAdjustments.map((entry) => ({
            product_id: entry.product_id,
            unit_id: entry.unit_id,
            warehouse_id: entry.warehouse_id,
            amount: entry.amount,
            creator_id: stockCreatorId,
            beneficiary_id: null,
          }))
        );

      if (stockError) {
        console.error('Error reconciling product stock changes', stockError);
        return NextResponse.json(
          { message: 'Failed to reconcile inventory stock' },
          { status: 500 }
        );
      }
    }

    const { error: lineDeleteError } = await sbAdmin
      .from('finance_invoice_products')
      .delete()
      .eq('invoice_id', saleId);

    if (lineDeleteError) {
      console.error('Error deleting sale line items', lineDeleteError);
      return NextResponse.json(
        { message: 'Failed to update sale line items' },
        { status: 500 }
      );
    }

    const { error: lineInsertError } = await sbAdmin
      .from('finance_invoice_products')
      .insert(builtProducts.invoiceProducts);

    if (lineInsertError) {
      console.error('Error inserting sale line items', lineInsertError);
      return NextResponse.json(
        { message: 'Failed to update sale line items' },
        { status: 500 }
      );
    }
  } else {
    const categoryResolution = await resolveInventorySaleCategoryId(
      sbAdmin,
      wsId,
      nextCategoryId,
      existing.category_id,
      []
    );

    if ('errorResponse' in categoryResolution) {
      return categoryResolution.errorResponse;
    }

    nextCategoryId = categoryResolution.categoryId ?? null;
  }

  const nextNotice =
    'notice' in payload ? (payload.notice ?? null) : existing.notice;
  const nextNote = 'note' in payload ? (payload.note ?? null) : existing.note;

  const { error: updateError } = await sbAdmin
    .from('finance_invoices')
    .update({
      notice: nextNotice,
      note: nextNote,
      wallet_id: nextWalletId,
      category_id: nextCategoryId,
      price: nextPaidAmount,
      total_diff: 0,
      paid_amount: nextPaidAmount,
    })
    .eq('id', saleId)
    .eq('ws_id', wsId);

  if (updateError) {
    console.error('Error updating inventory sale', updateError);
    return NextResponse.json(
      { message: 'Failed to update inventory sale' },
      { status: 500 }
    );
  }

  try {
    await syncInvoiceTransaction(sbAdmin, {
      sale: existing,
      saleId,
      walletId: nextWalletId,
      categoryId: nextCategoryId ?? '',
      paidAmount: nextPaidAmount,
      notice: nextNotice,
      actor,
    });
  } catch (error) {
    console.error('Error syncing linked finance transaction', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to sync linked finance transaction',
      },
      { status: 500 }
    );
  }

  const { data: updated, error: reloadError } = await loadSale(
    sbAdmin,
    wsId,
    saleId
  );

  if (reloadError) {
    console.error('Error reloading inventory sale detail', reloadError);
    return NextResponse.json(
      { message: 'Failed to reload inventory sale detail' },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
  }

  const after = normalizeSaleDetail(updated);

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'updated',
    entityKind: 'sale',
    entityId: saleId,
    entityLabel: (after.notice?.trim().length ?? 0) > 0 ? after.notice : saleId,
    summary:
      (after.notice?.trim().length ?? 0) > 0
        ? `Updated sale ${after.notice!.trim()}`
        : `Updated sale ${saleId}`,
    changedFields: diffInventoryAuditFields(before, after),
    before,
    after,
    actor,
  });

  return NextResponse.json({ data: after });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: id, saleId } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
  if (!(await isInventoryEnabled(wsId))) {
    return inventoryNotFoundResponse();
  }
  const permissions = await getPermissions({ wsId: id, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canDeleteInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data: existing, error: loadError } = await loadSale(
    sbAdmin,
    wsId,
    saleId
  );

  if (loadError) {
    console.error('Error loading inventory sale detail', loadError);
    return NextResponse.json(
      { message: 'Failed to fetch inventory sale detail' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
  }

  const before = normalizeSaleDetail(existing);
  const actor = await getInventoryActorContext(req, wsId);
  const actorWorkspaceUserId = actor.workspaceUserId;

  if (!actorWorkspaceUserId) {
    return NextResponse.json(
      { message: 'Failed to resolve inventory actor' },
      { status: 500 }
    );
  }

  const stockRestores = before.lines.map((line) => ({
    product_id: line.product_id,
    unit_id: line.unit_id,
    warehouse_id: line.warehouse_id,
    amount: line.quantity,
    creator_id: actorWorkspaceUserId,
    beneficiary_id: null,
  }));

  if (stockRestores.length > 0) {
    const { error: stockError } = await sbAdmin
      .from('product_stock_changes')
      .insert(stockRestores);

    if (stockError) {
      console.error(
        'Error restoring stock for deleted inventory sale',
        stockError
      );
      return NextResponse.json(
        { message: 'Failed to restore stock for inventory sale' },
        { status: 500 }
      );
    }
  }

  const { error: promotionsError } = await sbAdmin
    .from('finance_invoice_promotions')
    .delete()
    .eq('invoice_id', saleId);

  if (promotionsError) {
    console.error('Error deleting inventory sale promotions', promotionsError);
    return NextResponse.json(
      { message: 'Failed to delete inventory sale' },
      { status: 500 }
    );
  }

  const { error: productsError } = await sbAdmin
    .from('finance_invoice_products')
    .delete()
    .eq('invoice_id', saleId);

  if (productsError) {
    console.error('Error deleting inventory sale lines', productsError);
    return NextResponse.json(
      { message: 'Failed to delete inventory sale' },
      { status: 500 }
    );
  }

  const { error: invoiceError } = await sbAdmin
    .from('finance_invoices')
    .delete()
    .eq('id', saleId)
    .eq('ws_id', wsId);

  if (invoiceError) {
    console.error('Error deleting inventory sale invoice', invoiceError);
    return NextResponse.json(
      { message: 'Failed to delete inventory sale' },
      { status: 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'deleted',
    entityKind: 'sale',
    entityId: saleId,
    entityLabel:
      (before.notice?.trim().length ?? 0) > 0 ? before.notice : saleId,
    summary:
      (before.notice?.trim().length ?? 0) > 0
        ? `Deleted sale ${before.notice!.trim()}`
        : `Deleted sale ${saleId}`,
    changedFields: ['products', 'wallet_id', 'category_id', 'paid_amount'],
    before,
    after: null,
    actor,
  });

  return NextResponse.json({ message: 'Sale deleted' });
}
