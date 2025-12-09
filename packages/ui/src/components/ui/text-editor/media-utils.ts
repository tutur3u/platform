import type { SupabaseClient } from '@tuturuuu/supabase';

// Maximum file size limits for media uploads
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

// Default workspace storage quota (100MB)
export const DEFAULT_WORKSPACE_STORAGE_QUOTA = 100 * 1024 * 1024;

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

/**
 * Storage quota error with user-friendly message
 */
export class StorageQuotaError extends Error {
  constructor(
    public currentUsage: number,
    public fileSize: number,
    public quota: number
  ) {
    const wouldBeUsage = currentUsage + fileSize;
    super(
      `Storage quota exceeded. Your workspace is using ${formatBytes(currentUsage)} and this ${formatBytes(fileSize)} file would bring the total to ${formatBytes(wouldBeUsage)}, exceeding the ${formatBytes(quota)} limit. Please delete old files or contact support to upgrade your storage.`
    );
    this.name = 'StorageQuotaError';
  }
}

/**
 * Get the current storage usage for a workspace using the efficient database RPC function.
 * This is O(1) as it uses an indexed query on storage.objects instead of recursive folder traversal.
 *
 * @param supabaseClient - Supabase client instance
 * @param workspaceId - Workspace ID (UUID)
 * @returns Current storage usage in bytes, or null if the query fails
 */
export async function getWorkspaceStorageUsage(
  supabaseClient: SupabaseClient<any>,
  workspaceId: string
): Promise<number | null> {
  try {
    const { data, error } = await supabaseClient.rpc(
      'get_workspace_drive_size',
      {
        ws_id: workspaceId,
      }
    );

    if (error) {
      console.warn('Failed to get workspace storage usage:', error);
      return null;
    }

    return typeof data === 'number' ? data : null;
  } catch (error) {
    console.warn('Error getting workspace storage usage:', error);
    return null;
  }
}

/**
 * Get the storage limit for a workspace from workspace_secrets.
 * Falls back to DEFAULT_WORKSPACE_STORAGE_QUOTA if not configured.
 *
 * @param supabaseClient - Supabase client instance
 * @param workspaceId - Workspace ID (UUID)
 * @returns Storage limit in bytes
 */
export async function getWorkspaceStorageLimit(
  supabaseClient: SupabaseClient<any>,
  workspaceId: string
): Promise<number> {
  try {
    const { data, error } = await supabaseClient.rpc(
      'get_workspace_storage_limit',
      {
        ws_id: workspaceId,
      }
    );

    if (error) {
      console.warn('Failed to get workspace storage limit:', error);
      return DEFAULT_WORKSPACE_STORAGE_QUOTA;
    }

    return typeof data === 'number' ? data : DEFAULT_WORKSPACE_STORAGE_QUOTA;
  } catch (error) {
    console.warn('Error getting workspace storage limit:', error);
    return DEFAULT_WORKSPACE_STORAGE_QUOTA;
  }
}

/**
 * Check if adding a file would exceed workspace storage quota.
 *
 * This function uses efficient database RPC calls instead of recursive folder traversal.
 * The database has a trigger `enforce_workspace_storage_limit` that also validates this
 * on insert/update, but this pre-check provides a better user experience by failing
 * fast before attempting the upload.
 *
 * @param supabaseClient - Supabase client instance
 * @param workspaceId - Workspace ID (UUID)
 * @param fileSize - Size of file to be uploaded in bytes
 * @param quota - Optional storage quota override (if not provided, fetched from database)
 * @throws {StorageQuotaError} If quota would be exceeded
 */
export async function checkStorageQuota(
  supabaseClient: SupabaseClient<any>,
  workspaceId: string,
  fileSize: number,
  quota?: number
): Promise<void> {
  try {
    // Fetch current usage and limit in parallel for efficiency
    const [currentUsage, storageLimit] = await Promise.all([
      getWorkspaceStorageUsage(supabaseClient, workspaceId),
      quota !== undefined
        ? Promise.resolve(quota)
        : getWorkspaceStorageLimit(supabaseClient, workspaceId),
    ]);

    // If we couldn't get the current usage, don't block the upload
    // The database trigger will still enforce the limit
    if (currentUsage === null) {
      return;
    }

    // Check if adding this file would exceed quota
    if (currentUsage + fileSize > storageLimit) {
      throw new StorageQuotaError(currentUsage, fileSize, storageLimit);
    }
  } catch (error) {
    // Re-throw StorageQuotaError
    if (error instanceof StorageQuotaError) {
      throw error;
    }
    // Log other errors but don't block upload
    // The database trigger will still enforce the limit
    console.warn('Error checking storage quota:', error);
  }
}

/**
 * Load an image file and get its natural dimensions
 */
export function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Load a video file and get its natural dimensions
 */
export function getVideoDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };

    video.src = url;
  });
}
