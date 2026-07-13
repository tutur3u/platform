import 'server-only';

import type { InventorySquareCatalogSyncSummary } from './catalog-sync';
import type { SquareCatalogSyncDirection } from './catalog-sync-contract';
import {
  getPrivateAdmin,
  loadSettingsRow,
  type SupabaseErrorLike,
} from './settings-store';
import type { SquareEnvironment } from './types';

export async function getInventorySquareSyncState(wsId: string) {
  const settings = await loadSettingsRow(wsId);
  const privateAdmin = await getPrivateAdmin();
  const { data, error } = (await privateAdmin
    .from('inventory_square_sync_state' as never)
    .select(
      'environment, last_catalog_cursor_at, last_inventory_sync_at, last_direction, last_status, last_error, last_summary, updated_at'
    )
    .eq('ws_id', wsId)
    .eq('environment', settings.environment)
    .maybeSingle()) as {
    data: Record<string, unknown> | null;
    error: SupabaseErrorLike;
  };
  if (error) {
    throw new Error(error.message ?? 'Failed to load Square sync state');
  }
  if (!data) return null;
  return {
    environment: data.environment as SquareEnvironment,
    lastCatalogCursorAt: (data.last_catalog_cursor_at as string | null) ?? null,
    lastDirection:
      (data.last_direction as SquareCatalogSyncDirection | null) ?? null,
    lastError: (data.last_error as string | null) ?? null,
    lastInventorySyncAt: (data.last_inventory_sync_at as string | null) ?? null,
    lastStatus:
      (data.last_status as
        | 'error'
        | 'idle'
        | 'partial'
        | 'running'
        | 'success') ?? 'idle',
    lastSummary:
      (data.last_summary as InventorySquareCatalogSyncSummary | null) ?? null,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}
