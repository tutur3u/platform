import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from '../client';

export type NativeSettingsMetric = {
  label: string;
  value: number | string;
};

export type CalendarSyncSettingsSnapshot = {
  logs: Record<string, unknown>[];
  metrics: NativeSettingsMetric[];
  totalCount: number;
};

export type DevboxSettingsSnapshot = {
  caches: Record<string, unknown>[];
  events: Record<string, unknown>[];
  leases: Record<string, unknown>[];
  metrics: Record<string, number>;
  runners: Record<string, unknown>[];
  runs: Record<string, unknown>[];
};

export type EmailAuditSettingsSnapshot = {
  count: number;
  data: Record<string, unknown>[];
  stats: {
    failed: number;
    rateLimited: number;
    sent: number;
    total: number;
  };
};

export type EntityCreationLimitsSettingsSnapshot = {
  availableTables: Record<string, unknown>[];
  tableGroups: Record<string, unknown>[];
};

export type PushNotificationsSettingsSnapshot = {
  canManagePush: boolean;
  config: {
    message: string;
    projectId: string | null;
    source: string;
    state: string;
  };
  coverage: Record<string, Record<string, number>>;
  recentBatches: Record<string, unknown>[];
  recentDevices: Record<string, unknown>[];
  summary: Record<string, number>;
};

export async function getCalendarSyncSettingsSnapshot(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<CalendarSyncSettingsSnapshot>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/calendar-sync`,
    { cache: 'no-store' }
  );
}

export async function getDevboxSettingsSnapshot(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<DevboxSettingsSnapshot>(
    '/api/v1/infrastructure/devboxes',
    { cache: 'no-store' }
  );
}

export async function getEmailAuditSettingsSnapshot(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<EmailAuditSettingsSnapshot>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/email-audit`,
    { cache: 'no-store' }
  );
}

export async function getEntityCreationLimitsSettingsSnapshot(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<EntityCreationLimitsSettingsSnapshot>(
    '/api/v1/infrastructure/entity-creation-limits',
    { cache: 'no-store' }
  );
}

export async function getPushNotificationsSettingsSnapshot(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<PushNotificationsSettingsSnapshot>(
    '/api/v1/infrastructure/push-notifications',
    { cache: 'no-store' }
  );
}
