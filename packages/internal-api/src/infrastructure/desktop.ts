import { getInternalApiClient, type InternalApiClientOptions } from '../client';

export type DesktopVaultPlatform = 'windows' | 'macos';
export type DesktopVaultVersion = {
  id: string;
  platform: DesktopVaultPlatform;
  version: number;
  status: 'draft' | 'active';
  revision: number;
  validatedRevision: number | null;
  validationErrors: string[];
  createdAt: string;
  resources: string[];
};
export type DesktopVaultState = {
  deliveryEnabled: false;
  platforms: {
    platform: DesktopVaultPlatform;
    enabled: boolean;
    activeVersionId: string | null;
  }[];
  versions: DesktopVaultVersion[];
  tokens: {
    id: string;
    platform: DesktopVaultPlatform;
    versionId: string;
    prefix: string;
    expiresAt: string;
    revokedAt: string | null;
  }[];
};

export async function getDesktopVaultState(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<DesktopVaultState>(
    '/api/v1/desktop-deployment',
    { cache: 'no-store' }
  );
}

export type DesktopVaultMutation =
  | { action: 'create_version'; platform: DesktopVaultPlatform }
  | {
      action: 'remove_resource';
      versionId: string;
      revision: number;
      name: string;
    }
  | {
      action: 'save_scalar';
      versionId: string;
      revision: number;
      name: string;
      value: string;
    }
  | { action: 'validate'; versionId: string; revision: number }
  | { action: 'activate'; versionId: string; revision: number }
  | { action: 'create_token'; versionId: string; expiresAt: string }
  | { action: 'revoke_token'; tokenId: string };

export async function mutateDesktopVault(
  payload: DesktopVaultMutation,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    state: DesktopVaultState;
    token?: string;
  }>('/api/v1/desktop-deployment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tuturuuu-desktop-deployment-action': '1',
    },
    body: JSON.stringify(payload),
  });
}

export async function uploadDesktopVaultFile(
  input: { versionId: string; revision: number; name: string; file: File },
  options?: InternalApiClientOptions
) {
  const body = new FormData();
  body.set('versionId', input.versionId);
  body.set('revision', String(input.revision));
  body.set('name', input.name);
  body.set('file', input.file);
  return getInternalApiClient(options).json<{ state: DesktopVaultState }>(
    '/api/v1/desktop-deployment/resources',
    {
      method: 'POST',
      headers: { 'x-tuturuuu-desktop-deployment-action': '1' },
      body,
    }
  );
}
