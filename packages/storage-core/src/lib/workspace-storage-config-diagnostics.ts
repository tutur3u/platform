import 'server-only';

import { getSecrets } from '@tuturuuu/utils/workspace-helper';
import { StorageConfigurationError } from './storage-configuration-error';
import {
  DRIVE_R2_BUCKET_SECRET,
  DRIVE_R2_ENDPOINT_SECRET,
  DRIVE_STORAGE_PROVIDER_SECRET,
  WORKSPACE_STORAGE_PROVIDER_OPTIONS,
  WORKSPACE_STORAGE_PROVIDER_R2,
  type WorkspaceStorageProvider,
} from './workspace-storage-config';
import {
  createWorkspaceStorageSecretsMap,
  DRIVE_R2_CREDENTIAL_SECRET_NAMES,
  revealWorkspaceStorageCredentials,
} from './workspace-storage-credentials';
import { parseWorkspaceStorageProvider } from './workspace-storage-provider-config';

/**
 * Settings each Drive backend needs before it can serve a workspace. The R2
 * credential names come from the shared credential list.
 */
export const WORKSPACE_STORAGE_REQUIRED_SETTINGS: Readonly<
  Record<WorkspaceStorageProvider, readonly string[]>
> = {
  supabase: [],
  r2: [
    DRIVE_R2_BUCKET_SECRET,
    DRIVE_R2_ENDPOINT_SECRET,
    ...DRIVE_R2_CREDENTIAL_SECRET_NAMES,
  ],
};

/**
 * `absent` (unset or blank) keeps the Supabase default. `unrecognized` is a
 * value outside the provider options, which resolution also treats as
 * Supabase.
 */
export type WorkspaceStorageSelectorStatus =
  | 'absent'
  | 'valid'
  | 'unrecognized';

/**
 * What provider resolution does with this configuration: serve the selected
 * backend, or warn and serve Supabase because the selected R2 settings are
 * incomplete.
 */
export type WorkspaceStorageResolutionOutcome =
  | 'serves-selected'
  | 'falls-back-to-supabase';

export interface WorkspaceStorageConfigDiagnosis {
  workspaceId: string;
  selectorStatus: WorkspaceStorageSelectorStatus;
  selectedBackend: WorkspaceStorageProvider;
  /** Names of required settings that are missing or blank; never values. */
  missingSettings: string[];
  /** Names of settings whose value is not recognized; never values. */
  invalidSettings: string[];
  /** Every setting the selected backend requires is present. */
  complete: boolean;
  resolution: WorkspaceStorageResolutionOutcome;
}

function classifySelector(value?: string): WorkspaceStorageSelectorStatus {
  if (!value?.trim()) return 'absent';
  return WORKSPACE_STORAGE_PROVIDER_OPTIONS.includes(
    value.trim().toLowerCase() as WorkspaceStorageProvider
  )
    ? 'valid'
    : 'unrecognized';
}

/**
 * Diagnoses a workspace's Drive settings without changing how the provider
 * resolves. `settings` holds the plaintext config map with credential-tier
 * entries already revealed, as provider resolution sees them.
 */
export function diagnoseWorkspaceStorageSettings(
  workspaceId: string,
  settings: ReadonlyMap<string, string>
): WorkspaceStorageConfigDiagnosis {
  const selectorValue = settings.get(DRIVE_STORAGE_PROVIDER_SECRET);
  const selectedBackend = parseWorkspaceStorageProvider(selectorValue);
  const missingSettings = WORKSPACE_STORAGE_REQUIRED_SETTINGS[
    selectedBackend
  ].filter((name) => !settings.get(name)?.trim());
  const complete = missingSettings.length === 0;
  const selectorStatus = classifySelector(selectorValue);

  return {
    workspaceId,
    selectorStatus,
    selectedBackend,
    missingSettings,
    invalidSettings:
      selectorStatus === 'unrecognized' ? [DRIVE_STORAGE_PROVIDER_SECRET] : [],
    complete,
    resolution:
      selectedBackend === WORKSPACE_STORAGE_PROVIDER_R2 && !complete
        ? 'falls-back-to-supabase'
        : 'serves-selected',
  };
}

/**
 * Reads a workspace's stored Drive settings and diagnoses them.
 *
 * When R2 is selected this reveals the plaintext R2 credentials through the
 * secrets Worker exactly like provider resolution does (two reveals per call),
 * so a secrets Worker failure rejects instead of reporting the credential as
 * missing. Revealed values are dropped before returning; the reveal writes no
 * audit row and counts against no rate limit. It is not called anywhere yet:
 * before any route or operator surface calls it, it must be approved as a new
 * plaintext credential reader and rate-limited.
 */
export async function diagnoseWorkspaceStorageConfig(
  wsId: string
): Promise<WorkspaceStorageConfigDiagnosis> {
  const configMap = createWorkspaceStorageSecretsMap(
    await getSecrets({ wsId, forceAdmin: true })
  );
  const selectedBackend = parseWorkspaceStorageProvider(
    configMap.get(DRIVE_STORAGE_PROVIDER_SECRET)
  );
  const settings =
    selectedBackend === WORKSPACE_STORAGE_PROVIDER_R2
      ? await revealWorkspaceStorageCredentials(
          wsId,
          configMap,
          DRIVE_R2_CREDENTIAL_SECRET_NAMES
        )
      : configMap;

  return diagnoseWorkspaceStorageSettings(wsId, settings);
}

/**
 * Builds the sanitized error for a selected backend with incomplete or
 * unrecognized settings, or returns null when the configuration is usable.
 *
 * This describes the strict target behavior, not current provider
 * resolution: resolution serves Supabase for an unrecognized selector and
 * falls back to Supabase with a warning for incomplete R2 settings. Nothing
 * calls this helper. Throwing its error from resolution would turn those
 * Supabase-served workspaces into failures, so wiring it is a product
 * behavior change that needs a platform docs page and a decision record.
 * The 503 default status is a placeholder until that decision.
 */
export function toStorageConfigurationError(
  diagnosis: WorkspaceStorageConfigDiagnosis
): StorageConfigurationError | null {
  if (diagnosis.complete && diagnosis.invalidSettings.length === 0) {
    return null;
  }

  return new StorageConfigurationError({
    workspaceId: diagnosis.workspaceId,
    backend:
      diagnosis.selectorStatus === 'unrecognized'
        ? null
        : diagnosis.selectedBackend,
    missingSettings: diagnosis.missingSettings,
    invalidSettings: diagnosis.invalidSettings,
  });
}
