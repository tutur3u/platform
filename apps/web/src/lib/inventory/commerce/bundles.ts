import 'server-only';

import type {
  InventoryBundleComponent,
  InventoryBundlePayload,
  InventoryBundleStatus,
} from '@tuturuuu/internal-api/inventory';
import { getPlatformSql } from '@/lib/database/platform-sql';
import {
  type BundleComponentRow,
  type BundleRow,
  type ListQuery,
  mapBundle,
  mapComponent,
} from './mappers';

function normalizePagination(page?: number, pageSize?: number) {
  const limit = Math.max(1, Math.min(pageSize ?? 25, 100));
  const offset = (Math.max(1, page ?? 1) - 1) * limit;
  return { limit, offset };
}

function normalizeSearch(q?: string) {
  const value = q?.trim();
  return value ? `%${value}%` : null;
}

export class InvalidInventoryBundleComponentTargetError extends Error {
  constructor() {
    super('Invalid inventory bundle component target');
    this.name = 'InvalidInventoryBundleComponentTargetError';
  }
}

async function listBundleComponents(wsId: string, bundleIds: string[]) {
  if (bundleIds.length === 0) {
    return new Map<string, InventoryBundleComponent[]>();
  }

  const sql = getPlatformSql();
  const rows = await sql<BundleComponentRow[]>`
    select
      component.id,
      component.bundle_id,
      component.product_id,
      product.name as product_name,
      component.unit_id,
      unit.name as unit_name,
      component.warehouse_id,
      warehouse.name as warehouse_name,
      component.quantity::int as quantity
    from private.inventory_bundle_components component
    join public.workspace_products product
      on product.id = component.product_id
      and product.ws_id = ${wsId}
    join private.inventory_units unit
      on unit.id = component.unit_id
      and unit.ws_id = ${wsId}
    join private.inventory_warehouses warehouse
      on warehouse.id = component.warehouse_id
      and warehouse.ws_id = ${wsId}
    join private.inventory_products stock
      on stock.product_id = product.id
      and stock.unit_id = unit.id
      and stock.warehouse_id = warehouse.id
    where component.bundle_id = any(${bundleIds}::uuid[])
    order by product.name asc, component.created_at asc
  `;

  const grouped = new Map<string, InventoryBundleComponent[]>();
  for (const row of rows) {
    const current = grouped.get(row.bundle_id) ?? [];
    current.push(mapComponent(row));
    grouped.set(row.bundle_id, current);
  }
  return grouped;
}

export async function listBundles(
  wsId: string,
  query: ListQuery<InventoryBundleStatus> = {}
) {
  const sql = getPlatformSql();
  const { limit, offset } = normalizePagination(query.page, query.pageSize);
  const search = normalizeSearch(query.q);
  const status = query.status && query.status !== 'all' ? query.status : null;

  const rows = await sql<BundleRow[]>`
    select
      bundle.id,
      bundle.ws_id,
      bundle.storefront_id,
      bundle.slug,
      bundle.name,
      bundle.description,
      bundle.image_url,
      bundle.price,
      bundle.status,
      bundle.max_per_order,
      bundle.created_at::text as created_at,
      bundle.updated_at::text as updated_at,
      min(
        floor(
          greatest(
            case
              when stock.product_id is null then 0
              else coalesce(stock.amount, 0)
                - public._inventory_reserved_quantity(
                  component.product_id,
                  component.unit_id,
                  component.warehouse_id,
                  now()
                )
            end,
            0
            )
            / nullif(component.quantity, 0)
        )
      )::int as available_quantity
    from private.inventory_bundles bundle
    left join private.inventory_bundle_components component
      on component.bundle_id = bundle.id
    left join public.workspace_products product
      on product.id = component.product_id
      and product.ws_id = bundle.ws_id
    left join private.inventory_units unit
      on unit.id = component.unit_id
      and unit.ws_id = bundle.ws_id
    left join private.inventory_warehouses warehouse
      on warehouse.id = component.warehouse_id
      and warehouse.ws_id = bundle.ws_id
    left join private.inventory_products stock
      on stock.product_id = product.id
      and stock.unit_id = unit.id
      and stock.warehouse_id = warehouse.id
    where bundle.ws_id = ${wsId}
      and (${status}::text is null or bundle.status = ${status})
      and (
        ${search}::text is null
        or bundle.name ilike ${search}
        or bundle.slug ilike ${search}
      )
    group by bundle.id
    order by bundle.created_at desc
    limit ${limit}
    offset ${offset}
  `;

  const [countRow] = await sql<{ count: number }[]>`
    select count(*)::int as count
    from private.inventory_bundles bundle
    where bundle.ws_id = ${wsId}
      and (${status}::text is null or bundle.status = ${status})
      and (
        ${search}::text is null
        or bundle.name ilike ${search}
        or bundle.slug ilike ${search}
      )
  `;

  const components = await listBundleComponents(
    wsId,
    rows.map((row) => row.id)
  );
  return {
    count: countRow?.count ?? 0,
    data: rows.map((row) => mapBundle(row, components)),
  };
}

async function assertComponentTargets(
  wsId: string,
  components: InventoryBundlePayload['components']
) {
  if (!components?.length) {
    return;
  }

  const sql = getPlatformSql();

  for (const component of components) {
    const [row] = await sql<{ product_id: string }[]>`
      select stock.product_id
      from private.inventory_products stock
      join public.workspace_products product
        on product.id = stock.product_id
      join private.inventory_units unit
        on unit.id = stock.unit_id
      join private.inventory_warehouses warehouse
        on warehouse.id = stock.warehouse_id
      where product.ws_id = ${wsId}
        and unit.ws_id = ${wsId}
        and warehouse.ws_id = ${wsId}
        and stock.product_id = ${component.productId}
        and stock.unit_id = ${component.unitId}
        and stock.warehouse_id = ${component.warehouseId}
      limit 1
    `;

    if (!row) {
      throw new InvalidInventoryBundleComponentTargetError();
    }
  }
}

async function replaceComponents(
  wsId: string,
  bundleId: string,
  components: InventoryBundlePayload['components']
) {
  if (!components) {
    return;
  }

  const sql = getPlatformSql();
  await assertComponentTargets(wsId, components);

  await sql`
    delete from private.inventory_bundle_components
    where bundle_id = ${bundleId}
  `;

  if (components.length === 0) {
    return;
  }

  for (const component of components) {
    await sql`
      insert into private.inventory_bundle_components (
        bundle_id,
        product_id,
        unit_id,
        warehouse_id,
        quantity
      )
      values (
        ${bundleId},
        ${component.productId},
        ${component.unitId},
        ${component.warehouseId},
        ${component.quantity}
      )
    `;
  }
}

export async function createBundle(
  wsId: string,
  payload: InventoryBundlePayload
) {
  const sql = getPlatformSql();
  const [row] = await sql<BundleRow[]>`
    insert into private.inventory_bundles (
      ws_id,
      storefront_id,
      slug,
      name,
      description,
      image_url,
      price,
      status,
      max_per_order
    )
    values (
      ${wsId},
      ${payload.storefrontId ?? null},
      ${payload.slug},
      ${payload.name},
      ${payload.description ?? null},
      ${payload.imageUrl ?? null},
      ${payload.price},
      ${payload.status ?? 'draft'},
      ${payload.maxPerOrder ?? 99}
    )
    returning
      id,
      ws_id,
      storefront_id,
      slug,
      name,
      description,
      image_url,
      price,
      status,
      max_per_order,
      created_at::text as created_at,
      updated_at::text as updated_at,
      null::int as available_quantity
  `;

  if (!row) {
    throw new Error('Failed to create inventory bundle');
  }

  await replaceComponents(wsId, row.id, payload.components);
  const components = await listBundleComponents(wsId, [row.id]);
  return mapBundle(row, components);
}

export async function updateBundle(
  wsId: string,
  bundleId: string,
  payload: Partial<InventoryBundlePayload>
) {
  const sql = getPlatformSql();
  const [row] = await sql<BundleRow[]>`
    update private.inventory_bundles
    set
      storefront_id = ${payload.storefrontId ?? null},
      slug = coalesce(${payload.slug ?? null}, slug),
      name = coalesce(${payload.name ?? null}, name),
      description = ${payload.description ?? null},
      image_url = ${payload.imageUrl ?? null},
      price = coalesce(${payload.price ?? null}, price),
      status = coalesce(${payload.status ?? null}, status),
      max_per_order = coalesce(${payload.maxPerOrder ?? null}, max_per_order)
    where id = ${bundleId}
      and ws_id = ${wsId}
    returning
      id,
      ws_id,
      storefront_id,
      slug,
      name,
      description,
      image_url,
      price,
      status,
      max_per_order,
      created_at::text as created_at,
      updated_at::text as updated_at,
      null::int as available_quantity
  `;

  if (!row) {
    return null;
  }

  await replaceComponents(wsId, row.id, payload.components);
  const components = await listBundleComponents(wsId, [row.id]);
  return mapBundle(row, components);
}
