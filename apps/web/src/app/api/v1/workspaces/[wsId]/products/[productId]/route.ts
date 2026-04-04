import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { RawInventoryProductWithChanges } from '@tuturuuu/types/primitives/InventoryProductRelations';
import type { Product2 } from '@tuturuuu/types/primitives/Product';
import type { ProductInventory } from '@tuturuuu/types/primitives/ProductInventory';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
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
  canAdjustInventoryStock,
  canManageInventoryCatalog,
  canViewInventoryCatalog,
  canViewInventoryStock,
} from '@/lib/inventory/permissions';

const RouteParamsSchema = z.object({
  wsId: z.string().max(MAX_NAME_LENGTH).min(1),
  productId: z.string().max(MAX_NAME_LENGTH).min(1),
});

interface Params {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

const validateProductRelations = async ({
  sbAdmin,
  wsId,
  categoryId,
  ownerId,
  financeCategoryId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  categoryId?: string | null;
  ownerId?: string | null;
  financeCategoryId?: string | null;
}) => {
  if (categoryId) {
    const { data, error } = await sbAdmin
      .from('product_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error || !data) {
      return 'Invalid product category';
    }
  }

  if (ownerId) {
    const { data, error } = await sbAdmin
      .from('inventory_owners')
      .select('id')
      .eq('id', ownerId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error || !data) {
      return 'Invalid inventory owner';
    }
  }

  if (financeCategoryId) {
    const { data, error } = await sbAdmin
      .from('transaction_categories')
      .select('id')
      .eq('id', financeCategoryId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error || !data) {
      return 'Invalid finance transaction category';
    }
  }

  return null;
};

export async function GET(req: Request, { params }: Params) {
  const parsedParams = RouteParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route parameters' },
      { status: 400 }
    );
  }

  const { wsId: id, productId } = parsedParams.data;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();

  // Resolve workspace ID
  const wsId = await normalizeWorkspaceId(id, supabase);

  // Check permissions
  const permissions = await getPermissions({ wsId: id, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (!canViewInventoryCatalog(permissions)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const canViewStockQuantity = canViewInventoryStock(permissions);

  const selectFields = canViewStockQuantity
    ? '*, product_categories(name), inventory_owners(id, name, avatar_url, linked_workspace_user_id), transaction_categories(id, name, color, icon), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, unit_id, warehouse_id, created_at, inventory_warehouses!inventory_products_warehouse_id_fkey(id, name), inventory_units!inventory_products_unit_id_fkey(id, name)), product_stock_changes!product_stock_changes_product_id_fkey(amount, created_at, beneficiary:workspace_users!product_stock_changes_beneficiary_id_fkey(full_name, email), creator:workspace_users!product_stock_changes_creator_id_fkey(full_name, email), warehouse:inventory_warehouses!product_stock_changes_warehouse_id_fkey(id, name))'
    : '*, product_categories(name), inventory_owners(id, name, avatar_url, linked_workspace_user_id), transaction_categories(id, name, color, icon)';

  const { data, error } = await sbAdmin
    .from('workspace_products')
    .select(selectFields)
    .eq('ws_id', wsId)
    .eq('id', productId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { message: 'Error fetching product' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const item = data as unknown as RawInventoryProductWithChanges;
  const product = item as RawInventoryProductWithChanges & {
    archived?: boolean;
  };

  const formattedProduct = {
    archived: product.archived ?? false,
    id: item.id,
    name: item.name,
    manufacturer: item.manufacturer,
    description: item.description,
    usage: item.usage,
    unit: canViewStockQuantity
      ? item.inventory_products?.[0]?.inventory_units?.name
      : null,
    stock: canViewStockQuantity
      ? (item.inventory_products || []).map((inventory) => ({
          amount: inventory.amount,
          min_amount: inventory.min_amount,
          unit: inventory.inventory_units?.name,
          warehouse: inventory.inventory_warehouses?.name,
          price: inventory.price,
        }))
      : [],
    // Inventory with ids for editing
    inventory: canViewStockQuantity
      ? (item.inventory_products || []).map((inventory) => ({
          unit_id: inventory.unit_id,
          warehouse_id: inventory.warehouse_id,
          amount: inventory.amount,
          min_amount: inventory.min_amount,
          price: inventory.price,
        }))
      : [],
    min_amount: canViewStockQuantity
      ? item.inventory_products?.[0]?.min_amount || 0
      : 0,
    warehouse: canViewStockQuantity
      ? item.inventory_products?.[0]?.inventory_warehouses?.name
      : null,
    category: item.product_categories?.name,
    category_id: item.category_id,
    owner_id: item.owner_id,
    owner: item.inventory_owners
      ? {
          id: item.inventory_owners.id,
          name: item.inventory_owners.name,
          avatar_url: item.inventory_owners.avatar_url,
          linked_workspace_user_id:
            item.inventory_owners.linked_workspace_user_id,
        }
      : null,
    finance_category_id: item.finance_category_id,
    finance_category: item.transaction_categories
      ? {
          id: item.transaction_categories.id,
          name: item.transaction_categories.name,
          color: item.transaction_categories.color,
          icon: item.transaction_categories.icon,
        }
      : null,
    ws_id: item.ws_id,
    created_at: item.created_at,
    stock_changes: canViewStockQuantity
      ? item.product_stock_changes?.map((change) => ({
          amount: change.amount,
          creator: change.creator,
          beneficiary: change.beneficiary,
          warehouse: change.warehouse,
          created_at: change.created_at,
        })) || []
      : [],
  };

  return NextResponse.json(formattedProduct);
}

export async function PATCH(req: Request, { params }: Params) {
  const parsedParams = RouteParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route parameters' },
      { status: 400 }
    );
  }

  const { wsId: id, productId } = parsedParams.data;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);

  // Check permissions
  const permissions = await getPermissions({ wsId: id, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (!canManageInventoryCatalog(permissions)) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update products' },
      { status: 403 }
    );
  }

  const canUpdateStockQuantity = canAdjustInventoryStock(permissions);
  const { inventory, ...data } = (await req.json()) as Product2 & {
    inventory?: ProductInventory[];
  };
  const relationError = await validateProductRelations({
    sbAdmin,
    wsId,
    categoryId: data.category_id,
    ownerId: data.owner_id,
    financeCategoryId: data.finance_category_id,
  });
  if (relationError) {
    return NextResponse.json({ message: relationError }, { status: 400 });
  }

  const { data: existingProduct, error: existingProductError } = await sbAdmin
    .from('workspace_products')
    .select(
      'id, name, category_id, owner_id, finance_category_id, manufacturer, description, usage'
    )
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingProductError) {
    return NextResponse.json(
      { message: 'Error loading product for update' },
      { status: 500 }
    );
  }

  if (!existingProduct) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  // Update product details
  const product = await sbAdmin
    .from('workspace_products')
    .update({
      ...data,
    })
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (product.error) {
    console.log(product.error);
    return NextResponse.json(
      { message: 'Error updating product' },
      { status: 500 }
    );
  }

  if (!product.data) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  // Update inventory if provided
  if (inventory && Array.isArray(inventory)) {
    if (!canUpdateStockQuantity) {
      return NextResponse.json(
        { message: 'Insufficient permissions to update stock quantities' },
        { status: 403 }
      );
    }
    // First, delete existing inventory for this product
    const { error: deleteError } = await sbAdmin
      .from('inventory_products')
      .delete()
      .eq('product_id', productId);

    if (deleteError) {
      console.log(deleteError);
      return NextResponse.json(
        { message: 'Error updating inventory' },
        { status: 500 }
      );
    }

    // Then insert the new inventory
    const { error: insertError } = await sbAdmin
      .from('inventory_products')
      .insert(
        inventory.map((item) => ({
          ...item,
          product_id: productId,
        }))
      );

    if (insertError) {
      console.log(insertError);
      return NextResponse.json(
        { message: 'Error updating inventory' },
        { status: 500 }
      );
    }
  }

  const actor = await getInventoryActorContext(req, wsId);
  const before = {
    name: existingProduct.name,
    manufacturer: existingProduct.manufacturer,
    description: existingProduct.description,
    usage: existingProduct.usage,
    category_id: existingProduct.category_id,
    owner_id: existingProduct.owner_id,
    finance_category_id: existingProduct.finance_category_id,
  };
  const after = {
    name: data.name,
    manufacturer: data.manufacturer,
    description: data.description,
    usage: data.usage,
    category_id: data.category_id,
    owner_id: data.owner_id,
    finance_category_id: data.finance_category_id ?? null,
    ...(inventory ? { inventory } : {}),
  };
  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'updated',
    entityKind: 'product',
    entityId: productId,
    entityLabel: data.name ?? existingProduct.name,
    summary: `Updated product ${data.name ?? existingProduct.name ?? productId}`,
    changedFields: diffInventoryAuditFields(before, after),
    before,
    after,
    actor,
  });

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const parsedParams = RouteParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route parameters' },
      { status: 400 }
    );
  }

  const { wsId: id, productId } = parsedParams.data;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);

  const permissions = await getPermissions({ wsId: id, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canManageInventoryCatalog(permissions)) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete products' },
      { status: 403 }
    );
  }

  const { data: product, error: productError } = await sbAdmin
    .from('workspace_products')
    .select('id, ws_id, name')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (productError) {
    console.error('Error fetching product for deletion:', productError);
    return NextResponse.json(
      { message: 'Error deleting workspace product' },
      { status: 500 }
    );
  }

  if (!product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const { data: deletedProduct, error } = await sbAdmin
    .from('workspace_products')
    .delete()
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace product' },
      { status: 500 }
    );
  }

  if (!deletedProduct) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const actor = await getInventoryActorContext(req, wsId);
  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'deleted',
    entityKind: 'product',
    entityId: productId,
    entityLabel: product.name ?? productId,
    summary: `Deleted product ${product.name ?? productId}`,
    actor,
  });

  return NextResponse.json({ message: 'success' });
}
