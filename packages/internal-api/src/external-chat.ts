import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface ExternalChatBindingState {
  enabled: boolean;
  readiness: { errors: string[]; ready: boolean };
  secrets: {
    control: {
      configured: boolean;
      lastFour: string | null;
      rotatedAt: string | null;
    };
    ingest: {
      configured: boolean;
      lastFour: string | null;
      rotatedAt: string | null;
    };
  };
  settings: Partial<ExternalChatSettings> | null;
  verifiedAt: string | null;
}

export type ExternalChatSettings = {
  agentMappings: Record<string, string>;
  authorityMode:
    | 'legacy_primary'
    | 'mirror_verified'
    | 'tuturuuu_primary'
    | 'fallback_queue'
    | 'paused';
  bridgeBaseUrl: string;
  enabled: boolean;
  inboxDefaults: Record<string, unknown> & { recipientUserId?: string };
};

export type ExternalChatCredentialAction =
  | { action: 'rotate_ingest' }
  | { action: 'set_control'; secret: string }
  | { action: 'clear_ingest' }
  | { action: 'clear_control' }
  | { action: 'pair'; ingestSecret: string }
  | { action: 'verify' };

export type ExternalChatSyncAction = {
  action: 'audit' | 'start' | 'resume' | 'cancel' | 'reconcile';
  runId?: string;
  stream?: string;
};

export type ExternalChatSyncStatus = {
  checkpoint: {
    bridge_checked_at: string | null;
    ingest_checked_at: string | null;
    pending_count: number;
    reconciled_at: string | null;
    state: string;
    updated_at: string;
  } | null;
  runs: Array<{
    created_at: string;
    cursor: Record<string, unknown>;
    digest_results: unknown[];
    error_code: string | null;
    finished_at: string | null;
    high_water_mark: Record<string, unknown>;
    id: string;
    operation: string;
    source_counts: Record<string, number>;
    started_at: string | null;
    state: string;
    target_counts: Record<string, number>;
    updated_at: string;
  }>;
};

const path = (wsId: string, suffix: string) =>
  `/api/v1/workspaces/${encodePathSegment(wsId)}/external-chat/${suffix}`;

export function getExternalChatBindingState(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ExternalChatBindingState | null>(
    path(wsId, 'config'),
    { cache: 'no-store' }
  );
}

export function mutateExternalChatCredential(
  wsId: string,
  payload: ExternalChatCredentialAction,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    secret?: string;
    state: ExternalChatBindingState;
  }>(path(wsId, 'credentials'), {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export function updateExternalChatSettings(
  wsId: string,
  payload: ExternalChatSettings,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ExternalChatBindingState>(
    path(wsId, 'config'),
    {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export function getExternalChatSyncStatus(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ExternalChatSyncStatus>(
    path(wsId, 'sync'),
    { cache: 'no-store' }
  );
}

export function mutateExternalChatSync(
  wsId: string,
  payload: ExternalChatSyncAction,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    remote: Record<string, unknown>;
    runId: string;
  }>(path(wsId, 'sync'), {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}
