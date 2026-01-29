import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStockChangeAmount } from '@/lib/inventory/stock-change';

const InventoryItemSchema = z.object({
  unit_id: z.uuid(),
  warehouse_id: z.uuid(),
  amount: z.number().nonnegative().nullable(),
  min_amount: z.number().nonnegative(),
  price: z.number().nonnegative(),
});

export const ProductCreateSchema = z.object({
  name: z.string().min(1).max(255),
  manufacturer: z.string().optional(),
  description: z.string().optional(),
  usage: z.string().optional(),
  category_id: z.uuid(),
  inventory: z.array(InventoryItemSchema).default([]),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const getWorkspaceUserId = async (
  supabase: TypedSupabaseClient,
  wsId: string
) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: workspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', wsId)
    .single();

  return workspaceUser?.virtual_user_id ?? null;
};

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  // Validate request body
  const parsed = ProductCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  // Check permissions
  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create products' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const { inventory, ...data } = parsed.data;

  const product = await supabase
    .from('workspace_products')
    .insert({
      ...data,
      ws_id: wsId,
    })
    .select('id')
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
    if (withoutPermission('update_stock_quantity')) {
      return NextResponse.json(
        { message: 'Insufficient permissions to update stock quantities' },
        { status: 403 }
      );
    }

    const { error } = await supabase.from('inventory_products').insert(
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

    const workspaceUserId = await getWorkspaceUserId(supabase, wsId);
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
        await supabase.from('product_stock_changes').insert(stockChanges);
      }
    }
  }

  return NextResponse.json({ message: 'success' });
}
