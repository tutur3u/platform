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
  settings: ExternalChatSettings | null;
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
  inboxDefaults: Record<string, unknown>;
};

export type ExternalChatCredentialAction =
  | { action: 'rotate_ingest' }
  | { action: 'set_control'; secret: string }
  | { action: 'clear_ingest' }
  | { action: 'clear_control' }
  | { action: 'pair'; ingestSecret: string }
  | { action: 'verify' };

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
