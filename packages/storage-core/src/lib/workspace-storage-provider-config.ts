import 'server-only';

import { getSecrets } from '@tuturuuu/utils/workspace-helper';
import {
  DRIVE_R2_ACCESS_KEY_ID_SECRET,
  DRIVE_R2_BUCKET_SECRET,
  DRIVE_R2_ENDPOINT_SECRET,
  DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
  DRIVE_STORAGE_PROVIDER_SECRET,
  WORKSPACE_STORAGE_PROVIDER_OPTIONS,
  WORKSPACE_STORAGE_PROVIDER_R2,
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  type WorkspaceStorageProvider,
} from './workspace-storage-config';
import {
  createWorkspaceStorageSecretsMap,
  DRIVE_R2_CREDENTIAL_SECRET_NAMES,
  revealWorkspaceStorageCredentials,
} from './workspace-storage-credentials';
import type {
  ResolvedWorkspaceStorageConfig,
  WorkspaceStorageResolvedProvider,
} from './workspace-storage-provider-types';

export function parseWorkspaceStorageProvider(
  value?: string
): WorkspaceStorageProvider {
  if (!value) {
    return WORKSPACE_STORAGE_PROVIDER_SUPABASE;
  }

  const normalized = value.trim().toLowerCase();
  return WORKSPACE_STORAGE_PROVIDER_OPTIONS.includes(
    normalized as WorkspaceStorageProvider
  )
    ? (normalized as WorkspaceStorageProvider)
    : WORKSPACE_STORAGE_PROVIDER_SUPABASE;
}

export async function resolveWorkspaceStorageConfigForProvider(
  wsId: string,
  configMap: Map<string, string>,
  provider: WorkspaceStorageProvider
): Promise<ResolvedWorkspaceStorageConfig> {
  if (provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
    return {
      provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      misconfigured: false,
    };
  }

  const secretMap = await revealWorkspaceStorageCredentials(
    wsId,
    configMap,
    DRIVE_R2_CREDENTIAL_SECRET_NAMES
  );
  const bucket = secretMap.get(DRIVE_R2_BUCKET_SECRET)?.trim();
  const endpoint = secretMap.get(DRIVE_R2_ENDPOINT_SECRET)?.trim();
  const accessKeyId = secretMap.get(DRIVE_R2_ACCESS_KEY_ID_SECRET)?.trim();
  const secretAccessKey = secretMap
    .get(DRIVE_R2_SECRET_ACCESS_KEY_SECRET)
    ?.trim();

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    console.warn(
      `[workspace-storage] Incomplete R2 configuration for workspace ${wsId}. Falling back to Supabase storage.`
    );

    return {
      provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      misconfigured: true,
    };
  }

  return {
    provider: WORKSPACE_STORAGE_PROVIDER_R2,
    misconfigured: false,
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
  };
}

export async function resolveWorkspaceStorageConfig(
  wsId: string
): Promise<ResolvedWorkspaceStorageConfig> {
  const secretMap = createWorkspaceStorageSecretsMap(
    await getSecrets({ wsId, forceAdmin: true })
  );
  const provider = parseWorkspaceStorageProvider(
    secretMap.get(DRIVE_STORAGE_PROVIDER_SECRET)
  );

  return resolveWorkspaceStorageConfigForProvider(wsId, secretMap, provider);
}

export async function resolveWorkspaceStorageProvider(
  wsId: string
): Promise<WorkspaceStorageResolvedProvider> {
  const config = await resolveWorkspaceStorageConfig(wsId);
  return {
    provider: config.provider,
    misconfigured: config.misconfigured,
  };
}

export async function resolveWorkspaceStorageBackendConfig(
  wsId: string,
  provider: WorkspaceStorageProvider
): Promise<ResolvedWorkspaceStorageConfig> {
  return resolveWorkspaceStorageConfigForProvider(
    wsId,
    createWorkspaceStorageSecretsMap(
      await getSecrets({ wsId, forceAdmin: true })
    ),
    provider
  );
}
