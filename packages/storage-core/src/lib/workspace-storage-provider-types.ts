import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import type {
  WORKSPACE_STORAGE_PROVIDER_R2,
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  WorkspaceStorageProvider,
} from './workspace-storage-config';
import type { WorkspaceStorageSortBy } from './workspace-storage-listing';

export interface WorkspaceStorageUploadPayload {
  signedUrl: string;
  token?: string;
  headers?: Record<string, string>;
  path: string;
  fullPath: string;
  filename: string;
  contentType?: string;
  provider: WorkspaceStorageProvider;
}

export interface WorkspaceStorageOverview {
  provider: WorkspaceStorageProvider;
  totalSize: number;
  fileCount: number;
  largestFile: {
    name: string;
    size: number;
    createdAt?: string | null;
  } | null;
  smallestFile: {
    name: string;
    size: number;
    createdAt?: string | null;
  } | null;
  storageLimit: number;
}

export interface WorkspaceStorageListOptions {
  allowReservedMobileDeploymentVault?: boolean;
  path?: string;
  /** Owning-API listing inside this service-only root; see drive-path-policy. */
  serviceRoot?: 'external-projects';
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: WorkspaceStorageSortBy;
  sortOrder?: 'asc' | 'desc';
}

export interface WorkspaceStorageListResult {
  data: StorageObject[];
  total: number;
  hasMore: boolean;
  provider: WorkspaceStorageProvider;
}

export interface WorkspaceStorageResolvedProvider {
  provider: WorkspaceStorageProvider;
  misconfigured: boolean;
}

export interface WorkspaceStorageRawObject {
  path: string;
  fullPath: string;
  size: number;
  contentType?: string | null;
  updatedAt?: string | null;
  isFolderPlaceholder: boolean;
}

export interface WorkspaceStorageObjectMetadata {
  provider: WorkspaceStorageProvider;
  path: string;
  fullPath: string;
  size: number;
  contentType?: string | null;
  updatedAt?: string | null;
}

export interface WorkspaceStorageRawListOptions {
  allowReservedMobileDeploymentVault?: boolean;
  pathPrefix?: string;
  limit?: number;
}

export type ResolvedWorkspaceStorageConfig =
  | {
      provider: typeof WORKSPACE_STORAGE_PROVIDER_SUPABASE;
      misconfigured: boolean;
    }
  | {
      provider: typeof WORKSPACE_STORAGE_PROVIDER_R2;
      misconfigured: boolean;
      bucket: string;
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
    };

export type R2ListEntry = {
  key: string;
  name: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  size?: number;
  etag?: string | null;
};
