import 'server-only';

import { createHash } from 'node:crypto';
import type {
  InventorySquareConnection,
  InventorySquareEnvironment,
} from '@tuturuuu/internal-api/inventory';
import { decryptField, encryptField } from '@tuturuuu/utils/encryption';
import {
  getOrCreateWorkspaceKey,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';
import {
  getSquareOAuthCredentials,
  loadAppCredentialRows,
} from './app-credentials-store';
import {
  listSquareLocationsApi,
  parseSquareScopes,
  refreshSquareOAuthToken,
} from './client';
import {
  getPrivateAdmin,
  loadSettingsRow,
  type SupabaseErrorLike,
} from './settings-store';
import type { SquareAccessContext, SquareEnvironment } from './types';

export type SquareConnectionRow = {
  access_token_encrypted: string;
  access_token_fingerprint: string | null;
  access_token_last4: string | null;
  auth_method: 'manual' | 'oauth';
  environment: InventorySquareEnvironment;
  id: string;
  last_error: string | null;
  last_validated_at: string | null;
  merchant_id: string | null;
  refresh_token_encrypted: string | null;
  refresh_token_last4: string | null;
  scopes: string[] | null;
  status: 'error' | 'pending' | 'ready' | 'revoked';
  token_expires_at: string | null;
  updated_at: string | null;
  webhook_signature_key_encrypted: string | null;
  webhook_signature_key_last4: string | null;
  ws_id: string;
};

export function tokenFingerprint(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenLast4(token: string | null | undefined) {
  return token ? token.slice(-4) || null : null;
}

export function extractErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Square request failed';
}

export function mapConnection(
  row: SquareConnectionRow
): InventorySquareConnection {
  return {
    accessTokenFingerprint: row.access_token_fingerprint,
    accessTokenLast4: row.access_token_last4,
    authMethod: row.auth_method,
    environment: row.environment,
    lastError: row.last_error,
    lastValidatedAt: row.last_validated_at,
    merchantId: row.merchant_id,
    refreshTokenLast4: row.refresh_token_last4,
    scopes: row.scopes ?? [],
    status: row.status,
    tokenExpiresAt: row.token_expires_at,
    updatedAt: row.updated_at,
    webhookSignatureKeyLast4: row.webhook_signature_key_last4,
  };
}

export async function loadConnectionRows(wsId: string) {
  const privateAdmin = await getPrivateAdmin();
  const result = (await privateAdmin
    .from('inventory_square_connections' as never)
    .select(
      'id, ws_id, environment, auth_method, merchant_id, access_token_encrypted, access_token_fingerprint, access_token_last4, refresh_token_encrypted, refresh_token_last4, token_expires_at, scopes, webhook_signature_key_encrypted, webhook_signature_key_last4, status, last_validated_at, last_error, updated_at'
    )
    .eq('ws_id', wsId)
    .order('environment', { ascending: true })) as {
    data: SquareConnectionRow[] | null;
    error: SupabaseErrorLike;
  };

  if (result.error) {
    throw new Error(
      result.error.message ?? 'Failed to load Square connections'
    );
  }

  return result.data ?? [];
}

export async function getActiveConnection(
  wsId: string,
  environment: SquareEnvironment
) {
  return (await loadConnectionRows(wsId)).find(
    (item) => item.environment === environment
  );
}

export async function updateConnection(
  wsId: string,
  environment: SquareEnvironment,
  values: Record<string, unknown>
) {
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_square_connections' as never)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('ws_id', wsId)
    .eq('environment', environment)) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to update Square token');
}

export async function markConnectionRevoked({
  environment,
  merchantId,
  wsId,
}: {
  environment: SquareEnvironment;
  merchantId?: string | null;
  wsId: string;
}) {
  await updateConnection(wsId, environment, {
    last_error: merchantId
      ? `Square OAuth authorization revoked for merchant ${merchantId}`
      : 'Square OAuth authorization revoked',
    status: 'revoked',
  });
}

export async function markConnectionsRevokedByMerchantId({
  environment,
  merchantId,
}: {
  environment: SquareEnvironment;
  merchantId: string;
}) {
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_square_connections' as never)
    .update({
      last_error: `Square OAuth authorization revoked for merchant ${merchantId}`,
      status: 'revoked',
      updated_at: new Date().toISOString(),
    } as never)
    .eq('environment', environment)
    .eq('merchant_id', merchantId)) as { error: SupabaseErrorLike };

  if (error) {
    throw new Error(
      error.message ?? 'Failed to mark Square connections revoked'
    );
  }
}

export async function decryptConnectionToken(row: SquareConnectionRow) {
  const workspaceKey = await getWorkspaceKey(row.ws_id);
  if (!workspaceKey) throw new Error('Workspace encryption key is unavailable');
  return decryptField(row.access_token_encrypted, workspaceKey);
}

async function decryptConnectionRefreshToken(row: SquareConnectionRow) {
  if (!row.refresh_token_encrypted) return null;
  const workspaceKey = await getWorkspaceKey(row.ws_id);
  if (!workspaceKey) throw new Error('Workspace encryption key is unavailable');
  return decryptField(row.refresh_token_encrypted, workspaceKey);
}

export async function upsertConnectionToken({
  accessToken,
  authMethod,
  environment,
  expiresAt,
  merchantId,
  refreshToken,
  scopes,
  userId,
  wsId,
}: {
  accessToken: string;
  authMethod: 'manual' | 'oauth';
  environment: SquareEnvironment;
  expiresAt?: string | null;
  merchantId?: string | null;
  refreshToken?: string | null;
  scopes?: string[];
  userId: string | null;
  wsId: string;
}) {
  const workspaceKey = await getOrCreateWorkspaceKey(wsId);
  if (!workspaceKey) {
    throw new Error('Workspace encryption is required before saving Square');
  }

  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_square_connections' as never)
    .upsert(
      {
        access_token_encrypted: encryptField(accessToken, workspaceKey),
        access_token_fingerprint: tokenFingerprint(accessToken),
        access_token_last4: tokenLast4(accessToken),
        auth_method: authMethod,
        environment,
        last_error: null,
        merchant_id: merchantId ?? null,
        refresh_token_encrypted: refreshToken
          ? encryptField(refreshToken, workspaceKey)
          : null,
        refresh_token_last4: tokenLast4(refreshToken),
        scopes: scopes ?? [],
        status: 'pending',
        token_expires_at: expiresAt ?? null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
        ws_id: wsId,
      } as never,
      { onConflict: 'ws_id,environment' }
    )) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to save Square token');
}

export async function validateConnection({
  environment,
  wsId,
}: {
  environment: SquareEnvironment;
  wsId: string;
}) {
  const connection = await getActiveConnection(wsId, environment);
  if (!connection) throw new Error('Square connection was not saved');

  try {
    const accessToken = await decryptConnectionToken(connection);
    await listSquareLocationsApi({ accessToken, environment });
    await updateConnection(wsId, environment, {
      last_error: null,
      last_validated_at: new Date().toISOString(),
      status: 'ready',
    });
  } catch (error) {
    const message = extractErrorMessage(error);
    await updateConnection(wsId, environment, {
      last_error: message,
      last_validated_at: new Date().toISOString(),
      status: 'error',
    });
    throw new Error(message);
  }
}

export async function upsertWebhookSignatureKey({
  environment,
  signatureKey,
  userId,
  wsId,
}: {
  environment: SquareEnvironment;
  signatureKey: string;
  userId: string;
  wsId: string;
}) {
  const workspaceKey = await getOrCreateWorkspaceKey(wsId);
  if (!workspaceKey) {
    throw new Error('Workspace encryption is required before saving Square');
  }

  const privateAdmin = await getPrivateAdmin();
  const { data, error } = (await privateAdmin
    .from('inventory_square_connections' as never)
    .update({
      updated_at: new Date().toISOString(),
      updated_by: userId,
      webhook_signature_key_encrypted: encryptField(signatureKey, workspaceKey),
      webhook_signature_key_last4: tokenLast4(signatureKey),
    } as never)
    .eq('ws_id', wsId)
    .eq('environment', environment)
    .select('environment')
    .maybeSingle()) as { data: unknown; error: SupabaseErrorLike };

  if (error) {
    throw new Error(error.message ?? 'Failed to save Square webhook key');
  }
  if (!data) {
    throw new Error(
      `Connect a Square ${environment} token before saving its webhook key`
    );
  }
}

export async function refreshConnectionIfNeeded(row: SquareConnectionRow) {
  if (row.auth_method !== 'oauth' || !row.refresh_token_encrypted) return row;
  const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (expiresAt > Date.now() + 5 * 60 * 1000) return row;

  const refreshToken = await decryptConnectionRefreshToken(row);
  if (!refreshToken) return row;

  try {
    const config = await getSquareOAuthCredentials({
      environment: row.environment,
      wsId: row.ws_id,
    });
    const refreshed = await refreshSquareOAuthToken({
      config,
      environment: row.environment,
      refreshToken,
    });
    if (!refreshed.access_token) return row;
    const scopes = parseSquareScopes(refreshed.scope);
    await upsertConnectionToken({
      accessToken: refreshed.access_token,
      authMethod: 'oauth',
      environment: row.environment,
      expiresAt: refreshed.expires_at ?? row.token_expires_at,
      merchantId: refreshed.merchant_id ?? row.merchant_id,
      refreshToken: refreshed.refresh_token ?? refreshToken,
      scopes: scopes.length ? scopes : (row.scopes ?? []),
      userId: null,
      wsId: row.ws_id,
    });
    await updateConnection(row.ws_id, row.environment, {
      last_error: null,
      status: 'ready',
    });
    return (await getActiveConnection(row.ws_id, row.environment)) ?? row;
  } catch (error) {
    console.warn('Inventory Square OAuth refresh failed', {
      environment: row.environment,
      error: extractErrorMessage(error),
      wsId: row.ws_id,
    });
    await updateConnection(row.ws_id, row.environment, {
      last_error: extractErrorMessage(error),
      status: 'error',
    });
    throw error;
  }
}

export async function getInventorySquareAccessContext(wsId: string) {
  const settings = await loadSettingsRow(wsId);
  const connection = await getActiveConnection(wsId, settings.environment);
  if (connection?.status !== 'ready') {
    throw new Error(`Square ${settings.environment} is not connected`);
  }

  const refreshed = await refreshConnectionIfNeeded(connection);
  const accessToken = await decryptConnectionToken(refreshed);

  return {
    accessToken,
    environment: settings.environment,
    wsId,
  };
}

export async function getInventorySquareTerminalContext(
  wsId: string
): Promise<SquareAccessContext> {
  const settings = await loadSettingsRow(wsId);
  const connectionContext = await getInventorySquareAccessContext(wsId);
  const deviceId =
    settings.environment === 'sandbox'
      ? settings.sandbox_device_id || settings.device_id
      : settings.device_id;

  if (!settings.location_id) throw new Error('Square location is not selected');
  if (!deviceId) throw new Error('Square terminal device is not selected');

  return {
    accessToken: connectionContext.accessToken,
    deviceId,
    environment: connectionContext.environment,
    locationId: settings.location_id,
    wsId,
  };
}

export async function getInventorySquareWebhookSecrets(wsId: string) {
  const [rows, appCredentials] = await Promise.all([
    loadConnectionRows(wsId),
    loadAppCredentialRows(wsId),
  ]);
  const workspaceKey = await getWorkspaceKey(wsId);
  if (!workspaceKey) return [];
  const appCredentialsByEnvironment = new Map(
    appCredentials.map((row) => [row.environment, row])
  );

  return rows.flatMap((row) => {
    if (!row.webhook_signature_key_encrypted) return [];
    const appCredential = appCredentialsByEnvironment.get(row.environment);
    return [
      {
        environment: row.environment,
        notificationUrl: appCredential?.webhook_notification_url ?? null,
        secret: decryptField(row.webhook_signature_key_encrypted, workspaceKey),
      },
    ];
  });
}
