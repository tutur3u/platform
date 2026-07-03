import 'server-only';

import { createHash } from 'node:crypto';
import type {
  InventorySquareAppCredential,
  InventorySquareEnvironment,
  InventorySquareSettingsPayload,
} from '@tuturuuu/internal-api/inventory';
import { decryptField, encryptField } from '@tuturuuu/utils/encryption';
import {
  getOrCreateWorkspaceKey,
  getWorkspaceKey,
} from '../../../workspace-encryption';
import {
  createSquareOAuthRedirectUrl,
  SquareConfigurationError,
  type SquareOAuthAppConfig,
} from './client';
import { getPrivateAdmin, type SupabaseErrorLike } from './settings-store';
import type { SquareEnvironment } from './types';

export type SquareAppCredentialRow = {
  application_id: string | null;
  application_secret_encrypted: string | null;
  application_secret_fingerprint: string | null;
  application_secret_last4: string | null;
  environment: InventorySquareEnvironment;
  oauth_redirect_url: string | null;
  updated_at: string | null;
  webhook_notification_url: string | null;
  ws_id: string;
};

function cleanNullableText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

function tokenFingerprint(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function tokenLast4(token: string | null | undefined) {
  return token ? token.slice(-4) || null : null;
}

export function mapAppCredential(
  row: SquareAppCredentialRow
): InventorySquareAppCredential {
  return {
    applicationId: row.application_id,
    applicationSecretFingerprint: row.application_secret_fingerprint,
    applicationSecretLast4: row.application_secret_last4,
    environment: row.environment,
    oauthRedirectUrl: row.oauth_redirect_url,
    updatedAt: row.updated_at,
    webhookNotificationUrl: row.webhook_notification_url,
  };
}

export async function loadAppCredentialRows(wsId: string) {
  const privateAdmin = await getPrivateAdmin();
  const result = (await privateAdmin
    .from('inventory_square_app_credentials' as never)
    .select(
      'ws_id, environment, application_id, application_secret_encrypted, application_secret_fingerprint, application_secret_last4, oauth_redirect_url, webhook_notification_url, updated_at'
    )
    .eq('ws_id', wsId)
    .order('environment', { ascending: true })) as {
    data: SquareAppCredentialRow[] | null;
    error: SupabaseErrorLike;
  };

  if (result.error) {
    throw new Error(
      result.error.message ?? 'Failed to load Square app credentials'
    );
  }

  return result.data ?? [];
}

export async function getAppCredentialRow(
  wsId: string,
  environment: SquareEnvironment
) {
  return (await loadAppCredentialRows(wsId)).find(
    (item) => item.environment === environment
  );
}

export function hasUsableSquareAppCredentials(
  row: SquareAppCredentialRow | null | undefined
) {
  return Boolean(row?.application_id && row.application_secret_encrypted);
}

function resolveRedirectUrl({
  origin,
  row,
}: {
  origin?: string;
  row: SquareAppCredentialRow;
}) {
  if (row.oauth_redirect_url) return row.oauth_redirect_url;
  if (origin) return createSquareOAuthRedirectUrl(origin);
  throw new SquareConfigurationError('Square OAuth redirect URL is missing');
}

export async function getSquareOAuthAppConfig({
  environment,
  origin,
  wsId,
}: {
  environment: SquareEnvironment;
  origin?: string;
  wsId: string;
}): Promise<SquareOAuthAppConfig> {
  const row = await getAppCredentialRow(wsId, environment);
  if (!row?.application_id || !row.application_secret_encrypted) {
    throw new SquareConfigurationError(
      'Square OAuth app credentials are not configured for this workspace'
    );
  }

  const workspaceKey = await getWorkspaceKey(wsId);
  if (!workspaceKey) throw new Error('Workspace encryption key is unavailable');

  return {
    applicationId: row.application_id,
    applicationSecret: decryptField(
      row.application_secret_encrypted,
      workspaceKey
    ),
    redirectUrl: resolveRedirectUrl({ origin, row }),
  };
}

export async function getSquareOAuthCredentials({
  environment,
  wsId,
}: {
  environment: SquareEnvironment;
  wsId: string;
}): Promise<Pick<SquareOAuthAppConfig, 'applicationId' | 'applicationSecret'>> {
  const row = await getAppCredentialRow(wsId, environment);
  if (!row?.application_id || !row.application_secret_encrypted) {
    throw new SquareConfigurationError(
      'Square OAuth app credentials are not configured for this workspace'
    );
  }

  const workspaceKey = await getWorkspaceKey(wsId);
  if (!workspaceKey) throw new Error('Workspace encryption key is unavailable');

  return {
    applicationId: row.application_id,
    applicationSecret: decryptField(
      row.application_secret_encrypted,
      workspaceKey
    ),
  };
}

export async function saveSquareAppCredentials({
  environment,
  payload,
  userId,
  wsId,
}: {
  environment: SquareEnvironment;
  payload: InventorySquareSettingsPayload;
  userId: string;
  wsId: string;
}) {
  const hasAppPayload =
    payload.applicationId !== undefined ||
    payload.applicationSecret !== undefined ||
    payload.oauthRedirectUrl !== undefined ||
    payload.webhookNotificationUrl !== undefined;
  if (!hasAppPayload) return;

  const current = await getAppCredentialRow(wsId, environment);
  const applicationId =
    payload.applicationId === undefined
      ? (current?.application_id ?? null)
      : cleanNullableText(payload.applicationId);
  const oauthRedirectUrl =
    payload.oauthRedirectUrl === undefined
      ? (current?.oauth_redirect_url ?? null)
      : cleanNullableText(payload.oauthRedirectUrl);
  const webhookNotificationUrl =
    payload.webhookNotificationUrl === undefined
      ? (current?.webhook_notification_url ?? null)
      : cleanNullableText(payload.webhookNotificationUrl);

  const secret = payload.applicationSecret?.trim();
  let applicationSecretEncrypted =
    current?.application_secret_encrypted ?? null;
  let applicationSecretFingerprint =
    current?.application_secret_fingerprint ?? null;
  let applicationSecretLast4 = current?.application_secret_last4 ?? null;

  if (secret) {
    const workspaceKey = await getOrCreateWorkspaceKey(wsId);
    if (!workspaceKey) {
      throw new Error(
        'Workspace encryption is required before saving Square app credentials'
      );
    }
    applicationSecretEncrypted = encryptField(secret, workspaceKey);
    applicationSecretFingerprint = tokenFingerprint(secret);
    applicationSecretLast4 = tokenLast4(secret);
  }

  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_square_app_credentials' as never)
    .upsert(
      {
        application_id: applicationId,
        application_secret_encrypted: applicationSecretEncrypted,
        application_secret_fingerprint: applicationSecretFingerprint,
        application_secret_last4: applicationSecretLast4,
        environment,
        oauth_redirect_url: oauthRedirectUrl,
        updated_at: new Date().toISOString(),
        updated_by: userId,
        webhook_notification_url: webhookNotificationUrl,
        ws_id: wsId,
      } as never,
      { onConflict: 'ws_id,environment' }
    )) as { error: SupabaseErrorLike };

  if (error) {
    throw new Error(error.message ?? 'Failed to save Square app credentials');
  }
}
