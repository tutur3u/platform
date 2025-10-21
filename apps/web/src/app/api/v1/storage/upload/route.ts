/**
 * Storage Upload API
 * POST /api/v1/storage/upload
 *
 * Uploads a file to the workspace drive
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';

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

      const supabase = await createClient();

      // Construct the full storage path
      const storagePath = path
        ? `${wsId}/${path}/${file.name}`
        : `${wsId}/${file.name}`;

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
