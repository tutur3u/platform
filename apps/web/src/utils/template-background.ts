import { createClient } from '@tuturuuu/supabase/next/client';
import type { StatedFile } from '@tuturuuu/ui/custom/file-uploader';
import { v4 as uuidv4 } from 'uuid';

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
  // Validate file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      'Invalid file type. Only PNG, JPEG, and WebP images are allowed.'
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 5MB limit.');
  }

  const supabase = createClient();

  // Generate unique filename
  const uniqueId = uuidv4();
  const sanitizedName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-');
  const storagePath = `${wsId}/template-backgrounds/${uniqueId}-${sanitizedName}`;

  // Convert File to ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('workspaces')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error('Error uploading template background:', error);
    throw new Error('Failed to upload background image');
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from('workspaces').getPublicUrl(data.path);

  return {
    url: publicUrl,
    path: data.path,
  };
}

/**
 * Deletes a background image from Supabase Storage
 * @param path - The storage path of the image to delete
 */
export async function deleteTemplateBackground(path: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.storage.from('workspaces').remove([path]);

  if (error) {
    console.error('Error deleting template background:', error);
    throw new Error('Failed to delete background image');
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
    // Update file status to uploading
    file.status = 'uploading';

    const result = await uploadTemplateBackground(file.rawFile, wsId);

    // Update file status to uploaded
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
