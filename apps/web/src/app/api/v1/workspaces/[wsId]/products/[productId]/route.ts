import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { RawInventoryProductWithChanges } from '@tuturuuu/types/primitives/InventoryProductRelations';
import type { Product2 } from '@tuturuuu/types/primitives/Product';
import type { ProductInventory } from '@tuturuuu/types/primitives/ProductInventory';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getInventoryActorContext } from '@/lib/inventory/actor';
import {
  createInventoryAuditLog,
  diffInventoryAuditFields,
} from '@/lib/inventory/audit';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { resolveProductManufacturerId } from '@/lib/inventory/manufacturers';
import {
  canAdjustInventoryStock,
  canManageInventoryCatalog,
  canViewInventoryCatalog,
  canViewInventoryStock,
} from '@/lib/inventory/permissions';
import { getInventoryCatalogProducts } from '@/lib/inventory/product-rpc';
import { validateInventoryItemWorkspaceRelations } from '@/lib/inventory/relation-validation';

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
  const inventory = sbAdmin.schema('private');

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
    const { data, error } = await inventory
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
  const auth = await authorizeInventoryWorkspace(req, id, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId } = auth.value;
  const sbAdmin = await createAdminClient();

  if (!canViewInventoryCatalog(permissions)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const canViewStockQuantity = canViewInventoryStock(permissions);

  let item: RawInventoryProductWithChanges | null = null;
  try {
    const result = await getInventoryCatalogProducts({
      includeStock: canViewStockQuantity,
      limit: 1,
      productId,
      sbAdmin,
      status: 'all',
      wsId,
    });
    item = result.data[0] ?? null;
  } catch (error) {
    serverLogger.error('Error fetching product:', error);
    return NextResponse.json(
      { message: 'Error fetching product' },
      { status: 500 }
    );
  }

  if (!item) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const product = item as RawInventoryProductWithChanges & {
    archived?: boolean;
    inventory_manufacturers?: { id: string; name: string | null } | null;
    manufacturer_id?: string | null;
  };

  const formattedProduct = {
    archived: product.archived ?? false,
    avatar_url: item.avatar_url,
    id: item.id,
    name: item.name,
    manufacturer_id: product.manufacturer_id ?? null,
    manufacturer: product.inventory_manufacturers?.name ?? null,
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
  const auth = await authorizeInventoryWorkspace(req, id, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId } = auth.value;
  const sbAdmin = await createAdminClient();
  const inventoryClient = sbAdmin.schema('private');

  if (!canManageInventoryCatalog(permissions)) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update products' },
      { status: 403 }
    );
  }

  const canUpdateStockQuantity = canAdjustInventoryStock(permissions);
  const { inventory, manufacturer, manufacturer_id, ...data } =
    (await req.json()) as Product2 & {
      inventory?: ProductInventory[];
      manufacturer_id?: string | null;
      manufacturer?: string | null;
    };
  const resolvedManufacturer = await resolveProductManufacturerId({
    sbAdmin,
    wsId,
    manufacturerId: manufacturer_id,
    legacyManufacturerName: manufacturer,
  });
  if (!resolvedManufacturer.ok) {
    return NextResponse.json(
      { message: resolvedManufacturer.message },
      { status: 400 }
    );
  }
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

  if (inventory && Array.isArray(inventory)) {
    if (!canUpdateStockQuantity) {
      return NextResponse.json(
        { message: 'Insufficient permissions to update stock quantities' },
        { status: 403 }
      );
    }

    const inventoryRelations = await validateInventoryItemWorkspaceRelations({
      inventory,
      inventoryClient,
      wsId,
    });
    if (!inventoryRelations.ok) {
      if (inventoryRelations.status === 500) {
        serverLogger.error(
          inventoryRelations.message,
          inventoryRelations.error
        );
      }
      return NextResponse.json(
        { message: inventoryRelations.message },
        { status: inventoryRelations.status }
      );
    }
  }

  const { data: existingProduct, error: existingProductError } = await sbAdmin
    .from('workspace_products')
    .select(
      'id, name, avatar_url, category_id, owner_id, finance_category_id, manufacturer_id, description, usage'
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
  const updateData = {
    ...data,
    ...(resolvedManufacturer.manufacturerId !== undefined
      ? { manufacturer_id: resolvedManufacturer.manufacturerId }
      : {}),
  };
  const product = await sbAdmin
    .from('workspace_products')
    .update(updateData)
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (product.error) {
    serverLogger.error('Error updating product', product.error);
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
    // First, delete existing inventory for this product
    const { error: deleteError } = await inventoryClient
      .from('inventory_products')
      .delete()
      .eq('product_id', productId);

    if (deleteError) {
      serverLogger.error(
        'Error deleting existing product inventory',
        deleteError
      );
      return NextResponse.json(
        { message: 'Error updating inventory' },
        { status: 500 }
      );
    }

    // Then insert the new inventory
    const { error: insertError } = await inventoryClient
      .from('inventory_products')
      .insert(
        inventory.map((item) => ({
          ...item,
          product_id: productId,
        }))
      );

    if (insertError) {
      serverLogger.error('Error inserting product inventory', insertError);
      return NextResponse.json(
        { message: 'Error updating inventory' },
        { status: 500 }
      );
    }
  }

  const actor = await getInventoryActorContext(req, wsId);
  const before = {
    name: existingProduct.name,
    avatar_url: existingProduct.avatar_url,
    manufacturer_id: existingProduct.manufacturer_id,
    description: existingProduct.description,
    usage: existingProduct.usage,
    category_id: existingProduct.category_id,
    owner_id: existingProduct.owner_id,
    finance_category_id: existingProduct.finance_category_id,
  };
  const after = {
    name: data.name ?? existingProduct.name,
    avatar_url:
      data.avatar_url === undefined
        ? existingProduct.avatar_url
        : data.avatar_url,
    manufacturer_id:
      resolvedManufacturer.manufacturerId === undefined
        ? existingProduct.manufacturer_id
        : resolvedManufacturer.manufacturerId,
    description: data.description ?? existingProduct.description,
    usage: data.usage ?? existingProduct.usage,
    category_id: data.category_id ?? existingProduct.category_id,
    owner_id: data.owner_id ?? existingProduct.owner_id,
    finance_category_id:
      data.finance_category_id === undefined
        ? existingProduct.finance_category_id
        : data.finance_category_id,
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
  const auth = await authorizeInventoryWorkspace(req, id, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId } = auth.value;
  const sbAdmin = await createAdminClient();

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
    serverLogger.error('Error fetching product for deletion:', productError);
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
    serverLogger.error('Error deleting workspace product', error);
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
