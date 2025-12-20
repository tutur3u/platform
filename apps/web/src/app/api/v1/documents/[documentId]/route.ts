/**
 * Document Operations API
 * GET /api/v1/documents/[documentId] - Get document by ID
 * PATCH /api/v1/documents/[documentId] - Update document
 * DELETE /api/v1/documents/[documentId] - Delete document
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { updateDocumentDataSchema } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';

export const GET = withApiAuth<{ documentId: string }>(
  async (_, { params, context }) => {
    const { wsId } = context;
    const { documentId } = params;

    try {
      const supabase = await createClient();

      const { data: document, error } = await supabase
        .from('workspace_documents')
        .select('id, name, content, is_public, created_at')
        .eq('id', documentId)
        .eq('ws_id', wsId)
        .single();

      if (error || !document) {
        // Log error details for debugging (defensively check for error existence)
        if (error) {
          console.error('Error fetching document:', {
            message: error.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
          });

          // Check if this is a true "not found" error (PGRST116 = no rows returned)
          if (error.code === 'PGRST116' || !document) {
            return createErrorResponse(
              'Not Found',
              'Document not found',
              404,
              'DOCUMENT_NOT_FOUND'
            );
          }

          // Other database errors
          return createErrorResponse(
            'Internal Server Error',
            'Failed to fetch document',
            500,
            'DOCUMENT_FETCH_ERROR'
          );
        }

        // No error but no document - treat as not found
        return createErrorResponse(
          'Not Found',
          'Document not found',
          404,
          'DOCUMENT_NOT_FOUND'
        );
      }

      // Map database snake_case to SDK camelCase
      const { is_public, created_at, ...rest } = document;
      return NextResponse.json({
        data: { ...rest, isPublic: is_public, createdAt: created_at },
      });
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

export const PATCH = withApiAuth<{ documentId: string }>(
  async (request, { params, context }) => {
    const { wsId } = context;
    const { documentId } = params;

    // Validate request body
    const bodyResult = await validateRequestBody(
      request,
      updateDocumentDataSchema
    );
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
        // Log error details for debugging (defensively check for error existence)
        if (error) {
          console.error('Error updating document:', {
            message: error.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
          });

          // Check if this is a true "not found" error (PGRST116 = no rows returned)
          if (error.code === 'PGRST116' || !document) {
            return createErrorResponse(
              'Not Found',
              'Document not found',
              404,
              'DOCUMENT_NOT_FOUND'
            );
          }

          // Other database errors
          return createErrorResponse(
            'Internal Server Error',
            'Failed to update document',
            500,
            'DOCUMENTS_UPDATE_ERROR'
          );
        }

        // No error but no document - treat as not found
        return createErrorResponse(
          'Not Found',
          'Document not found',
          404,
          'DOCUMENT_NOT_FOUND'
        );
      }

      // Map database snake_case to SDK camelCase
      const { is_public, created_at, ...rest } = document;
      return NextResponse.json({
        message: 'Document updated successfully',
        data: { ...rest, isPublic: is_public, createdAt: created_at },
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

export const DELETE = withApiAuth<{ documentId: string }>(
  async (_, { params, context }) => {
    const { wsId } = context;
    const { documentId } = params;

    try {
      const supabase = await createClient();

      // Request the deleted id to check if row was actually deleted
      const { data, error } = await supabase
        .from('workspace_documents')
        .delete()
        .eq('id', documentId)
        .eq('ws_id', wsId)
        .select('id');

      if (error) {
        // Log error details for debugging
        console.error('Error deleting document:', {
          message: error.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        });

        return createErrorResponse(
          'Internal Server Error',
          'Failed to delete document',
          500,
          'DOCUMENTS_DELETE_ERROR'
        );
      }

      // Check if any row was deleted
      if (!data || data.length === 0) {
        return createErrorResponse(
          'Not Found',
          'Document not found',
          404,
          'DOCUMENT_NOT_FOUND'
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
