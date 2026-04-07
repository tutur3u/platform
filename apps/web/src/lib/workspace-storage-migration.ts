import 'server-only';

import { posix } from 'node:path';
import { resolveWorkspaceStorageAutoExtractConfig } from './workspace-storage-auto-extract';
import {
  WORKSPACE_STORAGE_PROVIDER_R2,
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  type WorkspaceStorageProvider,
} from './workspace-storage-config';
import {
  downloadWorkspaceStorageObjectForProvider,
  getWorkspaceStorageOverviewForProvider,
  listWorkspaceStorageRawObjectsForProvider,
  resolveWorkspaceStorageBackendConfig,
  resolveWorkspaceStorageProvider,
  uploadWorkspaceStorageFileDirectToProvider,
  WorkspaceStorageError,
  type WorkspaceStorageOverview,
} from './workspace-storage-provider';

export interface WorkspaceStorageBackendState {
  provider: WorkspaceStorageProvider;
  available: boolean;
  selected: boolean;
  misconfigured: boolean;
  overview?: WorkspaceStorageOverview;
  message?: string;
}

export interface WorkspaceStorageRolloutState {
  activeProvider: WorkspaceStorageProvider;
  activeProviderMisconfigured: boolean;
  backends: Record<WorkspaceStorageProvider, WorkspaceStorageBackendState>;
  autoExtract: {
    enabled: boolean;
    configured: boolean;
    proxyUrlConfigured: boolean;
    proxyTokenConfigured: boolean;
  };
}

export interface WorkspaceStorageMigrationResult {
  sourceProvider: WorkspaceStorageProvider;
  targetProvider: WorkspaceStorageProvider;
  filesCopied: number;
  foldersPrepared: number;
  skipped: number;
}

async function buildBackendState(
  wsId: string,
  provider: WorkspaceStorageProvider,
  selected: boolean
): Promise<WorkspaceStorageBackendState> {
  if (provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
    return {
      provider,
      available: true,
      selected,
      misconfigured: false,
      overview: await getWorkspaceStorageOverviewForProvider(wsId, provider),
    };
  }

  const config = await resolveWorkspaceStorageBackendConfig(wsId, provider);

  if (config.provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
    return {
      provider,
      available: false,
      selected,
      misconfigured: true,
      message: 'Cloudflare R2 secrets are incomplete.',
    };
  }

  return {
    provider,
    available: true,
    selected,
    misconfigured: false,
    overview: await getWorkspaceStorageOverviewForProvider(wsId, provider),
  };
}

export async function getWorkspaceStorageRolloutState(
  wsId: string
): Promise<WorkspaceStorageRolloutState> {
  const resolved = await resolveWorkspaceStorageProvider(wsId);
  const autoExtract = await resolveWorkspaceStorageAutoExtractConfig(wsId);
  const [supabaseState, r2State] = await Promise.all([
    buildBackendState(
      wsId,
      WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      resolved.provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE
    ),
    buildBackendState(
      wsId,
      WORKSPACE_STORAGE_PROVIDER_R2,
      resolved.provider === WORKSPACE_STORAGE_PROVIDER_R2
    ),
  ]);

  return {
    activeProvider: resolved.provider,
    activeProviderMisconfigured: resolved.misconfigured,
    backends: {
      [WORKSPACE_STORAGE_PROVIDER_SUPABASE]: supabaseState,
      [WORKSPACE_STORAGE_PROVIDER_R2]: r2State,
    },
    autoExtract: {
      enabled: autoExtract.enabled,
      configured: autoExtract.configured,
      proxyUrlConfigured: !!autoExtract.proxyUrl,
      proxyTokenConfigured: !!autoExtract.proxyToken,
    },
  };
}

export async function migrateWorkspaceStorageBetweenProviders(
  wsId: string,
  options: {
    sourceProvider: WorkspaceStorageProvider;
    targetProvider: WorkspaceStorageProvider;
    overwrite?: boolean;
  }
): Promise<WorkspaceStorageMigrationResult> {
  if (options.sourceProvider === options.targetProvider) {
    throw new WorkspaceStorageError(
      'Source and target providers must be different for migration.',
      400
    );
  }

  if (options.sourceProvider === WORKSPACE_STORAGE_PROVIDER_R2) {
    const sourceConfig = await resolveWorkspaceStorageBackendConfig(
      wsId,
      options.sourceProvider
    );

    if (sourceConfig.provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
      throw new WorkspaceStorageError(
        'Cloudflare R2 is not fully configured as a migration source.',
        400
      );
    }
  }

  if (options.targetProvider === WORKSPACE_STORAGE_PROVIDER_R2) {
    const targetConfig = await resolveWorkspaceStorageBackendConfig(
      wsId,
      options.targetProvider
    );

    if (targetConfig.provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
      throw new WorkspaceStorageError(
        'Cloudflare R2 is not fully configured as a migration target.',
        400
      );
    }
  }

  const objects = await listWorkspaceStorageRawObjectsForProvider(
    wsId,
    options.sourceProvider
  );
  let filesCopied = 0;
  let foldersPrepared = 0;
  let skipped = 0;

  for (const object of objects) {
    if (object.isFolderPlaceholder) {
      const placeholderDir = posix.dirname(object.path);

      if (!placeholderDir || placeholderDir === '.') {
        skipped += 1;
        continue;
      }

      try {
        await uploadWorkspaceStorageFileDirectToProvider(
          wsId,
          options.targetProvider,
          object.path,
          new Uint8Array(0),
          {
            contentType: 'text/plain',
            upsert: options.overwrite ?? true,
            skipCapacityCheck: true,
          }
        );
      } catch (error) {
        if (
          error instanceof WorkspaceStorageError &&
          error.status === 409 &&
          options.overwrite
        ) {
          skipped += 1;
          continue;
        }

        if (error instanceof WorkspaceStorageError && error.status === 409) {
          skipped += 1;
          continue;
        }

        throw error;
      }

      foldersPrepared += 1;
      continue;
    }

    const downloaded = await downloadWorkspaceStorageObjectForProvider(
      wsId,
      options.sourceProvider,
      object.path
    );

    try {
      await uploadWorkspaceStorageFileDirectToProvider(
        wsId,
        options.targetProvider,
        object.path,
        downloaded.buffer,
        {
          contentType:
            downloaded.contentType ||
            object.contentType ||
            'application/octet-stream',
          upsert: options.overwrite ?? true,
          skipCapacityCheck: true,
        }
      );
      filesCopied += 1;
    } catch (error) {
      if (error instanceof WorkspaceStorageError && error.status === 409) {
        skipped += 1;
        continue;
      }

      throw error;
    }
  }

  return {
    sourceProvider: options.sourceProvider,
    targetProvider: options.targetProvider,
    filesCopied,
    foldersPrepared,
    skipped,
  };
}
