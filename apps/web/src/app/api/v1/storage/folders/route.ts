/**
 * Storage Folders API
 * POST /api/v1/storage/folders
 *
 * Creates a new folder in the workspace drive
 */

import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Request body schema
const createFolderSchema = z.object({
  path: z.string(), // Parent path where folder should be created
  name: z.string().min(1).max(255), // Folder name
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

    // Validate folder name (no special characters except - and _)
    if (!/^[a-zA-Z0-9-_\s]+$/.test(name)) {
      return createErrorResponse(
        'Bad Request',
        'Folder name can only contain letters, numbers, spaces, hyphens, and underscores',
        400,
        'INVALID_FOLDER_NAME'
      );
    }

    try {
      const supabase = await createClient();

      // Construct the full folder path
      const folderPath = path
        ? `${wsId}/${path}/${name}/${EMPTY_FOLDER_PLACEHOLDER}`
        : `${wsId}/${name}/${EMPTY_FOLDER_PLACEHOLDER}`;

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
          path: path ? `${path}/${name}` : name,
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
