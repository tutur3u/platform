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
 * Check if adding a file would exceed workspace storage quota
 * @param supabaseClient - Supabase client instance
 * @param workspaceId - Workspace ID
 * @param fileSize - Size of file to be uploaded
 * @param quota - Storage quota in bytes (defaults to DEFAULT_WORKSPACE_STORAGE_QUOTA)
 * @throws {StorageQuotaError} If quota would be exceeded
 */
export async function checkStorageQuota(
  supabaseClient: any,
  workspaceId: string,
  fileSize: number,
  quota: number = DEFAULT_WORKSPACE_STORAGE_QUOTA
): Promise<void> {
  try {
    // Check if workspace folder exists
    const { error: listError } = await supabaseClient.storage
      .from('workspaces')
      .list(workspaceId, {
        limit: 1,
      });

    if (listError) {
      console.warn('Failed to check storage quota:', listError);
      // Don't block upload if we can't check quota
      return;
    }

    // Calculate current usage by summing all file sizes recursively
    let currentUsage = 0;
    const calculateFolderSize = async (prefix: string = workspaceId) => {
      const { data: items } = await supabaseClient.storage
        .from('workspaces')
        .list(prefix, { limit: 1000 });

      if (!items) return;

      for (const item of items) {
        if (item.metadata) {
          // It's a file
          currentUsage += item.metadata.size || 0;
        } else {
          // It's a folder, recurse
          await calculateFolderSize(`${prefix}/${item.name}`);
        }
      }
    };

    await calculateFolderSize();

    // Check if adding this file would exceed quota
    if (currentUsage + fileSize > quota) {
      throw new StorageQuotaError(currentUsage, fileSize, quota);
    }
  } catch (error) {
    // Re-throw StorageQuotaError
    if (error instanceof StorageQuotaError) {
      throw error;
    }
    // Log other errors but don't block upload
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
