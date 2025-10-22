/**
 * Storage Upload API
 * POST /api/v1/storage/upload
 *
 * Uploads a file to the workspace drive
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';
import { basename, posix } from 'node:path';

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

/**
 * Sanitizes a path component to prevent directory traversal
 */
function sanitizePath(path: string): string | null {
  if (!path) return '';

  // Trim and remove leading/trailing slashes
  let sanitized = path.trim().replace(/^\/+|\/+$/g, '');

  // Split into segments and validate each
  const segments = sanitized.split('/').filter(Boolean);

  for (const segment of segments) {
    // Reject any segment that is '..' or '.'
    if (segment === '..' || segment === '.') {
      return null;
    }
    // Reject segments with path traversal attempts
    if (segment.includes('..') || segment.includes('./')) {
      return null;
    }
  }

  // Rejoin with forward slashes
  return segments.join('/');
}

/**
 * Sanitizes a filename to prevent directory traversal and invalid characters
 */
function sanitizeFilename(filename: string): string | null {
  if (!filename) return null;

  // Get the basename to remove any path components
  const base = basename(filename);

  // Reject if basename differs from original (indicates path traversal attempt)
  if (base !== filename) {
    return null;
  }

  // Reject filenames with dangerous characters
  if (/[<>:"|?*\x00-\x1F]/.test(base)) {
    return null;
  }

  return base;
}

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
          'Bad Request',
          'File size exceeds 100 MB limit',
          413,
          'FILE_TOO_LARGE'
        );
      }

      // Validate file type
      const fileExtension = file.name
        .substring(file.name.lastIndexOf('.'))
        .toLowerCase();

      if (
        !ALLOWED_MIME_TYPES.has(file.type) &&
        !ALLOWED_EXTENSIONS.has(fileExtension)
      ) {
        return createErrorResponse(
          'Unsupported Media Type',
          `File type not allowed. Supported types: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`,
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

      const supabase = await createClient();

      // Construct the full storage path using safe joining
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

      return NextResponse.json({
        message: 'File uploaded successfully',
        data: {
          path: data.path,
          fullPath: data.fullPath,
        },
      });
    } catch (error) {
      console.error('Unexpected error uploading file:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_drive'] }
);
