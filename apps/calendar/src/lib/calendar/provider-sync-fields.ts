import type { TablesUpdate } from '@tuturuuu/types';

export function applyProviderSyncFields(
  updatePayload: TablesUpdate<'workspace_calendar_events'>,
  args: {
    error: unknown;
    settingsAvailable: boolean;
    synced: boolean;
  }
) {
  if (!args.settingsAvailable) return;

  if (args.synced) {
    (updatePayload as any).last_synced_at = new Date().toISOString();
    (updatePayload as any).sync_error = null;
    (updatePayload as any).sync_status = 'synced';
    return;
  }

  if (args.error) {
    const message =
      args.error instanceof Error
        ? args.error.message
        : 'External calendar sync failed';
    (updatePayload as any).sync_error = message.slice(0, 1000);
    (updatePayload as any).sync_status = 'failed';
    return;
  }

  (updatePayload as any).sync_error = null;
  (updatePayload as any).sync_status = 'local_only';
}
