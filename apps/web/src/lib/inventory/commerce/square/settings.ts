import 'server-only';

import type {
  InventorySquareReadinessIssue,
  InventorySquareSettings,
  InventorySquareSettingsPayload,
} from '@tuturuuu/internal-api/inventory';
import { hasSquareAppConfig } from './client';
import {
  loadConnectionRows,
  mapConnection,
  type SquareConnectionRow,
  upsertConnectionToken,
  upsertWebhookSignatureKey,
  validateConnection,
} from './connection-store';
import {
  loadSettingsRow,
  type SquareSettingsRow,
  upsertSettings,
} from './settings-store';
import { SQUARE_OAUTH_SCOPES } from './types';

function computeReadiness({
  connections,
  settings,
}: {
  connections: SquareConnectionRow[];
  settings: SquareSettingsRow;
}): { issues: InventorySquareReadinessIssue[]; ready: boolean } {
  const issues = new Set<InventorySquareReadinessIssue>();
  const connection = connections.find(
    (item) => item.environment === settings.environment
  );

  if (connection?.status !== 'ready') {
    issues.add('connection_missing');
  }

  if (connection?.auth_method === 'oauth') {
    const scopes = new Set(connection.scopes ?? []);
    if (SQUARE_OAUTH_SCOPES.some((scope) => !scopes.has(scope))) {
      issues.add('scopes_missing');
    }
    if (!hasSquareAppConfig(settings.environment)) {
      issues.add('app_credentials_missing');
    }
  }

  if (!connection?.webhook_signature_key_encrypted) {
    issues.add('webhook_signature_missing');
  }

  if (!settings.location_id) issues.add('location_missing');

  const usableDevice =
    settings.environment === 'sandbox'
      ? settings.sandbox_device_id || settings.device_id
      : settings.device_id;
  if (!usableDevice) issues.add('device_missing');

  const list = Array.from(issues);
  return { issues: list, ready: list.length === 0 };
}

export async function getInventorySquareSettings(
  wsId: string
): Promise<InventorySquareSettings> {
  const [settings, connections] = await Promise.all([
    loadSettingsRow(wsId),
    loadConnectionRows(wsId),
  ]);
  const readiness = computeReadiness({ connections, settings });

  return {
    connections: connections.map(mapConnection),
    deviceId: settings.device_id,
    deviceName: settings.device_name,
    environment: settings.environment,
    locationId: settings.location_id,
    locationName: settings.location_name,
    readiness,
    sandboxDeviceId: settings.sandbox_device_id,
    wsId,
  };
}

export async function saveInventorySquareSettings({
  payload,
  userId,
  wsId,
}: {
  payload: InventorySquareSettingsPayload;
  userId: string;
  wsId: string;
}) {
  await upsertSettings({ payload, userId, wsId });

  if (payload.accessToken?.trim()) {
    if (!payload.environment) {
      throw new Error('Square environment is required when saving a token');
    }
    await upsertConnectionToken({
      accessToken: payload.accessToken.trim(),
      authMethod: 'manual',
      environment: payload.environment,
      userId,
      wsId,
    });
    await validateConnection({ environment: payload.environment, wsId });
  }

  if (payload.webhookSignatureKey?.trim()) {
    if (!payload.environment) {
      throw new Error(
        'Square environment is required when saving a webhook key'
      );
    }
    await upsertWebhookSignatureKey({
      environment: payload.environment,
      signatureKey: payload.webhookSignatureKey.trim(),
      userId,
      wsId,
    });
  }

  return getInventorySquareSettings(wsId);
}

export async function assertInventorySquareReady(wsId: string) {
  const settings = await getInventorySquareSettings(wsId);
  if (settings.readiness.ready) return settings;
  throw new Error(
    `Square Terminal is not ready: ${settings.readiness.issues.join(', ')}`
  );
}
