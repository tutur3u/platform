import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
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
import { createInventoryAuditLog } from '@/lib/inventory/audit';
import {
  canAdjustInventoryStock,
  canManageInventoryCatalog,
} from '@/lib/inventory/permissions';
import { getStockChangeAmount } from '@/lib/inventory/stock-change';

const InventoryItemSchema = z.object({
  unit_id: z.guid(),
  warehouse_id: z.guid(),
  amount: z.number().nonnegative().nullable(),
  min_amount: z.number().nonnegative(),
  price: z.number().nonnegative(),
});

export const ProductCreateSchema = z.object({
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  manufacturer: z.string().max(MAX_NAME_LENGTH).optional(),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  usage: z.string().max(MAX_MEDIUM_TEXT_LENGTH).optional(),
  category_id: z.guid(),
  owner_id: z.guid().optional(),
  finance_category_id: z.guid().nullable().optional(),
  inventory: z.array(InventoryItemSchema).default([]),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const getWorkspaceUserId = async ({
  supabase,
  sbAdmin,
  wsId,
}: {
  supabase: TypedSupabaseClient;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) => {
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) return null;

  const { data: workspaceUser } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', wsId)
    .single();

  return workspaceUser?.virtual_user_id ?? null;
};

const validateProductRelations = async ({
  sbAdmin,
  wsId,
  categoryId,
  ownerId,
  financeCategoryId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  categoryId: string;
  ownerId: string;
  financeCategoryId?: string | null;
}) => {
  const [categoryResult, ownerResult, financeCategoryResult] =
    await Promise.all([
      sbAdmin
        .from('product_categories')
        .select('id')
        .eq('id', categoryId)
        .eq('ws_id', wsId)
        .maybeSingle(),
      sbAdmin
        .from('inventory_owners')
        .select('id')
        .eq('id', ownerId)
        .eq('ws_id', wsId)
        .maybeSingle(),
      financeCategoryId
        ? sbAdmin
            .from('transaction_categories')
            .select('id')
            .eq('id', financeCategoryId)
            .eq('ws_id', wsId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (categoryResult.error || !categoryResult.data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid product category' },
        { status: 400 }
      ),
    };
  }

  if (ownerResult.error || !ownerResult.data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid inventory owner' },
        { status: 400 }
      ),
    };
  }

  if (
    financeCategoryId &&
    (financeCategoryResult.error || !financeCategoryResult.data)
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid finance transaction category' },
        { status: 400 }
      ),
    };
  }

  return { ok: true as const };
};

const resolveDefaultOwnerId = async ({
  sbAdmin,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) => {
  const { data, error } = await sbAdmin
    .from('inventory_owners')
    .select('id')
    .eq('ws_id', wsId)
    .eq('name', 'Unassigned')
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
};

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
  if (!(await isInventoryEnabled(wsId))) {
    return inventoryNotFoundResponse();
  }

  // Validate request body
  const parsed = ProductCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  // Check permissions
  const permissions = await getPermissions({ wsId: id, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (!canManageInventoryCatalog(permissions)) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create products' },
      { status: 403 }
    );
  }

  const { inventory, owner_id, ...data } = parsed.data;
  const resolvedOwnerId =
    owner_id ??
    (await resolveDefaultOwnerId({
      sbAdmin,
      wsId,
    }));
  if (!resolvedOwnerId) {
    return NextResponse.json(
      { message: 'Missing inventory owner configuration' },
      { status: 400 }
    );
  }
  const validatedRelations = await validateProductRelations({
    sbAdmin,
    wsId,
    categoryId: data.category_id,
    ownerId: resolvedOwnerId,
    financeCategoryId: data.finance_category_id,
  });
  if (!validatedRelations.ok) {
    return validatedRelations.response;
  }

  const workspaceUserId = await getWorkspaceUserId({
    supabase,
    sbAdmin,
    wsId,
  });

  const product = await sbAdmin
    .from('workspace_products')
    .insert({
      ...data,
      owner_id: resolvedOwnerId,
      ws_id: wsId,
    })
    .select('id, name, owner_id, finance_category_id, category_id')
    .single();

  if (product.error) {
    // TODO: logging
    console.log(product.error);
    return NextResponse.json(
      { message: 'Error creating product' },
      { status: 500 }
    );
  }

  // Only insert inventory if it exists and is an array
  if (inventory && Array.isArray(inventory) && inventory.length > 0) {
    if (!canAdjustInventoryStock(permissions)) {
      return NextResponse.json(
        { message: 'Insufficient permissions to update stock quantities' },
        { status: 403 }
      );
    }

    const { error } = await sbAdmin.from('inventory_products').insert(
      inventory.map((item) => ({
        ...item,
        product_id: product.data.id,
      }))
    );

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error creating inventory' },
        { status: 500 }
      );
    }

    if (workspaceUserId) {
      const stockChanges = inventory
        .map((item) => ({
          item,
          difference: getStockChangeAmount(null, item.amount),
        }))
        .filter(
          (
            entry
          ): entry is {
            item: (typeof inventory)[number];
            difference: number;
          } => entry.difference != null
        )
        .map(({ item, difference }) => ({
          product_id: product.data.id,
          unit_id: item.unit_id,
          warehouse_id: item.warehouse_id,
          amount: difference,
          creator_id: workspaceUserId,
        }));

      if (stockChanges.length > 0) {
        const { error: stockChangeError } = await sbAdmin
          .from('product_stock_changes')
          .insert(stockChanges);
        if (stockChangeError) {
          console.error('Error logging stock changes', stockChangeError);
        }
      }
    }
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'created',
    entityKind: 'product',
    entityId: product.data.id,
    entityLabel: product.data.name ?? data.name,
    summary: `Created product ${data.name}`,
    changedFields: [
      'name',
      'category_id',
      'owner_id',
      ...(data.finance_category_id ? ['finance_category_id'] : []),
      ...(inventory.length > 0 ? ['inventory'] : []),
    ],
    after: {
      ...data,
      inventory,
    },
    actor: {
      authUserId:
        (await resolveAuthenticatedSessionUser(supabase)).user?.id ?? null,
      workspaceUserId,
    },
  });

  return NextResponse.json({ message: 'success' });
}
