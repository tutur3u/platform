import 'server-only';

/**
 * Public entry point for workspace Drive storage. Backend-specific code lives
 * in focused modules: keys, provider configuration, the Supabase adapter, R2
 * list/read, reads, uploads and mutations. Callers import from this path.
 */

export { WorkspaceStorageError } from './storage-download-error';
export {
  createWorkspaceStorageFolderObject,
  deleteWorkspaceStorageFolderByPath,
  deleteWorkspaceStorageObjectByPath,
  renameWorkspaceStorageEntry,
} from './workspace-storage-mutations';
export {
  resolveWorkspaceStorageBackendConfig,
  resolveWorkspaceStorageProvider,
} from './workspace-storage-provider-config';
export type {
  ResolvedWorkspaceStorageConfig,
  WorkspaceStorageListOptions,
  WorkspaceStorageListResult,
  WorkspaceStorageObjectMetadata,
  WorkspaceStorageOverview,
  WorkspaceStorageRawObject,
  WorkspaceStorageResolvedProvider,
  WorkspaceStorageUploadPayload,
} from './workspace-storage-provider-types';
export {
  createWorkspaceStorageSignedReadUrl,
  downloadWorkspaceStorageObjectForProvider,
  getWorkspaceStorageObjectMetadataForProvider,
  getWorkspaceStorageOverview,
  getWorkspaceStorageOverviewForProvider,
  listWorkspaceStorageDirectory,
  listWorkspaceStorageRawObjectsForProvider,
} from './workspace-storage-read';
export {
  createWorkspaceStorageUploadPayload,
  uploadWorkspaceStorageFileDirect,
  uploadWorkspaceStorageFileDirectToProvider,
} from './workspace-storage-upload';
