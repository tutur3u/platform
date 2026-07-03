import { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import {
  createInventoryAuditLog,
  diffInventoryAuditFields,
} from '@tuturuuu/inventory-core/audit';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canDeleteInventorySales,
  canUpdateInventorySales,
  canViewInventorySales,
} from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  type BuildUpdatedInvoiceProductsResult,
  buildUpdatedInvoiceProducts,
  loadSale,
  makeSaleLineKey,
  normalizeSaleDetail,
  resolveInventorySaleCategoryId,
  syncInvoiceTransaction,
} from './queries';
import { type Params, UpdateSaleSchema } from './types';

export async function handleGetSale(req: Request, { params }: Params) {
  const { wsId: id, saleId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const { permissions, wsId } = authorization.value;

  if (!canViewInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await loadSale(sbAdmin, wsId, saleId);

  if (error) {
    serverLogger.error('Error fetching inventory sale detail', error);
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

export async function handlePutSale(req: Request, { params }: Params) {
  const { wsId: id, saleId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const { permissions, wsId } = authorization.value;

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
    serverLogger.error('Error loading inventory sale detail', loadError);
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
    .schema('private')
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
      serverLogger.error(
        'Error validating updated inventory sale products',
        error
      );
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
        serverLogger.error(
          'Error reconciling product stock changes',
          stockError
        );
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
      serverLogger.error('Error deleting sale line items', lineDeleteError);
      return NextResponse.json(
        { message: 'Failed to update sale line items' },
        { status: 500 }
      );
    }

    const { error: lineInsertError } = await sbAdmin
      .from('finance_invoice_products')
      .insert(builtProducts.invoiceProducts);

    if (lineInsertError) {
      serverLogger.error('Error inserting sale line items', lineInsertError);
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
    serverLogger.error('Error updating inventory sale', updateError);
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
    serverLogger.error('Error syncing linked finance transaction', error);
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
    serverLogger.error('Error reloading inventory sale detail', reloadError);
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

export async function handleDeleteSale(req: Request, { params }: Params) {
  const { wsId: id, saleId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const { permissions, wsId } = authorization.value;

  if (!canDeleteInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data: existing, error: loadError } = await loadSale(
    sbAdmin,
    wsId,
    saleId
  );

  if (loadError) {
    serverLogger.error('Error loading inventory sale detail', loadError);
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
      serverLogger.error(
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
    serverLogger.error(
      'Error deleting inventory sale promotions',
      promotionsError
    );
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
    serverLogger.error('Error deleting inventory sale lines', productsError);
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
    serverLogger.error('Error deleting inventory sale invoice', invoiceError);
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
