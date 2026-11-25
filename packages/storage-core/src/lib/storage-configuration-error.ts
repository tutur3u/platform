import { WorkspaceStorageError } from './storage-download-error';
import type { WorkspaceStorageProvider } from './workspace-storage-config';

export interface StorageConfigurationErrorInput {
  workspaceId: string;
  /** Selected backend, or null when the selector itself is unrecognized. */
  backend: WorkspaceStorageProvider | null;
  missingSettings?: readonly string[];
  invalidSettings?: readonly string[];
}

function describe({
  backend,
  missingSettings = [],
  invalidSettings = [],
}: StorageConfigurationErrorInput) {
  const subject = backend ? `Storage backend "${backend}"` : 'Storage backend';
  const parts = [
    missingSettings.length > 0
      ? `is missing required settings: ${missingSettings.join(', ')}`
      : null,
    invalidSettings.length > 0
      ? `has unrecognized settings: ${invalidSettings.join(', ')}`
      : null,
  ].filter(Boolean);

  return parts.length > 0
    ? `${subject} ${parts.join('; ')}.`
    : `${subject} is not configured correctly.`;
}

/**
 * Raised when a selected storage backend cannot run because required
 * settings are missing or unrecognized. The message and fields carry setting
 * names only, never their values.
 */
export class StorageConfigurationError extends WorkspaceStorageError {
  readonly failureClass = 'configuration' as const;
  readonly workspaceId: string;
  readonly backend: WorkspaceStorageProvider | null;
  readonly missingSettings: readonly string[];
  readonly invalidSettings: readonly string[];

  /**
   * `status` defaults to 503 as a placeholder; the response status for a
   * misconfigured backend is decided when this error is wired into resolution.
   */
  constructor(input: StorageConfigurationErrorInput, status = 503) {
    super(describe(input), status);
    this.workspaceId = input.workspaceId;
    this.backend = input.backend;
    this.missingSettings = [...(input.missingSettings ?? [])];
    this.invalidSettings = [...(input.invalidSettings ?? [])];
  }
}
