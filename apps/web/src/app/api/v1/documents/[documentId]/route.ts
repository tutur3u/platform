/**
 * Document Operations API
 * GET /api/v1/documents/[documentId] - Get document by ID
 * PATCH /api/v1/documents/[documentId] - Update document
 * DELETE /api/v1/documents/[documentId] - Delete document
 */

import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Request body schema for updating
const updateDocumentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const GET = withApiAuth(
  async (_, { params, context }) => {
    const { wsId } = context;
    const { documentId } = (await params) as unknown as { documentId: string };

    try {
      const supabase = await createClient();

      const { data: document, error } = await supabase
        .from('workspace_documents')
        .select('id, name, content, is_public, created_at')
        .eq('id', documentId)
        .eq('ws_id', wsId)
        .single();

      if (error || !document) {
        console.error('Error fetching document:', error);
        return createErrorResponse(
          'Not Found',
          'Document not found',
          404,
          'DOCUMENT_NOT_FOUND'
        );
      }

      return NextResponse.json({ data: document });
    } catch (error) {
      console.error('Unexpected error fetching document:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_documents'] }
);

export const PATCH = withApiAuth(
  async (request, { params, context }) => {
    const { wsId } = context;
    const { documentId } = (await params) as unknown as { documentId: string };

    // Validate request body
    const bodyResult = await validateRequestBody(request, updateDocumentSchema);
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const { name, content, isPublic } = bodyResult.data;

    // Check if at least one field is being updated
    if (!name && !content && isPublic === undefined) {
      return createErrorResponse(
        'Bad Request',
        'At least one field must be provided for update',
        400,
        'NO_UPDATE_FIELDS'
      );
    }

    try {
      const supabase = await createClient();

      // Build update object
      const updateData: Record<string, unknown> = {};
      if (name) updateData.name = name;
      if (content) updateData.content = content;
      if (isPublic !== undefined) updateData.is_public = isPublic;

      const { data: document, error } = await supabase
        .from('workspace_documents')
        .update(updateData)
        .eq('id', documentId)
        .eq('ws_id', wsId)
        .select('id, name, content, is_public, created_at')
        .single();

      if (error || !document) {
        console.error('Error updating document:', error);

        if (error?.code === 'PGRST116') {
          return createErrorResponse(
            'Not Found',
            'Document not found',
            404,
            'DOCUMENT_NOT_FOUND'
          );
        }

        return createErrorResponse(
          'Internal Server Error',
          'Failed to update document',
          500,
          'DOCUMENTS_UPDATE_ERROR'
        );
      }

      return NextResponse.json({
        message: 'Document updated successfully',
        data: document,
      });
    } catch (error) {
      console.error('Unexpected error updating document:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_documents'] }
);

export const DELETE = withApiAuth(
  async (_, { params, context }) => {
    const { wsId } = context;
    const { documentId } = (await params) as unknown as { documentId: string };

    try {
      const supabase = await createClient();

      const { error } = await supabase
        .from('workspace_documents')
        .delete()
        .eq('id', documentId)
        .eq('ws_id', wsId);

      if (error) {
        console.error('Error deleting document:', error);

        if (error.code === 'PGRST116') {
          return createErrorResponse(
            'Not Found',
            'Document not found',
            404,
            'DOCUMENT_NOT_FOUND'
          );
        }

        return createErrorResponse(
          'Internal Server Error',
          'Failed to delete document',
          500,
          'DOCUMENTS_DELETE_ERROR'
        );
      }

      return NextResponse.json({
        message: 'Document deleted successfully',
      });
    } catch (error) {
      console.error('Unexpected error deleting document:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_documents'] }
);
