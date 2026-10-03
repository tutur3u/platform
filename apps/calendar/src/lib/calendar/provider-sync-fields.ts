import type { TablesUpdate } from '@tuturuuu/types';

export function getProviderSyncFields(args: {
  error: unknown;
  settingsAvailable: boolean;
  synced: boolean;
}) {
  if (!args.settingsAvailable) return {};
  if (args.synced)
    return {
      last_synced_at: new Date().toISOString(),
      sync_error: null,
      sync_status: 'synced',
    };
  if (args.error) {
    const message =
      args.error instanceof Error
        ? args.error.message
        : 'External calendar sync failed';
    return { sync_error: message.slice(0, 1000), sync_status: 'failed' };
  }
  return { sync_error: null, sync_status: 'local_only' };
}

export function applyProviderSyncFields(
  updatePayload: TablesUpdate<'workspace_calendar_events'>,
  args: {
    error: unknown;
    settingsAvailable: boolean;
    synced: boolean;
  }
) {
  Object.assign(updatePayload, getProviderSyncFields(args));
}
