/**
 * Storage Folders API
 * POST /api/v1/storage/folders
 *
 * Creates a new folder in the workspace drive
 */

import { posix } from 'node:path';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { sanitizeFolderName, sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';

// Request body schema
const createFolderSchema = z.object({
  path: z.string(), // Parent path where folder should be created
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[a-zA-Z0-9-_\s]+$/,
      'Folder name can only contain letters, numbers, spaces, hyphens, and underscores'
    ), // Folder name with validation
});

const EMPTY_FOLDER_PLACEHOLDER = '.emptyFolderPlaceholder';

export const POST = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    // Validate request body
    const bodyResult = await validateRequestBody(request, createFolderSchema);
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const { path, name } = bodyResult.data;

    try {
      // Sanitize the parent path
      const sanitizedPath = sanitizePath(path);
      if (sanitizedPath === null) {
        return createErrorResponse(
          'Bad Request',
          'Invalid path: path contains illegal characters or directory traversal attempts',
          400,
          'INVALID_PATH'
        );
      }

      // Sanitize the folder name
      const sanitizedName = sanitizeFolderName(name);
      if (!sanitizedName) {
        return createErrorResponse(
          'Bad Request',
          'Invalid folder name: name contains illegal characters or directory traversal attempts',
          400,
          'INVALID_FOLDER_NAME'
        );
      }

      const supabase = await createDynamicAdminClient();

      // Construct the full folder path using posix.join to prevent traversal
      const folderPath = sanitizedPath
        ? posix.join(
            wsId,
            sanitizedPath,
            sanitizedName,
            EMPTY_FOLDER_PLACEHOLDER
          )
        : posix.join(wsId, sanitizedName, EMPTY_FOLDER_PLACEHOLDER);

      // Build the relative path for the response (without workspace ID)
      const relativePath = sanitizedPath
        ? posix.join(sanitizedPath, sanitizedName)
        : sanitizedName;

      // Create an empty placeholder file to represent the folder
      // Supabase Storage doesn't support empty folders, so we use a placeholder
      const { data, error } = await supabase.storage
        .from('workspaces')
        .upload(folderPath, new Uint8Array(0), {
          contentType: 'text/plain',
          upsert: false,
        });

      if (error) {
        console.error('Error creating folder:', error);

        if (error.message.includes('duplicate')) {
          return createErrorResponse(
            'Conflict',
            'Folder already exists',
            409,
            'FOLDER_EXISTS'
          );
        }

        return createErrorResponse(
          'Internal Server Error',
          'Failed to create folder',
          500,
          'STORAGE_CREATE_FOLDER_ERROR'
        );
      }

      return NextResponse.json({
        message: 'Folder created successfully',
        data: {
          path: relativePath,
          fullPath: data.path,
        },
      });
    } catch (error) {
      console.error('Unexpected error creating folder:', error);
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
