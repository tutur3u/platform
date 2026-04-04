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
  wallet: NamedRelation | NamedRelation[] | null;
  category: NamedRelation | NamedRelation[] | null;
  customer: WorkspaceUserRelation | WorkspaceUserRelation[] | null;
  creator: WorkspaceUserRelation | WorkspaceUserRelation[] | null;
  platform_creator: PlatformUserRelation | PlatformUserRelation[] | null;
  finance_invoice_products: SaleInvoiceProductRow[] | null;
}

const UpdateSaleSchema = z.object({
  notice: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  wallet_id: z.guid().nullable().optional(),
  category_id: z.guid().nullable().optional(),
});

async function loadSale(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  saleId: string
) {
  const { data, error } = await sbAdmin
    .from('finance_invoices')
    .select(
      'id, notice, note, paid_amount, created_at, completed_at, wallet_id, category_id, customer_id, wallet:workspace_wallets(name), category:transaction_categories(name), customer:workspace_users!finance_invoices_customer_id_fkey(id, full_name, display_name), creator:workspace_users!finance_invoices_creator_id_fkey(id, full_name, display_name), platform_creator:users!finance_invoices_platform_creator_id_fkey(id, display_name), finance_invoice_products!inner(amount, price, owner_id, owner_name, product_id, product_name, product_unit, unit_id, warehouse_id, warehouse)'
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

export async function GET(req: Request, { params }: Params) {
  const { wsId: id, saleId } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
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

  if (payload.wallet_id) {
    const { data: wallet, error: walletError } = await sbAdmin
      .from('workspace_wallets')
      .select('id')
      .eq('id', payload.wallet_id)
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
  }

  if (payload.category_id) {
    const { data: category, error: categoryError } = await sbAdmin
      .from('transaction_categories')
      .select('id')
      .eq('id', payload.category_id)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (categoryError) {
      return NextResponse.json(
        { message: 'Failed to validate category' },
        { status: 500 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { message: 'Invalid category' },
        { status: 400 }
      );
    }
  }

  const before = normalizeSaleDetail(existing);
  const updatePayload: Record<string, string | null> = {};

  if ('notice' in payload) updatePayload.notice = payload.notice ?? null;
  if ('note' in payload) updatePayload.note = payload.note ?? null;
  if ('wallet_id' in payload)
    updatePayload.wallet_id = payload.wallet_id ?? null;
  if ('category_id' in payload) {
    updatePayload.category_id = payload.category_id ?? null;
  }

  const { error: updateError } = await sbAdmin
    .from('finance_invoices')
    .update(updatePayload)
    .eq('id', saleId)
    .eq('ws_id', wsId);

  if (updateError) {
    console.error('Error updating inventory sale', updateError);
    return NextResponse.json(
      { message: 'Failed to update inventory sale' },
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
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ data: after });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: id, saleId } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
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
