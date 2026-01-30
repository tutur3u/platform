import type { MigrationModule } from '../modules';

// Composite key strategies for tables without primary `id` field
const compositeKeyStrategies: Record<string, (item: unknown) => string | null> =
  {
    'class-packages': (item) => {
      const i = item as Record<string, unknown>;
      return i?.group_id != null && i?.product_id != null && i?.unit_id != null
        ? `${String(i.group_id)}|${String(i.product_id)}|${String(i.unit_id)}`
        : null;
    },
    'class-members': (item) => {
      const i = item as Record<string, unknown>;
      return i?.user_id != null && i?.group_id != null
        ? `${String(i.user_id)}|${String(i.group_id)}`
        : null;
    },
    'class-scores': (item) => {
      const i = item as Record<string, unknown>;
      return i?.user_id != null && i?.indicator_id != null
        ? `${String(i.user_id)}|${String(i.indicator_id)}`
        : null;
    },
    'class-attendance': (item) => {
      const i = item as Record<string, unknown>;
      return i?.group_id != null && i?.user_id != null && i?.date != null
        ? `${String(i.group_id)}|${String(i.user_id)}|${String(i.date)}`
        : null;
    },
    'bill-packages': (item) => {
      const i = item as Record<string, unknown>;
      return i?.invoice_id != null &&
        i?.product_name != null &&
        i?.product_unit != null &&
        i?.warehouse != null
        ? `${String(i.invoice_id)}|${String(i.product_name)}|${String(i.product_unit)}|${String(i.warehouse)}`
        : null;
    },
    'user-coupons': (item) => {
      const i = item as Record<string, unknown>;
      return i?.user_id != null && i?.promo_id != null
        ? `${String(i.user_id)}|${String(i.promo_id)}`
        : null;
    },
    'product-prices': (item) => {
      const i = item as Record<string, unknown>;
      return i?.product_id != null &&
        i?.unit_id != null &&
        i?.warehouse_id != null
        ? `${String(i.product_id)}|${String(i.unit_id)}|${String(i.warehouse_id)}`
        : null;
    },
    'bill-coupons': (item) => {
      const i = item as Record<string, unknown>;
      return i?.invoice_id != null &&
        i?.code != null &&
        i?.value != null &&
        i?.use_ratio != null
        ? `${String(i.invoice_id)}|${String(i.code)}|${String(i.value)}|${String(i.use_ratio)}`
        : null;
    },
    'finance-invoice-user-groups': (item) => {
      const i = item as Record<string, unknown>;
      return i?.invoice_id != null && i?.user_group_id != null
        ? `${String(i.invoice_id)}|${String(i.user_group_id)}`
        : null;
    },
  };

/**
 * Get unique key for an item (composite or simple id)
 */
export function getItemKey(
  module: MigrationModule,
  item: unknown
): string | null {
  const i = item as Record<string, unknown>;
  // Try composite key strategy first if module has one
  const compositeKeyFn = compositeKeyStrategies[module];
  const compositeKey = compositeKeyFn?.(item);
  if (compositeKey) {
    return compositeKey;
  }
  // Fallback to simple id when no composite key can be derived
  return (i.id as string) ?? (i._id as string) ?? null;
}

/**
 * Check if the module uses composite key strategy
 */
export function usesCompositeKey(module: MigrationModule): boolean {
  return module in compositeKeyStrategies;
}

/**
 * Build a map of existing records by key for quick lookup
 */
export function buildExistingMap(
  module: MigrationModule,
  data: unknown[]
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  data.forEach((item) => {
    const key = getItemKey(module, item);
    if (key !== null) map.set(key, item);
  });
  return map;
}

// Fields to ignore in comparison
const IGNORE_FIELDS = [
  'created_at',
  'updated_at',
  'modified_at',
  'last_modified',
  'ws_id',
];

/**
 * Normalize value for comparison
 */
function normalizeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' && (val === 0 || val === 1)) return val;
  return val;
}

/**
 * Compare objects ignoring timestamps and metadata
 */
export function hasSignificantChanges(
  existing: unknown,
  external: unknown
): boolean {
  const existingObj = existing as Record<string, unknown>;
  const externalObj = external as Record<string, unknown>;

  // Get keys from external object (source of truth for comparison)
  const extKeys = Object.keys(externalObj).filter(
    (k) => !IGNORE_FIELDS.includes(k)
  );

  // Compare only fields present in external data
  for (const key of extKeys) {
    const extVal = externalObj[key];
    const existVal = existingObj[key];

    // Skip if key doesn't exist in existing (it's a new field, not a change)
    if (!(key in existingObj)) continue;

    const normalizedExt = normalizeValue(extVal);
    const normalizedExist = normalizeValue(existVal);

    // Deep comparison for nested objects/arrays
    if (JSON.stringify(normalizedExt) !== JSON.stringify(normalizedExist)) {
      return true;
    }
  }

  return false;
}

/**
 * Options for reconciliation behavior
 */
export interface ReconciliationOptions {
  /**
   * When true, returns recordsToSync containing only new + updated records,
   * excluding unchanged duplicates. Use this in Tuturuuu mode to skip
   * unnecessary upserts.
   */
  skipDuplicates?: boolean;
}

/**
 * Result of reconciliation containing counts and optionally filtered data
 */
export interface ReconciliationResult {
  newRecords: number;
  updates: number;
  duplicates: number;
  /** All mapped external data (for display purposes) */
  mappedData: unknown[];
  /**
   * Records that need syncing (new + updates only).
   * Only populated when skipDuplicates option is true.
   */
  recordsToSync?: unknown[];
}

/**
 * Reconcile external data with existing internal data
 */
export function reconcileData(
  module: MigrationModule,
  externalData: unknown[],
  existingInternalData: unknown[],
  mapping?: (wsId: string, data: unknown[]) => unknown[],
  workspaceId?: string,
  options?: ReconciliationOptions
): ReconciliationResult {
  const { skipDuplicates = false } = options ?? {};

  // Apply mapping to external data before comparison
  const mappedData =
    mapping && workspaceId ? mapping(workspaceId, externalData) : externalData;

  // Build existing map
  const existingMap = buildExistingMap(module, existingInternalData);

  let newRecords = 0;
  let updates = 0;
  let duplicates = 0;

  // Arrays to collect filtered records when skipDuplicates is enabled
  const newItems: unknown[] = [];
  const updateItems: unknown[] = [];

  // Analyze mapped external data vs existing data
  for (const extItem of mappedData) {
    const extKey = getItemKey(module, extItem);
    if (extKey !== null && existingMap.has(extKey)) {
      const existing = existingMap.get(extKey);
      if (hasSignificantChanges(existing, extItem)) {
        updates++;
        if (skipDuplicates) updateItems.push(extItem);
      } else {
        duplicates++;
        // Don't add duplicates to recordsToSync
      }
    } else {
      newRecords++;
      if (skipDuplicates) newItems.push(extItem);
    }
  }

  const result: ReconciliationResult = {
    newRecords,
    updates,
    duplicates,
    mappedData,
  };

  // Only include recordsToSync when skipDuplicates is enabled
  if (skipDuplicates) {
    result.recordsToSync = [...newItems, ...updateItems];
  }

  return result;
}
