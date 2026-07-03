import {
  parseInventoryApiListQuery,
  shouldReturnPaginatedInventoryList,
} from '@tuturuuu/inventory-core/api-list-query';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { getInventoryBatches } from '@tuturuuu/inventory-core/product-rpc';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const BatchPayloadSchema = z.object({
  price: z.number().nonnegative().optional(),
  supplier_id: z.guid().nullable().optional(),
  total_diff: z.number().optional(),
  warehouse_id: z.guid(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

async function assertBatchRelations({
  inventory,
  supplierId,
  warehouseId,
  wsId,
}: {
  inventory: ReturnType<
    Awaited<ReturnType<typeof createAdminClient>>['schema']
  >;
  supplierId?: string | null;
  warehouseId: string;
  wsId: string;
}) {
  const { data: warehouse, error: warehouseError } = await inventory
    .from('inventory_warehouses')
    .select('id')
    .eq('id', warehouseId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (warehouseError) throw warehouseError;
  if (!warehouse) {
    return { ok: false as const, message: 'Invalid batch warehouse' };
  }

  if (!supplierId) {
    return { ok: true as const };
  }

  const { data: supplier, error: supplierError } = await inventory
    .from('inventory_suppliers')
    .select('id')
    .eq('id', supplierId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (supplierError) throw supplierError;
  if (!supplier) {
    return { ok: false as const, message: 'Invalid batch supplier' };
  }

  return { ok: true as const };
}

async function loadBatch({
  batchId,
  inventory,
  wsId,
}: {
  batchId: string;
  inventory: ReturnType<
    Awaited<ReturnType<typeof createAdminClient>>['schema']
  >;
  wsId: string;
}) {
  const { data: batch, error } = await inventory
    .from('inventory_batches')
    .select('id, created_at, price, total_diff, supplier_id, warehouse_id')
    .eq('id', batchId)
    .maybeSingle();

  if (error) throw error;
  if (!batch) return null;

  const { data: warehouse, error: warehouseError } = await inventory
    .from('inventory_warehouses')
    .select('id, name, ws_id')
    .eq('id', batch.warehouse_id)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (warehouseError) throw warehouseError;
  if (!warehouse) return null;

  const { data: supplier, error: supplierError } = batch.supplier_id
    ? await inventory
        .from('inventory_suppliers')
        .select('id, name')
        .eq('id', batch.supplier_id)
        .eq('ws_id', wsId)
        .maybeSingle()
    : { data: null, error: null };

  if (supplierError) throw supplierError;

  return {
    ...batch,
    supplier: supplier?.name ?? undefined,
    warehouse: warehouse.name,
    ws_id: warehouse.ws_id,
  };
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const parsedQuery = parseInventoryApiListQuery(req);
  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  const { permissions, wsId } = authorization.value;
  if (!canViewInventoryCatalog(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const { page, pageSize, q } = parsedQuery.data;
    const result = await getInventoryBatches({
      limit: shouldReturnPaginatedInventoryList(req) ? pageSize : 10_000,
      offset: shouldReturnPaginatedInventoryList(req)
        ? (page - 1) * pageSize
        : 0,
      sbAdmin: await createAdminClient(),
      search: q,
      wsId,
    });

    return NextResponse.json(result);
  } catch (error) {
    serverLogger.error('Error fetching inventory batches', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory batches' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const authorization = await authorizeInventoryWorkspace(req, id);
    if (!authorization.ok) return authorization.response;

    const { permissions, wsId } = authorization.value;
    if (!canManageInventorySetup(permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const parsed = BatchPayloadSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid batch payload', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const inventory = (await createAdminClient()).schema('private');
    const relations = await assertBatchRelations({
      inventory,
      supplierId: parsed.data.supplier_id,
      warehouseId: parsed.data.warehouse_id,
      wsId,
    });
    if (!relations.ok) {
      return NextResponse.json({ message: relations.message }, { status: 400 });
    }

    const { data, error } = await inventory
      .from('inventory_batches')
      .insert({
        price: parsed.data.price ?? 0,
        supplier_id: parsed.data.supplier_id ?? null,
        total_diff: parsed.data.total_diff ?? 0,
        warehouse_id: parsed.data.warehouse_id,
      })
      .select('id')
      .single();

    if (error) throw error;

    const batch = await loadBatch({ batchId: data.id, inventory, wsId });
    return NextResponse.json({ data: batch }, { status: 201 });
  } catch (error) {
    serverLogger.error('Error creating inventory batch', error);
    return NextResponse.json(
      { message: 'Failed to create inventory batch' },
      { status: 500 }
    );
  }
}
