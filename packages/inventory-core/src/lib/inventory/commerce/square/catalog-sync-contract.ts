import { createHash } from 'node:crypto';
import { majorToMinor, minorToMajor } from '@tuturuuu/utils/money';
import type { SquareCatalogObject, SquareEnvironment } from './types';

export type SquareCatalogSyncDirection =
  | 'bidirectional'
  | 'from_square'
  | 'to_square';

export type SquareCatalogSyncDecision = 'conflict' | 'noop' | 'pull' | 'push';

export type InventorySquareCatalogSyncSummary = {
  conflicts: number;
  direction: SquareCatalogSyncDirection;
  environment: SquareEnvironment;
  inventoryPulled: number;
  inventoryPushed: number;
  itemsCreated: number;
  itemsPulled: number;
  itemsPushed: number;
  preservedRemoteDeletions: number;
  skipped: number;
  variationsPulled: number;
  variationsPushed: number;
};

export function createSquareCatalogSyncSummary(
  direction: SquareCatalogSyncDirection,
  environment: SquareEnvironment
): InventorySquareCatalogSyncSummary {
  return {
    conflicts: 0,
    direction,
    environment,
    inventoryPulled: 0,
    inventoryPushed: 0,
    itemsCreated: 0,
    itemsPulled: 0,
    itemsPushed: 0,
    preservedRemoteDeletions: 0,
    skipped: 0,
    variationsPulled: 0,
    variationsPushed: 0,
  };
}

export type LocalSquareVariation = {
  amount: number | null;
  localHash: string;
  priceMajor: number;
  sku: string;
  squareVariationId?: string | null;
  squareVariationVersion?: number | null;
  tempId: string;
  unitName: string;
};

export function describeSquareSyncError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : '';
  return message.trim().slice(0, 500) || 'Square sync failed';
}

export function resolveSquareWholeUnitStock({
  currentAmount,
  remoteAmount,
}: {
  currentAmount: number | null;
  remoteAmount: number;
}) {
  if (Number.isSafeInteger(remoteAmount)) {
    return { amount: remoteAmount, error: null };
  }

  const preservedAmount = Number.isSafeInteger(currentAmount)
    ? currentAmount
    : 0;
  const resolution = currentAmount == null ? 'set it to 0' : 'kept its value';
  return {
    amount: preservedAmount,
    error: `Square reported non-whole stock (${remoteAmount}). Tuturuuu ${resolution} until an operator reviews the count.`,
  };
}

export function selectUnlinkedSquareImportProduct({
  candidateIds,
  linkedProductIds,
}: {
  candidateIds: string[];
  linkedProductIds: string[];
}) {
  const linked = new Set(linkedProductIds);
  return candidateIds.find((id) => !linked.has(id)) ?? null;
}

export function inventoryPriceToSquareAmount(
  priceMajor: number,
  currency = 'USD'
) {
  return Math.max(0, majorToMinor(priceMajor, currency));
}

export function squareAmountToInventoryPrice(
  amountMinor: number,
  currency = 'USD'
) {
  return minorToMajor(Math.max(0, Math.round(amountMinor)), currency);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)])
  );
}

export function squareSyncHash(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

export function decideSquareCatalogSync({
  currentLocalHash,
  currentSquareHash,
  direction,
  previousLocalHash,
  previousSquareHash,
}: {
  currentLocalHash: string;
  currentSquareHash: string;
  direction: SquareCatalogSyncDirection;
  previousLocalHash?: string | null;
  previousSquareHash?: string | null;
}): SquareCatalogSyncDecision {
  if (direction === 'from_square') return 'pull';
  if (direction === 'to_square') return 'push';
  if (!previousLocalHash || !previousSquareHash) return 'pull';

  const localChanged = currentLocalHash !== previousLocalHash;
  const squareChanged = currentSquareHash !== previousSquareHash;
  if (localChanged && squareChanged) return 'conflict';
  if (squareChanged) return 'pull';
  if (localChanged) return 'push';
  return 'noop';
}

export function mergeSquareItemWithoutDeleting({
  currency = 'USD',
  description,
  itemId,
  itemVersion,
  name,
  remoteItem,
  variations,
}: {
  currency?: string;
  description?: string | null;
  itemId: string;
  itemVersion?: number | null;
  name: string;
  remoteItem?: SquareCatalogObject | null;
  variations: LocalSquareVariation[];
}): SquareCatalogObject {
  const remoteVariations = remoteItem?.item_data?.variations ?? [];
  const replacements = new Map(
    variations
      .filter((variation) => variation.squareVariationId)
      .map((variation) => [variation.squareVariationId, variation])
  );
  const mergedVariations = remoteVariations.map((remoteVariation) => {
    const replacement = remoteVariation.id
      ? replacements.get(remoteVariation.id)
      : undefined;
    if (!replacement) return remoteVariation;
    replacements.delete(remoteVariation.id);
    const priceCurrency =
      remoteVariation.item_variation_data?.price_money?.currency ?? currency;
    return {
      ...remoteVariation,
      id: remoteVariation.id,
      item_variation_data: {
        ...remoteVariation.item_variation_data,
        item_id: itemId,
        name: replacement.unitName,
        price_money: {
          amount: inventoryPriceToSquareAmount(
            replacement.priceMajor,
            priceCurrency
          ),
          currency: priceCurrency,
        },
        sku: replacement.sku,
        track_inventory: true,
      },
      type: 'ITEM_VARIATION',
      ...(replacement.squareVariationVersion
        ? { version: replacement.squareVariationVersion }
        : {}),
    } satisfies SquareCatalogObject;
  });

  for (const variation of variations) {
    if (
      variation.squareVariationId &&
      !replacements.has(variation.squareVariationId)
    ) {
      continue;
    }
    mergedVariations.push({
      id: variation.squareVariationId || variation.tempId,
      item_variation_data: {
        item_id: itemId,
        name: variation.unitName,
        price_money: {
          amount: inventoryPriceToSquareAmount(variation.priceMajor, currency),
          currency,
        },
        sku: variation.sku,
        track_inventory: true,
      },
      present_at_all_locations: true,
      type: 'ITEM_VARIATION',
      ...(variation.squareVariationVersion
        ? { version: variation.squareVariationVersion }
        : {}),
    });
  }

  return {
    id: itemId,
    item_data: {
      ...remoteItem?.item_data,
      description: description ?? undefined,
      name,
      variations: mergedVariations,
    },
    present_at_all_locations: remoteItem?.present_at_all_locations ?? true,
    type: 'ITEM',
    ...(itemVersion ? { version: itemVersion } : {}),
  };
}

export function buildSquarePhysicalCountChanges({
  locationId,
  occurredAt,
  variations,
}: {
  locationId: string;
  occurredAt: string;
  variations: Array<{
    amount: number | null;
    referenceId: string;
    squareVariationId: string;
  }>;
}) {
  return variations.flatMap((variation) =>
    variation.amount == null
      ? []
      : [
          {
            physical_count: {
              catalog_object_id: variation.squareVariationId,
              location_id: locationId,
              occurred_at: occurredAt,
              quantity: String(Math.max(0, variation.amount)),
              reference_id: variation.referenceId,
              state: 'IN_STOCK',
            },
            type: 'PHYSICAL_COUNT',
          },
        ]
  );
}

export function hasSquareDeleteInstruction(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSquareDeleteInstruction);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === 'is_deleted' && child === true) return true;
      if (
        normalizedKey === 'type' &&
        typeof child === 'string' &&
        child.toUpperCase().includes('DELETE')
      ) {
        return true;
      }
      return hasSquareDeleteInstruction(child);
    }
  );
}
