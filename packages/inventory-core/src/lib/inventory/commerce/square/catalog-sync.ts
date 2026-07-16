import 'server-only';

import { getWorkspaceDefaultCurrency } from '../../workspace-currency';
import {
  buildSquarePhysicalCountChanges,
  createSquareCatalogSyncSummary,
  decideSquareCatalogSync,
  describeSquareSyncError,
  hasSquareDeleteInstruction,
  type InventorySquareCatalogSyncSummary,
  inventoryPriceToSquareAmount,
  mergeSquareItemWithoutDeleting,
  resolveSquareWholeUnitPrice,
  resolveSquareWholeUnitStock,
  type SquareCatalogSyncDirection,
  squareSyncHash,
} from './catalog-sync-contract';
import {
  applySquareVariationToLocal,
  findOrCreateImportCategory,
  findOrCreatePrivateNamedRow,
  findReusableSquareImportProduct,
  loadLinks,
  loadLocalCatalog,
  loadLocalSnapshot,
  markSyncState,
  type SquareCatalogLinkRow,
  updateLinksForRemoteDeletion,
  upsertLink,
} from './catalog-sync-store';
import {
  batchChangeSquareInventoryApi,
  batchRetrieveSquareInventoryCountsApi,
  batchUpsertSquareCatalogApi,
  createSquareIdempotencyKey,
  retrieveSquareCatalogObjectApi,
  searchSquareCatalogApi,
} from './client';
import {
  getActiveConnection,
  getInventorySquareAccessContext,
} from './connection-store';
import { loadSettingsRow } from './settings-store';
import type { SquareCatalogObject, SquareEnvironment } from './types';
import { SQUARE_CATALOG_OAUTH_SCOPES } from './types';

export type { InventorySquareCatalogSyncSummary } from './catalog-sync-contract';

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function squareVariationHash(
  item: SquareCatalogObject,
  variation: SquareCatalogObject,
  amount: number | null
) {
  return squareSyncHash({
    amount,
    description: item.item_data?.description ?? null,
    itemName: item.item_data?.name ?? '',
    price: variation.item_variation_data?.price_money?.amount ?? 0,
    sku: variation.item_variation_data?.sku ?? '',
    variationName: variation.item_variation_data?.name ?? '',
  });
}

function localVariationHash({
  amount,
  description,
  name,
  price,
  sku,
  unitName,
}: {
  amount: number | null;
  description: string | null;
  name: string;
  price: number;
  sku: string;
  unitName: string;
}) {
  return squareSyncHash({
    amount,
    description,
    itemName: name,
    price,
    sku,
    variationName: unitName,
  });
}

async function fetchSquareCatalog({
  accessToken,
  environment,
}: {
  accessToken: string;
  environment: SquareEnvironment;
}) {
  const objects: SquareCatalogObject[] = [];
  let cursor: string | null = null;
  let latestTime: string | null = null;
  do {
    const page = await searchSquareCatalogApi({
      accessToken,
      cursor,
      environment,
    });
    objects.push(...(page.objects ?? []));
    cursor = page.cursor ?? null;
    latestTime = page.latest_time ?? latestTime;
  } while (cursor);
  return { latestTime, objects };
}

async function fetchSquareCounts({
  accessToken,
  environment,
  locationId,
  variationIds,
}: {
  accessToken: string;
  environment: SquareEnvironment;
  locationId: string;
  variationIds: string[];
}) {
  const counts = new Map<string, number>();
  for (const group of chunks(variationIds, 100)) {
    let cursor: string | null = null;
    do {
      const page = await batchRetrieveSquareInventoryCountsApi({
        accessToken,
        catalogObjectIds: group,
        cursor,
        environment,
        locationIds: [locationId],
      });
      for (const count of page.counts ?? []) {
        if (
          count.catalog_object_id &&
          count.location_id === locationId &&
          count.state === 'IN_STOCK'
        ) {
          const amount = Number(count.quantity ?? 0);
          if (Number.isFinite(amount)) {
            counts.set(count.catalog_object_id, amount);
          }
        }
      }
      cursor = page.cursor ?? null;
    } while (cursor);
  }
  return counts;
}

async function pullFromSquare({
  accessToken,
  currency,
  direction,
  environment,
  locationId,
  locationName,
  summary,
  wsId,
}: {
  accessToken: string;
  currency: string;
  direction: SquareCatalogSyncDirection;
  environment: SquareEnvironment;
  locationId: string;
  locationName: string;
  summary: InventorySquareCatalogSyncSummary;
  wsId: string;
}) {
  const { latestTime, objects } = await fetchSquareCatalog({
    accessToken,
    environment,
  });
  const links = await loadLinks(wsId, environment);
  const linksByVariation = new Map(
    links.map((link) => [link.square_variation_id, link])
  );
  const linksByItem = new Map<string, SquareCatalogLinkRow[]>();
  for (const link of links) {
    linksByItem.set(link.square_item_id, [
      ...(linksByItem.get(link.square_item_id) ?? []),
      link,
    ]);
  }
  const variationIds = objects.flatMap((item) =>
    (item.item_data?.variations ?? []).flatMap((variation) =>
      variation.id && !variation.is_deleted ? [variation.id] : []
    )
  );
  const counts = await fetchSquareCounts({
    accessToken,
    environment,
    locationId,
    variationIds,
  });
  const [categoryId, ownerId, warehouseId] = await Promise.all([
    findOrCreateImportCategory(wsId),
    findOrCreatePrivateNamedRow({
      name: 'Unassigned',
      table: 'inventory_owners',
      wsId,
    }),
    findOrCreatePrivateNamedRow({
      name: locationName || `Square ${environment}`,
      table: 'inventory_warehouses',
      wsId,
    }),
  ]);

  for (const item of objects) {
    if (!item.id) continue;
    if (item.is_deleted) {
      if ((linksByItem.get(item.id) ?? []).length > 0) {
        await updateLinksForRemoteDeletion({
          environment,
          squareItemId: item.id,
          wsId,
        });
        summary.preservedRemoteDeletions += 1;
      }
      continue;
    }

    const itemLinks = linksByItem.get(item.id) ?? [];
    let productId =
      itemLinks[0]?.product_id ??
      (await findReusableSquareImportProduct({
        categoryId,
        name: item.item_data?.name || 'Square item',
        ownerId,
        wsId,
      })) ??
      undefined;
    const productExistedBeforeSync = Boolean(productId);
    let importedItem = false;
    const variations = item.item_data?.variations ?? [];
    const variationNameCounts = new Map<string, number>();
    for (const variation of variations) {
      const name = variation.item_variation_data?.name || 'Default';
      variationNameCounts.set(name, (variationNameCounts.get(name) ?? 0) + 1);
    }
    for (const variation of variations) {
      if (!variation.id) continue;
      if (variation.is_deleted) {
        if (linksByVariation.has(variation.id)) {
          await updateLinksForRemoteDeletion({
            environment,
            squareItemId: item.id,
            squareVariationId: variation.id,
            wsId,
          });
          summary.preservedRemoteDeletions += 1;
        }
        continue;
      }

      const link = linksByVariation.get(variation.id);
      const remoteAmount = counts.get(variation.id) ?? 0;
      const priceCurrency =
        variation.item_variation_data?.price_money?.currency ?? currency;
      const squareHash = squareVariationHash(item, variation, remoteAmount);
      const local = link ? await loadLocalSnapshot(link) : null;
      const stock = resolveSquareWholeUnitStock({
        currentAmount: local?.stock.amount ?? null,
        remoteAmount,
      });
      const price = resolveSquareWholeUnitPrice({
        currency: priceCurrency,
        currentPrice: local?.stock.price ?? null,
        remoteAmountMinor:
          variation.item_variation_data?.price_money?.amount ?? 0,
      });
      const syncError = [stock.error, price.error]
        .filter((message): message is string => Boolean(message))
        .join(' ');
      const sku = variation.item_variation_data?.sku ?? '';
      const rawVariationName = variation.item_variation_data?.name || 'Default';
      const variationName =
        (variationNameCounts.get(rawVariationName) ?? 0) > 1
          ? `${rawVariationName} · ${sku || variation.id.slice(-6)}`
          : rawVariationName;
      const currentLocalHash = local
        ? localVariationHash({
            amount: local.stock.amount,
            description: local.product.description,
            name: local.product.name,
            price: local.stock.price,
            sku: link?.square_sku ?? sku,
            unitName: local.unit.name,
          })
        : '';
      const decision = link
        ? decideSquareCatalogSync({
            currentLocalHash,
            currentSquareHash: squareHash,
            direction,
            previousLocalHash: link.local_hash,
            previousSquareHash: link.square_hash,
          })
        : 'pull';

      if (decision === 'conflict' && link) {
        await upsertLink({
          ...link,
          last_error: 'Both Square and Tuturuuu changed since the last sync.',
          status: 'conflict',
        });
        summary.conflicts += 1;
        continue;
      }
      if (decision === 'push' || decision === 'noop') {
        summary.skipped += 1;
        continue;
      }

      const unitId =
        link?.unit_id ??
        (await findOrCreatePrivateNamedRow({
          name: variationName,
          table: 'inventory_units',
          wsId,
        }));
      const syncedProductId = await applySquareVariationToLocal({
        amount: stock.amount,
        categoryId,
        item,
        link,
        ownerId,
        price: price.price,
        productId,
        unitId,
        warehouseId: link?.warehouse_id ?? warehouseId,
        wsId,
      });
      productId = syncedProductId;
      const localHash = localVariationHash({
        amount: stock.amount,
        description: item.item_data?.description ?? null,
        name: item.item_data?.name || 'Square item',
        price: price.price,
        sku,
        unitName: variationName,
      });
      await upsertLink({
        environment,
        last_error: syncError || null,
        local_hash: localHash,
        product_id: syncedProductId,
        square_hash: squareHash,
        square_item_id: item.id,
        square_item_name: item.item_data?.name ?? null,
        square_item_version: item.version ?? null,
        square_sku: sku || null,
        square_variation_id: variation.id,
        square_variation_name: variationName,
        square_variation_version: variation.version ?? null,
        status: syncError ? 'error' : 'active',
        sync_origin: link?.sync_origin ?? 'square',
        unit_id: unitId,
        warehouse_id: link?.warehouse_id ?? warehouseId,
        ws_id: wsId,
      });
      summary.variationsPulled += 1;
      if (!stock.error) {
        summary.inventoryPulled += 1;
      }
      if (syncError) summary.conflicts += 1;
      importedItem = true;
    }
    if (importedItem) {
      summary.itemsPulled += 1;
      if (!productExistedBeforeSync) summary.itemsCreated += 1;
    }
  }

  return latestTime;
}

function resolveSquareId(
  mappings: Array<{ client_object_id?: string; object_id?: string }>,
  value: string
) {
  return (
    mappings.find((mapping) => mapping.client_object_id === value)?.object_id ??
    value
  );
}

async function pushToSquare({
  accessToken,
  currency,
  environment,
  locationId,
  summary,
  wsId,
}: {
  accessToken: string;
  currency: string;
  environment: SquareEnvironment;
  locationId: string;
  summary: InventorySquareCatalogSyncSummary;
  wsId: string;
}) {
  const { products, stocks, units, warehouses } = await loadLocalCatalog(wsId);
  const links = await loadLinks(wsId, environment);
  const linksByCoordinate = new Map(
    links.map((link) => [
      `${link.product_id}:${link.unit_id}:${link.warehouse_id}`,
      link,
    ])
  );
  const unitById = new Map(units.map((unit) => [unit.id, unit.name]));
  const warehouseById = new Map(
    warehouses.map((warehouse) => [warehouse.id, warehouse.name])
  );
  const physicalCounts: Array<{
    amount: number | null;
    referenceId: string;
    squareVariationId: string;
  }> = [];

  for (const product of products) {
    const productStocks = stocks.filter(
      (stock) => stock.product_id === product.id
    );
    if (productStocks.length === 0) {
      summary.skipped += 1;
      continue;
    }
    const unitOccurrences = new Map<string, number>();
    for (const stock of productStocks) {
      unitOccurrences.set(
        stock.unit_id,
        (unitOccurrences.get(stock.unit_id) ?? 0) + 1
      );
    }
    const eligible = productStocks.flatMap((stock) => {
      const link = linksByCoordinate.get(
        `${stock.product_id}:${stock.unit_id}:${stock.warehouse_id}`
      );
      if (link?.status === 'conflict' || link?.status === 'remote_deleted') {
        summary.skipped += 1;
        return [];
      }
      const baseUnitName = unitById.get(stock.unit_id) ?? 'Default';
      const unitName =
        link?.square_variation_name ||
        ((unitOccurrences.get(stock.unit_id) ?? 0) > 1
          ? `${baseUnitName} · ${warehouseById.get(stock.warehouse_id) ?? stock.warehouse_id.slice(0, 8)}`
          : baseUnitName);
      const sku =
        link?.square_sku ??
        `TTR-${product.id.slice(0, 8)}-${stock.unit_id.slice(0, 8)}-${stock.warehouse_id.slice(0, 8)}`.toUpperCase();
      return [
        {
          link,
          localHash: localVariationHash({
            amount: stock.amount,
            description: product.description,
            name: product.name,
            price: stock.price,
            sku,
            unitName: baseUnitName,
          }),
          sku,
          stock,
          unitName,
        },
      ];
    });
    if (eligible.length === 0) continue;

    const existingItemId = eligible.find((entry) => entry.link)?.link
      ?.square_item_id;
    const itemId = existingItemId ?? `#item-${product.id.replaceAll('-', '')}`;
    const remoteItem = existingItemId
      ? await retrieveSquareCatalogObjectApi({
          accessToken,
          environment,
          objectId: existingItemId,
        })
      : null;
    const item = mergeSquareItemWithoutDeleting({
      currency,
      description: product.description,
      itemId,
      itemVersion:
        remoteItem?.version ?? eligible[0]?.link?.square_item_version,
      name: product.name,
      remoteItem,
      variations: eligible.map(({ link, localHash, sku, stock, unitName }) => ({
        amount: stock.amount,
        localHash,
        priceMajor: stock.price,
        sku,
        squareVariationId: link?.square_variation_id,
        squareVariationVersion: link?.square_variation_version,
        tempId: `#variation-${product.id.replaceAll('-', '')}-${stock.unit_id.replaceAll('-', '')}-${stock.warehouse_id.replaceAll('-', '')}`,
        unitName,
      })),
    });
    if (hasSquareDeleteInstruction(item)) {
      throw new Error('Square sync refused a destructive catalog payload');
    }
    const response = await batchUpsertSquareCatalogApi({
      accessToken,
      environment,
      idempotencyKey: createSquareIdempotencyKey(
        `catalog-${product.id.slice(0, 8)}`
      ),
      objects: [item],
    });
    const mappings = response.id_mappings ?? [];
    const actualItemId = resolveSquareId(mappings, itemId);
    const returnedItem = (response.catalog_objects ?? []).find(
      (object) => object.id === actualItemId
    );

    for (const entry of eligible) {
      const tempId = `#variation-${product.id.replaceAll('-', '')}-${entry.stock.unit_id.replaceAll('-', '')}-${entry.stock.warehouse_id.replaceAll('-', '')}`;
      const actualVariationId =
        entry.link?.square_variation_id ?? resolveSquareId(mappings, tempId);
      const returnedVariation = returnedItem?.item_data?.variations?.find(
        (variation) => variation.id === actualVariationId
      );
      const squareCurrency =
        returnedVariation?.item_variation_data?.price_money?.currency ??
        currency;
      const squareHash = squareSyncHash({
        amount: entry.stock.amount,
        description: product.description,
        itemName: product.name,
        price:
          returnedVariation?.item_variation_data?.price_money?.amount ??
          inventoryPriceToSquareAmount(entry.stock.price, squareCurrency),
        sku: entry.sku,
        variationName: entry.unitName,
      });
      await upsertLink({
        environment,
        local_hash: entry.localHash,
        product_id: product.id,
        square_hash: squareHash,
        square_item_id: actualItemId,
        square_item_name: product.name,
        square_item_version: returnedItem?.version ?? item.version ?? null,
        square_sku: entry.sku,
        square_variation_id: actualVariationId,
        square_variation_name: entry.unitName,
        square_variation_version:
          returnedVariation?.version ??
          entry.link?.square_variation_version ??
          null,
        status: 'active',
        sync_origin: entry.link?.sync_origin ?? 'tuturuuu',
        unit_id: entry.stock.unit_id,
        warehouse_id: entry.stock.warehouse_id,
        ws_id: wsId,
      });
      physicalCounts.push({
        amount: entry.stock.amount,
        referenceId: `${product.id}:${entry.stock.unit_id}:${entry.stock.warehouse_id}`,
        squareVariationId: actualVariationId,
      });
      summary.variationsPushed += 1;
    }
    summary.itemsPushed += 1;
  }

  const occurredAt = new Date().toISOString();
  for (const group of chunks(
    buildSquarePhysicalCountChanges({
      locationId,
      occurredAt,
      variations: physicalCounts,
    }),
    100
  )) {
    if (group.length === 0) continue;
    if (hasSquareDeleteInstruction(group)) {
      throw new Error('Square sync refused a destructive inventory payload');
    }
    const response = await batchChangeSquareInventoryApi({
      accessToken,
      changes: group,
      environment,
      idempotencyKey: createSquareIdempotencyKey('inventory-sync'),
    });
    summary.inventoryPushed += response.counts?.length ?? group.length;
  }
}

export async function syncInventorySquareCatalog({
  direction,
  userId,
  wsId,
}: {
  direction: SquareCatalogSyncDirection;
  userId?: string | null;
  wsId: string;
}) {
  const [context, settings, currency] = await Promise.all([
    getInventorySquareAccessContext(wsId),
    loadSettingsRow(wsId),
    getWorkspaceDefaultCurrency(wsId),
  ]);
  if (!settings.location_id) {
    throw new Error('Select a Square location before syncing the catalog');
  }
  const connection = await getActiveConnection(wsId, context.environment);
  if (connection?.auth_method === 'oauth') {
    const scopes = new Set(connection.scopes ?? []);
    const missingScopes = SQUARE_CATALOG_OAUTH_SCOPES.filter(
      (scope) => !scopes.has(scope)
    );
    if (missingScopes.length > 0) {
      throw new Error(
        `Reconnect Square to grant catalog sync access: ${missingScopes.join(', ')}`
      );
    }
  }
  const summary = createSquareCatalogSyncSummary(
    direction,
    context.environment
  );
  await markSyncState({
    direction,
    environment: context.environment,
    status: 'running',
    summary,
    userId,
    wsId,
  });

  try {
    let latestTime: string | null = null;
    if (direction === 'from_square' || direction === 'bidirectional') {
      latestTime = await pullFromSquare({
        accessToken: context.accessToken,
        currency,
        direction,
        environment: context.environment,
        locationId: settings.location_id,
        locationName: settings.location_name ?? '',
        summary,
        wsId,
      });
    }
    if (direction === 'to_square' || direction === 'bidirectional') {
      await pushToSquare({
        accessToken: context.accessToken,
        currency,
        environment: context.environment,
        locationId: settings.location_id,
        summary,
        wsId,
      });
    }
    await markSyncState({
      direction,
      environment: context.environment,
      latestTime,
      status: summary.conflicts > 0 ? 'partial' : 'success',
      summary,
      userId,
      wsId,
    });
    return summary;
  } catch (error) {
    await markSyncState({
      direction,
      environment: context.environment,
      errorMessage: describeSquareSyncError(error),
      status: 'error',
      summary,
      userId,
      wsId,
    });
    throw error;
  }
}
