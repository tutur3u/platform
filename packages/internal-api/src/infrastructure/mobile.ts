import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  InternalApiError,
} from '../client';
import type {
  ClearMobileDeploymentSecretPayload,
  IssueMobileDeploymentCiTokenPayload,
  IssueMobileDeploymentCiTokenResponse,
  MobileDeploymentEnvKeyName,
  MobileDeploymentFileKind,
  MobileDeploymentScalarName,
  MobileDeploymentState,
  MobileVersionPoliciesPayload,
  SaveMobileDeploymentSecretPayload,
  SendInfrastructurePushTestPayload,
  SendInfrastructurePushTestResponse,
} from './types';

export async function sendInfrastructurePushTest(
  payload: SendInfrastructurePushTestPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SendInfrastructurePushTestResponse>(
    '/api/v1/infrastructure/push-notifications/test',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateMobileVersionPolicies(
  payload: MobileVersionPoliciesPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    data: MobileVersionPoliciesPayload;
    message: string;
  }>('/api/v1/infrastructure/mobile-versions', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  });
}

const MOBILE_DEPLOYMENT_CSRF_HEADER = 'x-tuturuuu-mobile-deployment-action';
function mobileDeploymentMutationHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set(MOBILE_DEPLOYMENT_CSRF_HEADER, '1');
  return headers;
}

export async function getMobileDeploymentState(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MobileDeploymentState>('/api/v1/mobile-deployment', {
    cache: 'no-store',
  });
}

export async function replaceMobileDeploymentEnvFile(
  envFile: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MobileDeploymentState>('/api/v1/mobile-deployment', {
    body: JSON.stringify({ action: 'replace_env', envFile }),
    cache: 'no-store',
    headers: mobileDeploymentMutationHeaders({
      'Content-Type': 'application/json',
    }),
    method: 'PUT',
  });
}

export async function saveMobileDeploymentEnvKeyValue(
  name: MobileDeploymentEnvKeyName,
  value: string,
  previousNameOrOptions?: MobileDeploymentEnvKeyName | InternalApiClientOptions,
  options?: InternalApiClientOptions
) {
  const previousName =
    typeof previousNameOrOptions === 'string'
      ? previousNameOrOptions
      : undefined;
  const clientOptions =
    typeof previousNameOrOptions === 'string' ? options : previousNameOrOptions;

  return saveMobileDeploymentSecret(
    {
      kind: 'env',
      name,
      previousName,
      value,
    },
    clientOptions
  );
}

export async function clearMobileDeploymentEnvKeyValue(
  name: MobileDeploymentEnvKeyName,
  options?: InternalApiClientOptions
) {
  return clearMobileDeploymentSecret({ kind: 'env', name }, options);
}

export async function saveMobileDeploymentScalarValue(
  name: MobileDeploymentScalarName,
  value: string,
  options?: InternalApiClientOptions
) {
  return saveMobileDeploymentSecret(
    {
      kind: 'scalar',
      name,
      value,
    },
    options
  );
}

export async function clearMobileDeploymentScalarValue(
  name: MobileDeploymentScalarName,
  options?: InternalApiClientOptions
) {
  return clearMobileDeploymentSecret({ kind: 'scalar', name }, options);
}

export async function saveMobileDeploymentSecret(
  payload: SaveMobileDeploymentSecretPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MobileDeploymentState>('/api/v1/mobile-deployment', {
    body: JSON.stringify({ action: 'save_secret', ...payload }),
    cache: 'no-store',
    headers: mobileDeploymentMutationHeaders({
      'Content-Type': 'application/json',
    }),
    method: 'PUT',
  });
}

export async function clearMobileDeploymentSecret(
  payload: ClearMobileDeploymentSecretPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MobileDeploymentState>('/api/v1/mobile-deployment', {
    body: JSON.stringify({ action: 'clear_secret', ...payload }),
    cache: 'no-store',
    headers: mobileDeploymentMutationHeaders({
      'Content-Type': 'application/json',
    }),
    method: 'PUT',
  });
}

export async function uploadMobileDeploymentFileResource(
  kind: MobileDeploymentFileKind,
  file: File,
  options?: InternalApiClientOptions
) {
  const formData = new FormData();
  formData.set('file', file);
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/v1/mobile-deployment/files/${kind}`,
    {
      body: formData,
      cache: 'no-store',
      headers: mobileDeploymentMutationHeaders(),
      method: 'POST',
    }
  );

  if (!response.ok) {
    let code: string | undefined;
    let message = `Internal API request failed: ${response.status}`;

    try {
      const data = (await response.json()) as {
        code?: string;
        error?: string;
        message?: string;
      };
      code = data.code;
      message = data.message || data.error || message;
    } catch {
      // Keep the status fallback when the response is not JSON.
    }

    throw new InternalApiError(message, response.status, code);
  }

  return (await response.json()) as MobileDeploymentState;
}

export async function activateMobileDeploymentDraft(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MobileDeploymentState>(
    '/api/v1/mobile-deployment/activate',
    {
      body: '{}',
      cache: 'no-store',
      headers: mobileDeploymentMutationHeaders({
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export async function rollbackMobileDeploymentVersion(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MobileDeploymentState>(
    '/api/v1/mobile-deployment/rollback',
    {
      body: '{}',
      cache: 'no-store',
      headers: mobileDeploymentMutationHeaders({
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export async function issueMobileDeploymentCiToken(
  payload: IssueMobileDeploymentCiTokenPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<IssueMobileDeploymentCiTokenResponse>(
    '/api/v1/mobile-deployment/tokens',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: mobileDeploymentMutationHeaders({
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export async function revokeMobileDeploymentCiToken(
  tokenId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MobileDeploymentState>(
    `/api/v1/mobile-deployment/tokens/${encodePathSegment(tokenId)}`,
    {
      cache: 'no-store',
      headers: mobileDeploymentMutationHeaders(),
      method: 'DELETE',
    }
  );
}

export type * from './types';
