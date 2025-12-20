/**
 * Storage Upload API
 * POST /api/v1/storage/upload
 *
 * Uploads a file to the workspace drive
 */

import { posix } from 'node:path';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';

// Route segment config for large file uploads
export const maxDuration = 60; // 60 seconds timeout for uploads // Use Node.js runtime for better FormData handling

// Configurable allowlist of acceptable MIME types and extensions
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain',
  'text/csv',
  'text/markdown',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  // Other
  'application/json',
]);

const ALLOWED_EXTENSIONS = new Set([
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  // Documents
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  // Text
  '.txt',
  '.csv',
  '.md',
  // Archives
  '.zip',
  // Other
  '.json',
]);

export const POST = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    try {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const path = (formData.get('path') as string) || '';
      const upsert = formData.get('upsert') === 'true';

      if (!file) {
        return createErrorResponse(
          'Bad Request',
          'Missing file in request body',
          400,
          'MISSING_FILE'
        );
      }

      // Validate file size (100 MB limit)
      const maxSize = 100 * 1024 * 1024; // 100 MB
      if (file.size > maxSize) {
        return createErrorResponse(
          'Payload Too Large',
          'File size exceeds 100 MB limit',
          413,
          'FILE_TOO_LARGE'
        );
      }

      // Validate file type with stricter checks
      const lastDotIndex = file.name.lastIndexOf('.');
      const fileExtension =
        lastDotIndex === -1
          ? '' // No extension found
          : file.name.substring(lastDotIndex).toLowerCase();

      // Perform conditional validation based on available information
      let isValid = false;

      if (file.type && fileExtension) {
        // Both MIME type and extension present - require both to pass
        isValid =
          ALLOWED_MIME_TYPES.has(file.type) &&
          ALLOWED_EXTENSIONS.has(fileExtension);
      } else if (file.type) {
        // Only MIME type present (or no extension)
        isValid = ALLOWED_MIME_TYPES.has(file.type);
      } else if (fileExtension) {
        // Only extension present (no MIME type)
        isValid = ALLOWED_EXTENSIONS.has(fileExtension);
      } else {
        // No MIME type and no extension - reject
        isValid = false;
      }

      if (!isValid) {
        return createErrorResponse(
          'Unsupported Media Type',
          `File type not allowed. Both MIME type and file extension must be valid. Supported types: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`,
          415,
          'FILE_TYPE_NOT_ALLOWED'
        );
      }

      // Sanitize the provided path
      const sanitizedPath = sanitizePath(path);
      if (sanitizedPath === null) {
        return createErrorResponse(
          'Bad Request',
          'Invalid path: path contains illegal characters or directory traversal attempts',
          400,
          'INVALID_PATH'
        );
      }

      // Sanitize the filename
      const sanitizedFilename = sanitizeFilename(file.name);
      if (!sanitizedFilename) {
        return createErrorResponse(
          'Bad Request',
          'Invalid filename: filename contains illegal characters or directory traversal attempts',
          400,
          'INVALID_FILENAME'
        );
      }

      const supabase = await createDynamicAdminClient();

      // Construct the storage path relative to bucket
      // Path format matches Drive page: [wsId]/[path]/[filename]
      const storagePath = sanitizedPath
        ? posix.join(wsId, sanitizedPath, sanitizedFilename)
        : posix.join(wsId, sanitizedFilename);

      // Convert File to ArrayBuffer for upload
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('workspaces')
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert,
        });

      if (error) {
        console.error('Error uploading file:', error);

        // Handle specific error cases
        if (error.message.includes('duplicate')) {
          return createErrorResponse(
            'Conflict',
            'File already exists. Set upsert=true to overwrite.',
            409,
            'FILE_EXISTS'
          );
        }

        return createErrorResponse(
          'Internal Server Error',
          'Failed to upload file',
          500,
          'STORAGE_UPLOAD_ERROR'
        );
      }

      // Strip "[wsId]/" prefix from path to return relative path
      const prefix = `${wsId}/`;
      const relativePath = data.path.startsWith(prefix)
        ? data.path.substring(prefix.length)
        : data.path;

      return NextResponse.json({
        message: 'File uploaded successfully',
        data: {
          path: relativePath,
          fullPath: data.fullPath ?? storagePath,
        },
      });
    } catch (error) {
      console.error('Upload error:', error);
      return createErrorResponse(
        'Internal Server Error',
        error instanceof Error ? error.message : 'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  {
    permissions: ['manage_drive'],
    rateLimit: { windowMs: 60000, maxRequests: 20 }, // 20 uploads per minute
  }
);
