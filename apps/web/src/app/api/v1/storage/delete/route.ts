/**
 * Storage Delete API
 * DELETE /api/v1/storage/delete
 *
 * Deletes files or folders from the workspace drive
 */

import { posix } from 'node:path';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';

// Request body schema
const deleteBodySchema = z.object({
  paths: z.array(z.string()).min(1).max(100), // Allow batch delete up to 100 files
});

/**
 * Sanitizes and validates a path to prevent path traversal attacks
 * @param path - The user-provided path
 * @returns Sanitized path or null if invalid
 */
function sanitizePath(path: string): string | null {
  // Trim whitespace
  const trimmed = path.trim();

  // Reject empty paths
  if (!trimmed) {
    return null;
  }

  // Remove leading slashes (prevent absolute paths)
  const withoutLeadingSlash = trimmed.replace(/^\/+/, '');

  // Normalize the path using POSIX normalization
  const normalized = posix.normalize(withoutLeadingSlash);

  // Reject paths that contain '..' or start with '../'
  if (normalized.includes('..') || normalized.startsWith('../')) {
    return null;
  }

  // Reject paths that try to escape the workspace root
  if (normalized.startsWith('/') || posix.isAbsolute(normalized)) {
    return null;
  }

  return normalized;
}

export const DELETE = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    // Validate request body
    const bodyResult = await validateRequestBody(request, deleteBodySchema);
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const { paths } = bodyResult.data;

    try {
      const supabase = await createDynamicAdminClient();

      // Sanitize and validate all paths
      const sanitizedPaths: string[] = [];
      for (const path of paths) {
        const sanitized = sanitizePath(path);
        if (!sanitized) {
          return createErrorResponse(
            'Bad Request',
            `Invalid path: ${path}. Paths cannot contain '..' or be absolute paths.`,
            400,
            'INVALID_PATH'
          );
        }
        sanitizedPaths.push(sanitized);
      }

      // Construct full storage paths with sanitized paths
      const storagePaths = sanitizedPaths.map((path) => `${wsId}/${path}`);

      // Delete files from Supabase Storage
      const { data, error } = await supabase.storage
        .from('workspaces')
        .remove(storagePaths);

      if (error) {
        console.error('Error deleting files:', error);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to delete files',
          500,
          'STORAGE_DELETE_ERROR'
        );
      }

      return NextResponse.json({
        message: `Successfully deleted ${data.length} file(s)`,
        data: {
          deleted: data.length,
          paths: sanitizedPaths, // Return the original requested paths that were deleted
        },
      });
    } catch (error) {
      console.error('Unexpected error deleting files:', error);
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
