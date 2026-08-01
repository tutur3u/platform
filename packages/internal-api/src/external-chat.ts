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
  settings: Record<string, unknown> | null;
  verifiedAt: string | null;
}

export type ExternalChatCredentialAction =
  | { action: 'rotate_ingest' }
  | { action: 'set_control'; secret: string }
  | { action: 'clear_ingest' }
  | { action: 'clear_control' }
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
  payload: Record<string, unknown>,
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
