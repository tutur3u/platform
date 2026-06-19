import { getInternalApiClient, type InternalApiClientOptions } from '../client';
import type {
  AppCoordinationSessionPolicy,
  AppCoordinationSessionPolicyResponse,
  ExternalAppsResponse,
  SaveExternalAppPayload,
  SaveExternalAppResponse,
} from './types';

export async function listExternalApps(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<ExternalAppsResponse>(
    '/api/v1/infrastructure/external-apps',
    {
      cache: 'no-store',
    }
  );
}

export async function saveExternalApp(
  payload: SaveExternalAppPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveExternalAppResponse>(
    '/api/v1/infrastructure/external-apps',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function rotateExternalAppSecret(
  appId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveExternalAppResponse>(
    `/api/v1/infrastructure/external-apps/${encodeURIComponent(appId)}/secrets`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function getAppCoordinationSessionPolicy(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AppCoordinationSessionPolicyResponse>(
    '/api/v1/infrastructure/app-coordination',
    {
      cache: 'no-store',
    }
  );
}

export async function saveAppCoordinationSessionPolicy(
  payload: AppCoordinationSessionPolicy,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AppCoordinationSessionPolicyResponse>(
    '/api/v1/infrastructure/app-coordination',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export type * from './types';
