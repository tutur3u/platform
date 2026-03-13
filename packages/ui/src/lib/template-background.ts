import type { StatedFile } from '@tuturuuu/ui/custom/file-uploader';

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface UploadTemplateBackgroundResult {
  url: string;
  path: string;
}

async function getTemplateBackgroundUploadUrl(
  wsId: string,
  filename: string
): Promise<{ signedUrl: string; token: string; path: string }> {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/templates/upload-url`,
    {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      body.error ?? `Failed to generate upload URL (HTTP ${response.status})`
    );
  }

  return (await response.json()) as {
    signedUrl: string;
    token: string;
    path: string;
  };
}

/**
 * Uploads a background image for a board template to Supabase Storage
 * @param file - The image file to upload
 * @param wsId - The workspace ID
 * @returns The public URL and storage path of the uploaded image
 */
export async function uploadTemplateBackground(
  file: File,
  wsId: string
): Promise<UploadTemplateBackgroundResult> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      'Invalid file type. Only PNG, JPEG, and WebP images are allowed.'
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 5MB limit.');
  }

  const { signedUrl, token, path } = await getTemplateBackgroundUploadUrl(
    wsId,
    file.name
  );

  const uploadResponse = await fetch(signedUrl, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text().catch(() => '');
    throw new Error(
      `Failed to upload background image (${uploadResponse.status})${text ? `: ${text}` : ''}`
    );
  }

  return {
    url: URL.createObjectURL(file),
    path,
  };
}

/**
 * Deletes a background image from Supabase Storage
 * @param path - The storage path of the image to delete
 */
export async function deleteTemplateBackground(
  wsId: string,
  path: string
): Promise<void> {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/templates/background`,
    {
      method: 'DELETE',
      cache: 'no-store',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? 'Failed to delete background image');
  }
}

/**
 * Helper function to handle file upload with the FileUploader component
 * @param files - Array of StatedFile from FileUploader
 * @param wsId - The workspace ID
 * @param onSuccess - Callback when upload succeeds
 * @param onError - Callback when upload fails
 */
export async function handleTemplateBackgroundUpload(
  files: StatedFile[],
  wsId: string,
  onSuccess: (url: string, path: string) => void,
  onError?: (error: string) => void
): Promise<void> {
  if (files.length === 0) {
    return;
  }

  const file = files[0]; // Only support one background image

  if (!file) {
    onError?.('No file selected for upload');
    return;
  }

  try {
    file.status = 'uploading';

    const result = await uploadTemplateBackground(file.rawFile, wsId);

    file.status = 'uploaded';
    file.finalPath = result.path;

    onSuccess(result.url, result.path);
  } catch (error) {
    file.status = 'error';
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to upload image';
    onError?.(errorMessage);
  }
}
